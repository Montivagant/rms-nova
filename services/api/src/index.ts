import { env } from "./config.js";
import { createServer } from "./server.js";
import { logger } from "./logger.js";

const app = createServer();

const start = async () => {
  try {
    await app.listen({ port: env.APP_PORT, host: env.APP_HOST });
    logger.info({ port: env.APP_PORT }, "API server listening");
  } catch (error) {
    logger.error({ err: error }, "Failed to start API server");
    process.exit(1);
  }
};

void start();
