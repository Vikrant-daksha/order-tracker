import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

// Allow ALL origins, methods, and headers
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
    credentials: false,
  }),
);
// Pre-flight for every route
app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logger (no worker threads — works in serverless)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use("/api", router);

export default app;
