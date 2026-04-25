import type { AddressInfo } from 'node:net';
import { createApp, type AppDeps } from './app.js';

export const PACKAGE_NAME = '@kanbots/api';

export { createApp };
export type { AppDeps } from './app.js';
export type { ApiGitHubClient, DecoratedIssue, IssuesDeps } from './routes/issues.js';
export type { ConfigPayload } from './routes/config.js';

export interface StartOptions extends AppDeps {
  port?: number;
  host?: string;
}

export interface RunningServer {
  port: number;
  host: string;
  close: () => Promise<void>;
}

export async function startServer(opts: StartOptions): Promise<RunningServer> {
  const app = createApp(opts);
  const port = opts.port ?? 3737;
  const host = opts.host ?? '127.0.0.1';

  return await new Promise<RunningServer>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const addr = server.address() as AddressInfo | string | null;
      const actualPort =
        typeof addr === 'object' && addr !== null && 'port' in addr ? addr.port : port;
      resolve({
        port: actualPort,
        host,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on('error', reject);
  });
}
