import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

import { connect, Socket } from "net";
import { createServer as server_https } from "https";
import { createServer, request, Server as HTTPServer } from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyAuth = Buffer.from("test:test").toString("base64");
const serverAuth = Buffer.from("test:test-serverauth").toString("base64");

const pipe = (...streams) => {
  const set = new Set(streams);
  const errorHandler = err => {
    set.forEach(s => s.destroy());
    set.clear();
    // throw err;
  }
  set.forEach(s => s.once("error", errorHandler));
  for (let i = 0; i < streams.length - 1; i++) {
    streams[i].pipe(streams[i + 1])
  }
  streams = null;
}

const verifyAuth = (request, socket) => {
  const auth = request.headers['proxy-authorization'];
  if (!auth || auth !== `Basic ${proxyAuth}`) {
    if(socket instanceof Socket) {
      socket.write([
        "HTTP/1.1 407 Proxy Authentication Required",
        'Proxy-Authenticate: Basic realm="proxy"',
        "Proxy-Connection: close"
      ].join('\r\n'));
      socket.end("\r\n\r\n")
    } else {
      const response = socket;
      response.writeHead(407, {
        "Proxy-Authenticate": 'Basic realm="proxy"',
        "Proxy-Connection": 'close'
      }).end();
    }
    return false;
  }
  delete request.headers['proxy-authorization'];
  return true;
}

function createProxyServer (port) {
  return {
    auth: proxyAuth,
    proxyServer: createServer((req, res) => {
      // relay http request
      if(!verifyAuth(req, res))
        return ;
      try {
        const tmpErrorHandler = err => {
          // for testing retry
          // res.destroy();
          res.writeHead(500, err.message).end();
          throw err;
        };

        const serverReq = request(req.url, {
          method: req.method,
          headers: {
            "Authorization": `Basic ${serverAuth}`,
            ...req.headers,
          }
        })
          .once("response", serverRes => {
            serverReq.removeListener("error", tmpErrorHandler);
            res.writeHead(
              serverRes.statusCode,
              serverRes.statusMessage,
              serverRes.headers
            );
            pipe(serverRes, res);
          })
          .once("error", tmpErrorHandler);
        ;

        pipe(req, serverReq);
      } catch (err) {
        res.writeHead(400).end("Bad Request");
        throw err;
      }
    }).unref()
      .listen(port || 0)
      .on("connect", (request, socket, head) => {
        // http connect method
        if(!verifyAuth(request, socket))
          return ;

        try {
          let { 0: hostname, 1: port = 80 } = request.url.split(/:(?=\d*$)/);

          const tmpErrorHandler = err => {
            socket.end(`HTTP/1.1 500 ${err.message}\r\n\r\n`);
            throw err;
          }

          if(/^\[.+?\]$/.test(hostname))
            hostname = hostname.replace(/^\[(.+?)\]$/, (_, hostname) => hostname);

          const serverSocket = connect(port, hostname, () => {
            socket.write([
              "HTTP/1.1 200 Connection Established",
              "X-Proxy-Agent: node forward-proxy-tunnel test"
            ].join("\r\n"));
            socket.write("\r\n\r\n");

            serverSocket.removeListener("error", tmpErrorHandler);

            pipe(socket, serverSocket, socket);
          })
            .once("error", tmpErrorHandler)
          ; 
          serverSocket.write(head);
        } catch (err) {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
          throw err;
        }
      })
      .on("error", err => { throw err })
  };
}

const auth = req => {
  if(req.headers["authorization"] === `Basic ${serverAuth}`) {
    return true;
  } else {
    return false;
  }
};

function createHTTPServer (port) {
  // const startTime = Date.now();
  // let dropped = 0;
  return createServer((req, res) => {
    if(auth(req)) {
      return res.writeHead(200).end("okay");
    } else {
      return res.writeHead(403).end("authorization field required");
    }
  })
    .unref()
    .on("connection", socket => {
      // for testing retry
      // not having any idea about how to detect socket reuse
      // in server side... So here comes the hacky way.
      // if(dropped < 2 && Date.now() - startTime > 100)
      //   ++dropped && socket.destroy();
    })
    .listen(port || 0)
  ;
}

function createHTTPSServer(port) {
  return server_https(
    {
      key: readFileSync(join(__dirname, './cert.key')),
      cert: readFileSync(join(__dirname, './cert.pem'))
    },
    (req, res) => {
      if(auth(req)) {
        res.socket.setKeepAlive(true);
        res.socket.setTimeout(30000);
        res.writeHead(200).end("okay");
      } else {
        return res.writeHead(403).end("authorization field required");
      }
    }
  ) .unref()
    .listen(port || 0)
}

function getServerAddress(server) {
  const protocol = server instanceof HTTPServer ? "http:" : "https:";

  const address = server.address();
  return (
    address.family === "IPv6"
    ? `${protocol}//[${address.address}]:${address.port}`
    : `${protocol}//${address.address}:${address.port}`
  );
}

export { createProxyServer, createHTTPServer, createHTTPSServer, getServerAddress };