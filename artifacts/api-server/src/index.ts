import app from "./app";
import { logger } from "./lib/logger";
import { initStore } from "./lib/store";
import "./lib/persist";
import { startPendingOrderPoller } from "./routes/pending-orders";
import { startAlertPoller } from "./routes/watchlist";
import { startFuturesLiquidationPoller } from "./routes/futures";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

initStore().then(() => app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  startPendingOrderPoller();
  startAlertPoller();
  startFuturesLiquidationPoller();
  logger.info({ port }, "Server listening");
})).catch((err) => {
  logger.error({ err }, "Storage failed to load - refusing to start so existing data is not overwritten");
  process.exit(1);
});
