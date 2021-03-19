/// <reference types="node" />

import { 
  Agent as HTTP_Agent,
  ServerResponse,
  ClientRequest
} from "http";
import { Agent as HTTPS_Agent, RequestOptions, AgentOptions } from "https";
import { TLSSocket } from "tls";

interface ProxyAgentOptions extends AgentOptions {
  /**
   * default: true
   */
  keepAlive?: boolean
}

export declare class ProxyTunnel {
  constructor(
    proxy: URL | string, options: {
      proxyHeaders?: object,
      /**
       * default:
       * "User-Agent": `node ${process.version}`,
       * "Accept": "*\/*",
       */
      defaultHeaders?: object,
      agentOptions: ProxyAgentOptions
    }
  );

  /**
   * shut down the proxy tunnel.
   * 
   * as this module is using agents with keepAlive enabled by default,
   * sockets might stay open for quite a long time before the server 
   * terminates them. It is best to explicitly shut down the proxy 
   * tunnel when it is no longer needed.
   */
  destroy(): void;
  /**
   * designed to be the same as node vanilla method http[s].request
   * except following differences:
   * 
   * 1. http/https is auto selected by the protocol specified
   * 
   * 2. this.httpAgent/httpsAgent will be passed as the `agent` option 
   * to raw node request.
   * 
   * As a result, overriding this.httpsAgent or specifying options.agent
   * / options.createConnection for https request may result in not using
   * the proxy reaching to the endpoint.
   */
  request(url: string | URL, options?: RequestOptions, cb?: ((res: ServerResponse) => void)): ClientRequest;
  request(options: RequestOptions, cb?: ((res: ServerResponse) => void)): ClientRequest;
  /**
   * promisified request method for http methods being fine with empty body
   * request.
   * 
   * will do automatic error retry for reused socket. (keepAlive)
   */
  fetch(url: string | URL, options?: RequestOptions): Promise<ServerResponse>
  fetch(options: RequestOptions): Promise<ServerResponse>
  httpAgent: HTTP_Agent;
  httpsAgent: HTTPS_Agent;
  proxy: URL;
  proxyHeaders: object;
  defaultHeaders: object;

  createSecureConnection(
    options: { host: string, port: string },
    callback: ((err: Error | null, socket: TLSSocket) => void)
  ): void;
}
