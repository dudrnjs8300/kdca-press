import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
const cfg = loadConfig(),
  { app, store } = createApp(cfg);
store.cleanup();
const clean = setInterval(() => store.cleanup(), 3600000);
clean.unref();
const server = app.listen(cfg.port, cfg.host, () =>
  console.log(
    JSON.stringify({ event: "started", port: cfg.port, demo: cfg.demo }),
  ),
);
server.requestTimeout = 60000;
server.headersTimeout = 15000;
function stop() {
  clearInterval(clean);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
