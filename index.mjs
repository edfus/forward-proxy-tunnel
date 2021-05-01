import { Agent, request as request_http } from "http";
import { request as request_https, Agent as AgentHTTPS } from "https";
import { connect as tlsConnect } from "tls";
import { Readable, pipeline } from "stream";

const http_connect = request_http;

const debug = {
  enable: process.env.NODE_DEBUG && /\bproxy\b/i.test(process.env.NODE_DEBUG),
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

const colorEnabled = checkIsColorEnabled(process.stdout);
let stripAnsiRegEx;

class ProxyTunnel {
  constructor(proxy, {
    proxyHeaders = {},
    defaultHeaders = {},
    agentOptions
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

  createSecureConnection(options, cb) {
    const { host: hostname, port } = options;
    
    return this.createConnection(
      options,
      (err, socket) => {
        if(err)
          return cb(err);

        return cb(null, tlsConnect({
          host: hostname,
          servername: hostname,
          port: port,
          socket: socket
        }));
      }
    );
  }

  createConnection({ host: hostname, port }, cb) {
    const host = constructHost({ hostname, port });
    const onerror = err => cb(connectErrored(err));

    const req = http_connect(
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
          req.removeListener("error", onerror);
          return cb(null, socket);
        } else {
          socket.destroy();
          return cb(connectErrored(`${response.statusCode} ${response.statusMessage}`));
        }
      })
      .once("error", onerror)
      .end();
  }

  destroy() {
    this.httpsAgent.destroy();
    this.httpAgent.destroy();
  }

  parseRequestParams (input, options, cb) {
    let uriObject;
    
    if(!input)
      throw new TypeError(`Forward-proxy-tunnel: Unexpected falsy input ${input}`);

    if (typeof input === 'string') {
      uriObject = new URL(input);
      options = Object.assign({}, options);
    } else if (input instanceof URL) {
      uriObject = input;
      options = Object.assign({}, options);
    } else if(typeof input === "object") {
      cb = options;
      options = Object.assign({}, input);
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
      throw new TypeError(`Forward-proxy-tunnel: Unexpected input ${input}`);
    }

    return { uriObject, options, cb }
  }

  request(_input, _options, _cb) {
    const { uriObject, options, cb } = this.parseRequestParams(_input, _options, _cb);

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
        throw new TypeError(`Forward-proxy-tunnel: Expected function, but ${typeof cb} is passed as the callback.`);
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
            info(
              "\x1b[36m%s\x1b[0m", // cyan
              `✓  ${protocol} request ${id_req} reusing ${socketName} ${debug.socketsMap.get(socket)}`
            );
          } else {
            const id_tcp = ++id.tcp;

            debug.socketsMap.set(socket, id_tcp);
            info(`-  ${protocol} request ${id_req} using new ${socketName} ${id_tcp}`);
            
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
              info.apply(void 0, log);
            });
          }
        })
        .once("close", () => info(`☓  ${protocol} request ${id_req} closed connection`));
    }
    /**
     * DEBUG END
     */

    return request;
  }

  async fetch (_input, _options) {
    const { uriObject, options } = this.parseRequestParams(_input, _options);

    const body = options.body;
    delete options.body;

    return (
      new Promise((resolve, reject) => {
        const req = (
          this.request(uriObject, options)
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

        if(body && req.method === "GET") {
          if(!req.getHeader("Content-Length") && !req.getHeader("Transfer-Encoding")) {
            // a malformed request, but let's help with some dirty work
            info(`\x1b[1m\x1b[30mForward-proxy-tunnel: Found a GET request with non-empty body.\x1b[0m`);
            if(body.length) {
              req.setHeader("Content-Length", body.length);
            } else {
              req.setHeader("Transfer-Encoding", "chunked");
            }
          }
        }

        if (body instanceof Readable) {
          pipeline(
            body,
            req,
            err => err && reject(err)
          );
        } else {
          req.end(body);
        }
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

function info (...messages) {
  if(!colorEnabled) {
    if(!stripAnsiRegEx) {
      stripAnsiRegEx = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    }

    messages = messages.map(
      m => m.replace(stripAnsiRegEx, "")
    );
  }
  return console.info.apply(void 0, messages);
}

function checkIsColorEnabled(tty) {
  return "FORCE_COLOR" in process.env
    ? [1, 2, 3, "", true, "1", "2", "3", "true"].includes(process.env.FORCE_COLOR)
    : !(
      "NO_COLOR" in process.env ||
      process.env.NODE_DISABLE_COLORS == 1 // using == by design
    ) && tty.isTTY;
}