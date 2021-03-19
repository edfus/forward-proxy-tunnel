// process.env['NODE_DEBUG'] = "proxy";
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

import ProxyTunnel from "../index.mjs";
import log from "why-is-node-running";
import { strictEqual } from "assert";
import { request as request_https } from "https";
import { request as request_http } from "http";
import { createProxyServer, createHTTPServer, createHTTPSServer, getServerAddress } from "./helpers/helpers.mjs";

const { proxyServer, auth } = createProxyServer();
const proxyAddress = getServerAddress(proxyServer);

console.info(`    proxy server is running at ${proxyAddress}`);

proxyServer
  .once("listening", () => {
    describe("proxy", () => {
      const proxyTunnel = new ProxyTunnel(
        proxyAddress,
        { 
          proxyHeaders: {
            "Proxy-Authorization": `Basic ${auth}`
          },
          agentOptions: {
            maxSockets: 3
          }
        }
      );

      after(() => {
        proxyTunnel.destroy();
        setTimeout(log, 3000).unref();
        process.stdin.on("data", data =>
          data.toString().startsWith("log") && log()
        ).unref();
      });

      it("http", async () => {
        return new Promise((resolve, reject) => {
          try {
            const httpServer = createHTTPServer();
            const address = getServerAddress(httpServer);
            console.info(`    http server is running at ${address}`);

            httpServer
              .once("listening", () => {
                Promise.all([
                  ...new Array(30).fill(void 0)
                    .map(
                      _ => (
                        proxyTunnel.fetch(address)
                          .then(res => {
                            strictEqual(res.statusCode, 200);
                            res.resume();
                          })
                      )
                    )
                  ,

                  new Promise((_resolve, _reject) => {
                    request_http(address)
                      .once("response", res => {
                        try {
                          _resolve(strictEqual(res.statusCode, 403));
                        } catch (err) {
                          _reject(err);
                        }
                      })
                      .once("error", _reject)
                    .end()
                  })
                ])
                  .then(resolve, reject);
              })
            ;
          } catch (err) {
            return reject(err);
          }
        });
      });


      it("https", async () => {
        return new Promise(async (resolve, reject) => {
          try {
            const httpsServer = createHTTPSServer();
            const address = getServerAddress(httpsServer);
            console.info(`    https server is running at ${address}`);

            httpsServer
              .once("listening", () => {
                Promise.all([
                  ...new Array(30).fill(void 0)
                    .map(
                      _ => new Promise(resolve => 
                        setTimeout(resolve, Math.random() * 150)
                      )
                    )
                    .map(
                      async timeout => {
                        await timeout;
                        return (
                          proxyTunnel.fetch(address)
                            .then(res => {
                              strictEqual(res.statusCode, 403);
                              res.resume();
                            })
                        );
                      }
                    ),

                  new Promise((_resolve, _reject) => {
                    request_https(address)
                      .once("response", res => {
                        try {
                          _resolve(strictEqual(res.statusCode, 403));
                        } catch (err) {
                          _reject(err);
                        }
                      })
                      .once("error", _reject)
                      .end()
                    ;
                  })
                ])
                  .then(resolve, reject);
              })
            ;
          } catch (err) {
            return reject(err);
          } 
        });
      });

      xit("external sites", async () => {
        const proxy = new ProxyTunnel(
          "http://127.0.0.1:7890"
        );
        
        await Promise.all([
          proxy.fetch("https://www.google.com/generate_204")
            .then(res => {
              strictEqual(res.statusCode, 204);
              res.resume();
            }),
          proxy.fetch("http://www.google.com/generate_204")
            .then(res => {
              strictEqual(res.statusCode, 204);
              res.resume();
            }),
          proxy.fetch("https://nodejs.org")
            .then(res => {
              strictEqual(res.statusCode, 302);
              res.resume();
            }),
          proxy.fetch("https://developer.mozilla.org")
            .then(res => {
              strictEqual(res.statusCode, 302);
              res.resume();
            }),
          proxy.fetch("https://github.com/", { method: "HEAD" })
            .then(res => {
              strictEqual(res.statusCode, 200);
              res.resume();
            })
        ])
      }).timeout(5000);
    });
  })
  ;
