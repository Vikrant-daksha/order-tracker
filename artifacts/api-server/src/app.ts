import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

// Allow ALL origins, methods, and headers (cors() middleware automatically handles OPTIONS pre-flight)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
    credentials: false,
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logger (no worker threads — works in serverless)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Cherrybrush API server is running" });
});

// Support both /api/path and /path directly
app.use("/api", router);
app.use(router);

export default app;
