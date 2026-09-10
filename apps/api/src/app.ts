import express, { type Express } from "express";
import { createCatalogRouter, PrismaCatalogReader, type CatalogReader } from "./modules/catalog/catalog.js";

export function createApp(catalogReader: CatalogReader = new PrismaCatalogReader()): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_request, response) => response.status(200).json({ status: "ok" }));
  app.use("/api/catalog", createCatalogRouter(catalogReader));
  return app;
}
