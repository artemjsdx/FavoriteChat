import app from "./app";
import { logger } from "./lib/logger";
import { pollingManager } from "./lib/polling";

const port = Number(process.env["PORT"] ?? 5000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start polling if no PUBLIC_URL (Termux / local mode)
  const polling = await pollingManager.init();
  if (polling) {
    logger.info("Running in polling mode (no PUBLIC_URL set)");
  } else {
    logger.info("Running in webhook mode");
  }
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down...");
  await pollingManager.stopAll();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT",  () => void shutdown("SIGINT"));
