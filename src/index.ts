import * as pino from "pino";
import { createContainer } from "./container";
import { HealthMonitor } from "./lib/health";
import { AppServer, createServer } from "./server";

export async function init(): Promise<void> {
  const logger = pino();

  try {
    logger.info("Starting HTTP server");

    const port = Number(process.env.PORT) || 8080;
    const container = createContainer(logger);
    const app = createServer(container);
    const health = container.health;

    app.listen(port);

    registerProcessEvents(logger, app, health);

    logger.info(`Application running on port: ${port}`);
  } catch (e) {
    logger.error(e, "An error occurred while initializing application.");
  }
}

function registerProcessEvents(
  logger: pino.Logger,
  app: AppServer,
  health: HealthMonitor
) {
  process.on("uncaughtException", (error: Error) => {
    logger.error("UncaughtException", error);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.on("unhandledRejection", (reason: any, promise: any) => {
    logger.info(reason, promise);
  });

  process.on("SIGTERM", async () => {
    logger.info("Starting graceful shutdown");

    health.shuttingDown();

    let exitCode = 0;
    const shutdown = [app.closeServer()];

    for (const s of shutdown) {
      try {
        await s;
      } catch (e) {
        logger.error("Error in graceful shutdown ", e);
        exitCode = 1;
      }
    }

    process.exit(exitCode);
  });
}

init();
