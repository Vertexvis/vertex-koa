import { ErrorCallback, retry } from "async";
import { Server } from "http";
import * as Koa from "koa";
import * as helmet from "koa-helmet";
import { ServiceContainer } from "../container";
import { AppError } from "../errors";
import * as files from "./files";
import * as health from "./health";
import * as middlewares from "./middlewares";

export class AppServer {
  private app: Koa;
  private server: Server | undefined;

  constructor(app: Koa) {
    this.app = app;
  }

  public listen(port: number): Server {
    this.server = this.app.listen(port);
    return this.server;
  }

  public closeServer(): Promise<void> {
    if (this.server === undefined) {
      throw new AppError(10001, "Server is not initialized.");
    }

    const checkPendingRequests = (
      callback: ErrorCallback<Error | undefined>
    ) => {
      this.server?.getConnections(
        (err: Error | null, pendingRequests: number) => {
          if (err) {
            callback(err);
          } else if (pendingRequests > 0) {
            callback(Error(`Number of pending requests: ${pendingRequests}`));
          } else {
            callback(undefined);
          }
        }
      );
    };

    return new Promise<void>((resolve, reject) => {
      retry(
        { times: 10, interval: 1000 },
        checkPendingRequests.bind(this),
        ((error: unknown) => {
          if (error) {
            this.server?.close(() => reject(error));
          } else {
            this.server?.close(() => resolve(undefined));
          }
        }).bind(this)
      );
    });
  }
}

export function createServer(container: ServiceContainer): AppServer {
  const app = new Koa();
  const appSrv = new AppServer(app);

  // Register Middlewares
  app.use(helmet());
  app.use(middlewares.responseTime);
  app.use(middlewares.logRequest(container.logger));
  app.use(middlewares.errorHandler(container.logger));

  // Register routes
  health.init(app, container);
  files.init(app, container);

  return appSrv;
}
