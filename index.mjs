import { Agent, request as request_http } from "http";
import { request as request_https, Agent as AgentHTTPS } from "https";
import { connect as tlsConnect } from "tls";

const http_connect = request_http;

const debug = {
  enable: process.env.NODE_DEBUG && /\bproxy\b/.test(process.env.NODE_DEBUG),
  id: {
    "http": {
      req: 0,
      tcp: 0
    },
    "https": {
      req: 0,
      tcp: 0
    }
  },
  socketsMap: new WeakMap()
};

class ProxyTunnel {
  constructor(proxy, proxyHeaders = {}, defaultHeaders = {}) {
    this.proxy = proxy instanceof URL ? proxy : new URL(proxy);
    this.proxyHeaders = proxyHeaders;
    this.defaultHeaders = {
      "User-Agent": `node ${process.version}`,
      "Accept": "*/*",
      ...defaultHeaders
    };

    this.httpAgent = new Agent({
      keepAlive: true
    });
    this.httpsAgent = new AgentHTTPS({
      keepAlive: true
    });
    this.httpsAgent.createConnection = this.createSecureConnection.bind(this);
  }

  createSecureConnection({ host: hostname, port }, cb) {
    http_connect(
      this.proxy,
      {
        method: "CONNECT",
        agent: this.httpAgent,
        path: `${hostname}:${port}`,
        headers: {
          "Host": `${hostname}:${port}`,
          ...this.proxyHeaders
        }
      }
    )
      .once("connect", (response, socket) => {
        if (response.statusCode === 200) {
          return cb(null, tlsConnect({
            host: hostname,
            servername: hostname,
            port: port,
            socket: socket
          }));
        } else {
          socket.destroy();
          return cb(connectErrored(`${response.statusCode} ${response.statusMessage}`));
        }
      })
      .once("error", err => cb(connectErrored(err)))
      .end();
  }

  destroy() {
    this.httpsAgent.destroy();
    this.httpAgent.destroy();
  }

  async fetch(url, options = {}) {
    const uriObject = url instanceof URL ? url : new URL(url);
    const headers = options.headers || this.defaultHeaders;
    delete options.headers;

    const request = (
      uriObject.protocol === "https:"
        ? request_https(
            uriObject,
            {
              agent: this.httpsAgent,
              headers: {
                // "Persist": uriObject.hostname,
                // "Connection": "keep-alive, persist",
                ...headers
              },
              ...options
            }
          )
        : request_http(
            this.proxy,
            {
              path: uriObject.toString(),
              agent: this.httpAgent,
              headers: {
                Host: constructHost(uriObject),
                ...this.proxyHeaders,
                ...headers
              },
              setHost: false,
              ...options
            }
          )
    );

    return new Promise((resolve, reject) => {
      request
        .once("response", resolve)
        .once("error", err => {
          if (request.reusedSocket && err.code === 'ECONNRESET') {
            request.removeListener("response", resolve);
            this.fetch.apply(this, arguments).then(resolve, reject);
          } else {
            return reject(err);
          }
        })
        .end()
      ;

      /**
       * DEBUG
       */
      if (debug.enable) {
        const protocol = request.protocol.replace(/(?<=https?):/, "");
        const id = debug.id[protocol];
        const socketName = ["socket", "tlsSocket"][Number(protocol === "https")];
        
        const id_req = ++id.req;
        request
          .once("socket", socket => {
            if (debug.socketsMap.has(socket)) {
              console.info(
                "\x1b[36m%s\x1b[0m", // cyan
                `✓  ${protocol} request ${id_req} reusing ${socketName} ${debug.socketsMap.get(socket)}`
              );
            } else {
              const id_tcp = ++id.tcp;

              debug.socketsMap.set(socket, id_tcp);
              console.info(`-  ${protocol} request ${id_req} using new ${socketName} ${id_tcp}`);
              
              socket.once("close", errored => {
                const log = [];
                if(request.reusedSocket) {
                  log.push("\x1b[33m%s\x1b[0m"); // yellow
                  log.push("Reused");
                } else {
                  log.push("✕  ");
                }

                log.push(`${socketName} ${id_tcp} for ${protocol} request ${id_req} closed`);

                if(errored) {
                  log.push("\x1b[31mWITH ERROR\x1b[0m"); // red
                }
                console.info.apply(void 0, log);
              });
            }
          })
          .once("close", () => console.info(`☓  ${protocol} request ${id_req} closed connection`));
      }
      /**
       * DEBUG END
       */
    });
  }
}

export default ProxyTunnel;

function connectErrored(err) {
  return `connecting to proxy failed with ${err.stack || err}`;
}

function constructHost(uriObject) {
  let port = uriObject.port;

  if (!port) {
    if (uriObject.protocol === "https:") {
      port = "443"
    } else {
      port = "80"
    }
  }

  return `${uriObject.hostname}:${port}`;
}