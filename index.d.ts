/// <reference types="node" />

import { Agent as HTTP_Agent, RequestOptions } from "http";
import { Agent as HTTPS_Agent } from "https";
import { TLSSocket } from "tls";

export declare class ProxyTunnel {
  constructor(
    proxy: URL | string, proxyHeaders?: object, defaultHeaders?: object
  );

  /**
   * shut down the proxy tunnel.
   * 
   * as this module is using agents with keepAlive enabled,
   * sockets might stay open for quite a long time before 
   * the server terminates. It is best to explicitly shut 
   * down the proxy tunnel when it is no longer needed.
   */
  destroy(): void;
  fetch(url: string | URL, options: RequestOptions): Promise<Response>;

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
