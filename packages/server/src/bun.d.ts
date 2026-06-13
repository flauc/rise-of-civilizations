// Minimal ambient so this package typechecks without @types/bun installed.
// Replace with the real Bun types (`bun add -d @types/bun`) when Bun is set up.
declare const process: { env: Record<string, string | undefined> };
declare const Bun: {
  serve(options: {
    port?: number;
    fetch(req: Request, server: unknown): Response | Promise<Response> | undefined;
    websocket?: {
      open?(ws: unknown): void;
      message?(ws: unknown, message: string | ArrayBuffer): void;
      close?(ws: unknown): void;
    };
  }): { port: number };
};
