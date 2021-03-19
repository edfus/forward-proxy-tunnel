import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

import { connect, Socket } from "net";
import { createServer as server_https } from "https";
import { createServer, request, Server as HTTPServer } from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyAuth = Buffer.from("test:test").toString("base64");
const serverAuth = Buffer.from("test:test-serverauth").toString("base64");

const redirSocket = (clientSocket, serverSocket, { keepAlive = false } = {}) => {
  clientSocket.pipe(serverSocket).pipe(clientSocket);
  clientSocket.once("error", err => {
    serverSocket.destroy();
    throw err;
  });
  serverSocket.once("error", err => {
    clientSocket.destroy();
    throw err;
  });
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
      socket.end("\r\n\r\n\r\n")
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
          res.writeHead(500, err.message).end();
          throw err;
        };

        const serverReq = request(req.url, {
          headers: {
            "Authorization": `Basic ${serverAuth}`,
            ...req.headers,
          }
        })
          .once("socket", socket => {
            serverReq.removeListener("error", tmpErrorHandler);
            redirSocket(req.socket, socket);
          })
          .once("error", tmpErrorHandler);

          serverReq.end();
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
          const { 0: hostname, 1: port = 80 } = request.url.split(/:(?=\d*$)/);

          const tmpErrorHandler = err => {
            socket.end(`HTTP/1.1 500 ${err.message}\r\n\r\n\r\n`);
            throw err;
          }

          const serverSocket = connect(port, hostname, () => {
            socket.write([
              "HTTP/1.1 200 Connection Established",
              "X-Proxy-Agent: node forward-proxy-tunnel test"
            ].join("\r\n"));
            socket.write("\r\n\r\n\r\n");

            serverSocket.removeListener("error", tmpErrorHandler);

            redirSocket(socket, serverSocket);
          })
            .once("error", tmpErrorHandler)
          ; 
          serverSocket.write(head);
        } catch (err) {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n\r\n');
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
  return createServer((req, res) => {
    if(auth(req)) {
      return res.writeHead(200).end("okay");
    } else {
      return res.writeHead(403).end("authorization field required");
    }
  })
    .unref()
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