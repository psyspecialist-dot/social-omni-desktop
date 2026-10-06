import { Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";

const router = Router();
router.get("/socialomni/download", (req, res, next) => {
  const relative = "artifacts/social-omni-desktop/public/downloads/socialomni-desktop.zip";
  const archive = [
    path.resolve(relative),
    path.resolve("../../", relative),
  ].find(candidate => existsSync(candidate));
  if (!archive) {
    res.status(503).json({ error: "Desktop package is unavailable. Run the desktop:export script to build it." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.download(archive, "socialomni-desktop.zip", error => {
    if (error) next(error);
  });
});
export default router;
