/// <reference types="node" />

import { 
  Agent as HTTP_Agent,
  ServerResponse,
  ClientRequest
} from "http";
import { Agent as HTTPS_Agent, RequestOptions, AgentOptions } from "https";
import { TLSSocket } from "tls";
import { Readable } from "stream";

type ResponseCallback = (res: ServerResponse) => void;
type ClonedOptions = RequestOptions;

interface FetchOptions extends RequestOptions {
  body: Readable | string;
}

interface ParsedRequestParams {
  uriObject: URL,
  options: ClonedOptions,
  cb:  ResponseCallback
}

interface Headers {
  [name: string]: string
}

declare class ProxyTunnel {
  constructor(
    proxy: URL | string,
    options: {
      proxyHeaders?: Headers;
      /**
       * Default:
       * 
       * "User-Agent": `node ${process.version}`
       * 
       * "Accept": "*\/\*"
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
   * 1. http/https is auto selected based on the protocol specified.
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
   * The Underlying function installed as this.httpsAgent.createConnection
   * for proxy https requests.
   */
  createSecureConnection(
    options: { host: string, port: string },
    callback: ((err: Error | null, socket: TLSSocket) => void)
  ): void;
}

export default ProxyTunnel;