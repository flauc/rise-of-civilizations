// Minimal ambient declarations for the Bun APIs this server uses, so it
// typechecks under the repo's root tsconfig without installing @types/bun.
// (Request/Response/URL/console come from the DOM lib in the root tsconfig.)
// For full types: `bun add -d @types/bun` and set "types": ["bun"].

declare const process: { env: Record<string, string | undefined> };

interface ServerWebSocket<T = unknown> {
  data: T;
  readyState: number;
  send(message: string | ArrayBufferView | ArrayBuffer): number;
  close(code?: number, reason?: string): void;
  subscribe(topic: string): void;
  publish(topic: string, message: string): void;
}

interface BunServer {
  port: number;
  upgrade<T>(req: Request, options?: { data?: T }): boolean;
  publish(topic: string, message: string): void;
  stop(closeActiveConnections?: boolean): void;
}

interface BunServeOptions<T> {
  port?: number;
  fetch(req: Request, server: BunServer): Response | Promise<Response> | undefined;
  websocket?: {
    open?(ws: ServerWebSocket<T>): void | Promise<void>;
    message?(ws: ServerWebSocket<T>, message: string | ArrayBuffer): void | Promise<void>;
    close?(ws: ServerWebSocket<T>, code?: number, reason?: string): void | Promise<void>;
  };
}

declare const Bun: {
  serve<T = unknown>(options: BunServeOptions<T>): BunServer;
  password: {
    hash(password: string): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
  };
};
