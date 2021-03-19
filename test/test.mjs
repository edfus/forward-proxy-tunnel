// process.env['NODE_DEBUG'] = "proxy";
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

import ProxyTunnel from "../index.mjs";
import log from "why-is-node-running";
import { strictEqual } from "assert";
import { request as request_https } from "https";
import { request as request_http } from "http";
import { createProxyServer, createHTTPServer, createHTTPSServer, getServerAddress } from "./helpers/index.mjs";

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
                  ...new Array(10).fill(void 0)
                    .map(
                      _ => proxyTunnel.fetch(address)
                      .then(res => strictEqual(res.statusCode, 200))
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
      }).timeout(50000);


      it("https", async () => {
        return new Promise(async (resolve, reject) => {
          try {
            const httpsServer = createHTTPSServer();
            const address = getServerAddress(httpsServer);
            console.info(`    https server is running at ${address}`);

            httpsServer
              .once("listening", () => {
                Promise.all([
                  ...new Array(10).fill(void 0)
                    .map(
                      _ => proxyTunnel.fetch(address)
                      .then(res => strictEqual(res.statusCode, 403))
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
      }).timeout(5000);

    });
  })
  ;
