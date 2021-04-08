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

```js
import ProxyTunnel from "forward-proxy-tunnel";

class HTTP {
  constructor (proxy) {
    if(proxy) {
      this.proxy = new ProxyTunnel(proxy);
    }
  }

  request (_input, _options, _cb) {
    const { uriObject, options, cb } = ProxyTunnel.prototype.parseRequestParams(_input, _options, _cb);

    return (
      uriObject.protocol === "https:"
        ? request_https(uriObject, options, cb)
        : request_http(uriObject, options, cb)
    );
  }

  async fetch () {
    return ProxyTunnel.prototype.fetch.apply(this, arguments);
  }
}

const useProxy = true;
const http  = new HTTP("http://localhost:8888");
const fetch = useProxy ? http.proxy.fetch.bind(http.proxy) : http.fetch.bind(http);
const request = useProxy ? http.proxy.request.bind(http.proxy) : http.request.bind(http);

if(useProxy) {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
}
```

Check out [this](https://github.com/edfus/networking-dumpster/blob/a2ae44f3c07bc0d5e5b6d53f482589e65fa5854c/web-automation/helpers.js#L123-L222) for more examples.

## API

see <https://github.com/edfus/forward-proxy-tunnel/blob/master/index.d.ts>