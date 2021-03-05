import { strictEqual } from "assert";
import ProxyTunnel from "../index.mjs";
import log from "why-is-node-running";

describe("proxy", () => {
  const proxyTunnel = new ProxyTunnel("http://127.0.0.1:7890");

  after(() => {
    proxyTunnel.destroy();
    setTimeout(log, 3000).unref();
    process.stdin.on("data", data => 
      data.toString().startsWith("log") && log()
    ).unref();
  });

  it("https", async () => {
    await Promise.all([
      proxyTunnel.fetch("https://www.google.com/generate_204")
        .then(response => strictEqual(response.statusCode, 204)),
      proxyTunnel.fetch("https://pbs.twimg.com/media/")
        .then(response => strictEqual(response.statusCode, 404)),
      proxyTunnel.fetch("https://nodejs.org", { method: "HEAD" })
        .then(response => strictEqual(response.statusCode, 302))
    ]);
  }).timeout(5000);

  it("http", () => {
    return Promise.all([
      proxyTunnel.fetch("http://www.google.com/generate_204")
        .then(response => strictEqual(response.statusCode, 204))
    ])
  }).timeout(5000);
});