import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
// @ts-ignore Shared Node implementation; this is never a desktop signing service.
import { createAuthority } from "../../../../lib/socialomni-api/license-authority.cjs";

const authority = createAuthority({ pool, signingKey: process.env.LICENSE_SIGNING_PRIVATE_KEY });
const router = Router();
const attempts = new Map<string, { count: number; expires: number }>();
router.use((req, res, next) => {
  if (req.method !== "POST") return next();
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const bucket = createHash("sha256").update(`${req.ip}:${String(req.body?.key || "").slice(0, 100)}`).digest("hex");
  const entry = attempts.get(bucket) || { count: 0, expires: now + 60000 };
  if (entry.count >= 10 || attempts.size >= 5000 && !attempts.has(bucket)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many activation attempts. Try again later." });
  }
  entry.count++;
  attempts.set(bucket, entry);
  return next();
});
router.get("/public-key", (_req, res) => {
  try { res.json({ publicKey: authority.publicKey(), algorithm: "Ed25519" }); }
  catch { res.status(503).json({ error: "License authority is not configured." }); }
});
router.post("/activate", async (req, res) => {
  try { res.json(await authority.activate(req.body)); }
  catch (error: unknown) {
    const e = error as Error & { status?: number };
    res.status(e.status || 503).json({ error: e.status ? e.message : "License authority unavailable. No new certificate was issued." });
  }
});
// Owner CLI can manage production keys without any production SQL console.
router.use("/admin", (req, res, next) => {
  const expected = process.env.LICENSE_ADMIN_TOKEN;
  if (!expected || expected.length < 32) return res.status(503).json({ error: "License administration is not configured." });
  const supplied = req.get("authorization") || "";
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(supplied), hash(`Bearer ${expected}`))) return res.status(403).json({ error: "Forbidden." });
  return next();
});
router.get("/admin/licenses", async (_req, res) => {
  try { res.json({ licenses: await authority.list() }); }
  catch { res.status(503).json({ error: "License administration unavailable." }); }
});
router.post("/admin/licenses", async (req, res) => {
  try { res.status(201).json(await authority.issue(req.body)); }
  catch (error: unknown) {
    const e = error as Error & { status?: number };
    res.status(e.status || 503).json({ error: e.status ? e.message : "License issuance unavailable." });
  }
});
router.post("/admin/licenses/:id/renew", async (req, res) => {
  try { res.json(await authority.renew(req.params.id, req.body?.supportPlan)); }
  catch (error: unknown) {
    const e = error as Error & { status?: number };
    res.status(e.status || 503).json({ error: e.status ? e.message : "License renewal unavailable." });
  }
});
router.post("/admin/licenses/:id/disable", async (req, res) => {
  try { res.json(await authority.disable(req.params.id)); }
  catch (error: unknown) {
    const e = error as Error & { status?: number };
    res.status(e.status || 503).json({ error: e.status ? e.message : "License disabling unavailable." });
  }
});
export default router;
