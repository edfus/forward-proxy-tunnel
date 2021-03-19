# forward-proxy-tunnel

*A simplified http\[s\]OverHttp proxy tunnel with connection reuse*

## Features

- Zero dependency.
- Extend Agent.createConnection & use HTTP CONNECT method for a minimum impact instead of self-implementing a legacy Agent like request/tunnel-agent does.
- Designed to act the same as node vanilla method http\[s\].request.
- Isolating external network requirements in test cases.

It's made for circumstances where Node.js needs to be setup to route all ClientRequests through a proxy (e.g. Fiddler debugging) as sadly, Node itself does not support a handy CLI option to achieve this yet.

## Quick start

```js
import ProxyTunnel from "forward-proxy-tunnel";

const proxy = new ProxyTunnel("http://127.0.0.1:8888");

proxy.request("https://localhost:8080", { method: "POST" })
     .once("response", res => res.pipe(process.stdout))
     .once("error", console.error)
     .end("data");

proxy.fetch("https://localhost:8080")
      .then(res => res.pipe(process.stdout))
      .catch(console.error);
```

## API

see <https://github.com/edfus/forward-proxy-tunnel/blob/master/index.d.ts>