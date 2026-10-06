import express from "express";
import path from "node:path";
// Shared CommonJS engine is copied into the standalone Electron distribution at export time.
// @ts-ignore JavaScript implementation deliberately has no TS declaration.
import createService from "../../../../lib/socialomni-api/service.cjs";

const service = createService({
  express,
  dbPath: path.resolve("data", "socialomni-preview.sqlite"),
});

export default service.router;
