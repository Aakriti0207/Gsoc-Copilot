import express, { type Express } from "express";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_request, response) => response.status(200).json({ status: "ok" }));
  return app;
}
