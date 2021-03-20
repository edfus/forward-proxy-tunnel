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
  constructor(proxy, {
    proxyHeaders = {},
    defaultHeaders = {},
    agentOptions = {
      keepAlive: true
    }
  } = {}) {
    this.proxy = proxy instanceof URL ? proxy : new URL(proxy);
    this.proxyHeaders = proxyHeaders;
    this.defaultHeaders = {
      "User-Agent": `node ${process.version}`,
      "Accept": "*/*",
      ...defaultHeaders
    };

    this.httpAgent = new Agent(agentOptions);
    this.httpsAgent = new AgentHTTPS(agentOptions);
    this.httpsAgent.createConnection = this.createSecureConnection.bind(this);
  }

  createSecureConnection({ host: hostname, port }, cb) {
    const host = constructHost({ hostname, port });

    http_connect(
      this.proxy,
      {
        method: "CONNECT",
        agent: this.httpAgent,
        path: host,
        setHost: false,
        headers: {
          "Host": host,
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

  request(input, options, cb) {
    options = Object.assign({}, options); // shallow copy
    let uriObject;

    if(!input)
      throw new TypeError(`forward-proxy-tunnel: unexpected falsy input ${input}`);

    if (typeof input === 'string') {
      uriObject = new URL(input);
    } else if (input instanceof URL) {
      uriObject = input;
    } else if(typeof input === "object") {
      cb = options;
      options = input;
      const protocol = options.protocol || "http:";
      const host = options.hostname || options.host;
      const port = options.port || options.defaultPort || protocol === "https:" ? "443" : "80";
      const path = options.path || "/";

      uriObject = new URL(`${protocol}//${host}:${port}${path}`);
      delete options.protocol;
      delete options.hostname;
      delete options.port;
      delete options.defaultPort;
      delete options.path;
    } else {
      throw new TypeError(`forward-proxy-tunnel: unexpected input ${input}`);
    }

    input = null;

    // for http.request.options.path
    if(options.path) {
      uriObject.pathname = options.path;
      delete options.path;
    }

    const headers = options.headers || this.defaultHeaders;
    delete options.headers;

    const request = (
      uriObject.protocol === "https:"
        ? request_https(
            uriObject,
            {
              agent: this.httpsAgent,
              ...options,
              headers: {
                // "Persist": uriObject.hostname,
                // "Connection": "keep-alive, persist",
                ...headers
              }
            }
          )
        : request_http(
            this.proxy,
            {
              path: uriObject.toString(),
              agent: this.httpAgent,
              setHost: false,
              ...options,
              headers: {
                Host: constructHost(uriObject),
                ...this.proxyHeaders,
                ...headers
              }
            }
          )
    );

    if(cb) {
      if(typeof cb === "function")
        request.once("response", cb)
      else
        throw new TypeError(`forward-proxy-tunnel: expected function, but ${typeof cb} is passed as the callback.`);
    }

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

    return request;
  }

  async fetch (...argv) {
    return (
      new Promise((resolve, reject) => {
        const req = (
          this.request.apply(this, argv)
            .once("response", resolve)
            .once("error", err => {
              if (req.reusedSocket && err.code === 'ECONNRESET') {
                req.removeListener("response", resolve);
                this.fetch.apply(this, arguments).then(resolve, reject);
              } else {
                return reject(err);
              }
            })
        );
        req.end();
      })
    );
  }
}

export default ProxyTunnel;

function connectErrored(err) {
  return new Error(`connecting to proxy failed with ${err.stack || err}`);
}

function constructHost(uriObject) {
  let port = uriObject.port;

  if (!port) {
    if (uriObject.protocol === "https:") {
      port = 443
    } else {
      port = 80
    }
  }

  return uriObject.hostname.includes(":")
          ? `[${uriObject.hostname}]:${port}`
          : `${uriObject.hostname}:${port}`
  ;
}