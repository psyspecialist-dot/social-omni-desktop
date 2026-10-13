import express from 'express';
import crypto from 'node:crypto';
import { createIssuer } from './issuer.mjs';

const prefix = '/api/seller-dashboard';
const hash = value => crypto.createHash('sha256').update(value).digest();
const sessionHours = 8;

export function createDashboard({
  password = process.env.SELLER_DASHBOARD_PASSWORD,
  issuer = createIssuer(),
  now = Date.now,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  const router = express.Router();
  const sessions = new Map();
  const loginAttempts = new Map();
  const passwordConfigured = typeof password === 'string' && password.length >= 16 && password.length <= 256;
  const passwordHash = passwordConfigured ? hash(password) : null;
  let windowStart = now(), totalAttempts = 0;

  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, private',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });
  // Require a non-simple header for mutations; never enable CORS on the issuer.
  // Bearer sessions also work inside Replit's third-party preview iframe.
  router.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Seller-Dashboard') !== '1') {
      res.status(403).json({ error: 'This request must come from the seller dashboard.' });
      return;
    }
    next();
  });
  router.use(express.json({ limit: '4kb' }));

  function tokenKey(req) {
    const header = req.get('Authorization') || '';
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
    return match ? hash(match[1]).toString('hex') : null;
  }
  function authenticated(req) {
    for (const [id, expires] of sessions) if (expires <= now()) sessions.delete(id);
    const id = tokenKey(req);
    return passwordConfigured && id !== null && sessions.has(id);
  }
  function state(auth, sessionToken = null) {
    const setupError = !passwordConfigured
      ? 'Set SELLER_DASHBOARD_PASSWORD in Replit Secrets to a password of 16–256 characters. The dashboard stays locked until configured.'
      : auth ? issuer.check() : null;
    return { authenticated: auth, passwordConfigured, issuerReady: auth && !setupError, setupError, sessionToken };
  }
  router.get('/session', (req, res) => res.json(state(authenticated(req))));
  router.post('/session', (req, res) => {
    if (!passwordConfigured) {
      res.status(503).json({ error: state(false).setupError });
      return;
    }
    const input = req.body;
    if (!input || typeof input.password !== 'string' || input.password.length > 256 || Object.keys(input).some(k => k !== 'password')) {
      res.status(400).json({ error: 'Enter your seller password (up to 256 characters).' });
      return;
    }
    const time = now();
    if (time - windowStart >= 60000) {
      windowStart = time; totalAttempts = 0; loginAttempts.clear();
    }
    // Socket address cannot be spoofed with client-controlled forwarding headers.
    const address = req.socket.remoteAddress || 'unknown';
    const attempts = loginAttempts.get(address) || 0;
    if (attempts >= 10 || totalAttempts >= 30) {
      res.set('Retry-After', '60');
      res.status(429).json({ error: 'Too many sign-in attempts. Wait one minute and try again.' });
      return;
    }
    loginAttempts.set(address, attempts + 1); totalAttempts++;
    if (!crypto.timingSafeEqual(hash(input.password), passwordHash)) {
      res.status(401).json({ error: 'Incorrect seller password.' });
      return;
    }
    authenticated(req); // Prune expired sessions before capacity checks.
    if (sessions.size >= 100) {
      res.status(429).json({ error: 'Too many seller sessions. Sign out an existing session or wait for it to expire.' });
      return;
    }
    const oldId = tokenKey(req);
    if (oldId) sessions.delete(oldId);
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(hash(token).toString('hex'), time + sessionHours * 60 * 60 * 1000);
    res.json(state(true, token));
  });
  router.delete('/session', (req, res) => {
    const id = tokenKey(req);
    if (id) sessions.delete(id);
    res.json(state(false));
  });
  router.post('/licenses', (req, res) => {
    if (!authenticated(req)) {
      res.status(401).json({ error: 'Seller sign-in is required. Your session may have expired.' });
      return;
    }
    const input = req.body;
    if (!input || typeof input.deviceId !== 'string' || !/^[a-f0-9]{64}$/i.test(input.deviceId)) {
      res.status(400).json({ error: 'Device ID must contain exactly 64 hexadecimal characters (0–9, a–f).' });
      return;
    }
    if (!['lifetime', 'yearly', 'monthly', 'none'].includes(input.plan) || Object.keys(input).some(k => !['deviceId', 'plan'].includes(k))) {
      res.status(400).json({ error: 'Choose Lifetime, Yearly, Monthly, or None. Additional issuer options are not accepted.' });
      return;
    }
    const setupError = issuer.check();
    if (setupError) {
      res.status(503).json({ error: setupError });
      return;
    }
    try {
      res.status(201).json(issuer.generate(input.deviceId, input.plan));
    } catch {
      res.status(503).json({ error: 'License generation failed. Check the existing private issuer and its permissions, then try again.' });
    }
  });
  // No request/body/key logging and no filesystem paths in public errors.
  router.use((_req, res) => res.status(404).json({ error: 'Seller endpoint not found.' }));
  router.use((error, _req, res, _next) => {
    res.status(error?.status === 413 ? 413 : 400).json({ error: 'Invalid request. Submit a small JSON request from the seller dashboard.' });
  });
  app.use(prefix, router);
  return app;
}
