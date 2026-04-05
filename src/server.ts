import dotenv from "dotenv";
dotenv.config();

import { loadConfig } from "./config";
import { createApp } from "./app";
import { logger } from "./lib/logger";

const config = loadConfig();
const { app } = createApp(config);

app.listen(config.port, () => {
  logger.info(`Bridge started on port ${config.port}`, {
    nodeEnv: config.nodeEnv,
  });
});
