# Forward-proxy-tunnel

[![npm](https://img.shields.io/npm/v/forward-proxy-tunnel?logo=npm)](https://www.npmjs.com/package/forward-proxy-tunnel)
[![install size](https://packagephobia.com/badge?p=forward-proxy-tunnel)](https://packagephobia.com/result?p=forward-proxy-tunnel)
[![CI](https://github.com/edfus/forward-proxy-tunnel/actions/workflows/node.js.yml/badge.svg?branch=master)](https://github.com/edfus/forward-proxy-tunnel/actions/workflows/node.js.yml)
[![Node.js Version](https://raw.githubusercontent.com/edfus/storage/master/node-lts-badge.svg)](https://nodejs.org/en/about/releases/)

## Features

- Zero dependency.
- Extend Agent.createConnection & use HTTP CONNECT method for a minimum impact instead of self-implementing a legacy Agent like request/tunnel-agent does.
- Designed to act the same as node vanilla method http\[s\].request.
- Isolating external network requirements in test cases.

It's made for circumstances where Node.js needs to be setup to route all ClientRequests through a proxy (e.g. Fiddler debugging) as sadly, Node itself does not support a handy CLI option to achieve this yet.

## Examples

```js
import ProxyTunnel from "forward-proxy-tunnel";

const proxy = new ProxyTunnel("http://127.0.0.1:8888");

// https://nodejs.org/api/http.html#http_http_request_url_options_callback
proxy.request("https://localhost:8080", { method: "HEAD" })
     .once("response", res => res.pipe(process.stdout))
     .once("error", console.error)
     .end("data");

// Promisified alternative for proxy.request.
proxy.fetch("https://localhost:8080", { method: "POST", body: "Client Hello" })
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

Check out [this](https://github.com/edfus/networking-dumpster/blob/49f01ea055ac50ad73791f6da1e27cd8418ea328/web-automation/helpers.js#L133-L287) for more examples.

## API

```ts
interface FetchOptions extends RequestOptions {
  body: Readable | string;
}

interface ParsedRequestParams {
  uriObject: URL;
  options: ClonedOptions;
  cb:  ResponseCallback;
}

class ProxyTunnel {
  constructor(
    proxy: URL | string,
    options: {
      proxyHeaders?: Headers;
      /**
       * Default:
       * "User-Agent": `node ${process.version}`
       * "Accept": all
       */
      defaultHeaders?: Headers;
      /**
       * Options for this.http[s]Agent.
       */
      agentOptions: AgentOptions;
    }
  );

  /**
   * Shut down the proxy tunnel.
   * 
   * If keepAlive is specified in agentOptions,
   * sockets might stay open for quite a long time before the server 
   * terminates them. It is best to explicitly shut down the proxy 
   * tunnel when it is no longer needed.
   */
  destroy(): void;

  /**
   * Designed to be the same as node vanilla method http[s].request
   * except following differences:
   * 
   * 1. http/https is auto selected based on the protocol specified
   * 
   * 2. this.http[s]Agent will be passed as the `agent` option 
   * to raw node request.
   * 
   * As a result, overriding this.httpsAgent or passing options.agent
   * / options.createConnection to methods may result in a unproxied
   * request.
   */
  request(url: string | URL, options?: RequestOptions, cb?: ResponseCallback): ClientRequest;
  request(options: RequestOptions, cb?: ResponseCallback): ClientRequest;
  /**
   * Promisified request method. A new option `body` is accepted for
   * writing data to clientRequest.
   * 
   * Will do automatic error retry for reused (keepAlived) socket. 
   */
  fetch(url: string | URL, options?: FetchOptions): Promise<ServerResponse>;
  fetch(options: FetchOptions): Promise<ServerResponse>;
  
  /**
   * Underlying function used by ProxyTunnel#request for normalizing parameters.
   */
  parseRequestParams (
    input: string | URL, options?: RequestOptions, cb?: ResponseCallback
  ) : ParsedRequestParams;

  parseRequestParams (options: RequestOptions, cb?: ResponseCallback): ParsedRequestParams;

  /**
   * Dedicated http agent for ProxyTunnel instance.
   */
  httpAgent: HTTP_Agent;
  /**
   * Dedicated https agent for ProxyTunnel instance.
   */
  httpsAgent: HTTPS_Agent;

  proxy: URL;
  proxyHeaders: Headers;
  defaultHeaders: Headers;

  /**
   * Create tcp connection to a given ip using http CONNECT.
   */
  createConnection (
    options: { host: string, port: string },
    callback: ((err: Error | null, socket: Socket) => void)
  ): void
  /**
   * The Underlying function installed as this.httpsAgent.createConnection
   * for proxy https requests, will supply a TLSSocket.
   */
  createSecureConnection(
    options: { host: string, port: string },
    callback: ((err: Error | null, socket: TLSSocket) => void)
  ): void;
}
```

## Trouble-shooting

- **[DEP0123] DeprecationWarning: Setting the TLS ServerName to an IP address is not permitted by RFC 6066. This will be ignored in a future version.**
  - You have passed an IP address as the hostname for a HTTPS request in either `url` or `RequestOptions.host[name]`, use `node --trace-warnings ...` to find out more details.
- **Forward-proxy-tunnel: Found a GET request with non-empty body.**
  - Please set appropriate headers (`Content-Length` or `Transfer-Encoding`) for that GET request. See node issue#3009 [Sending a body with a GET request](https://github.com/nodejs/node/issues/3009)

## Test

With mocha installed globally, just run `npm test`.

Notes:
- Tests are not included in npm package, so manual clone is required.
- Tests depending on external services are disabled for stability reasons, re-enable them if you want.
- See <https://github.com/edfus/forward-proxy-tunnel/blob/master/test/test.mjs> for more details.