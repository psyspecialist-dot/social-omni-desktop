import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { createDashboard } from './dashboard.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) throw new Error('A valid PORT is required.');
const base = process.env.BASE_PATH || '/seller-dashboard/';
const app = createDashboard();
const server = createHttpServer(app);
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});
if (process.env.NODE_ENV === 'production') {
  app.use(base, express.static(path.join(root, 'dist/public'), { index: 'index.html', dotfiles: 'deny' }));
  app.get(base, (_req, res) => res.sendFile(path.join(root, 'dist/public/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server, path: `${base}__hmr` } },
  });
  app.use(vite.middlewares);
}
server.listen(port, '0.0.0.0', () => {
  console.log('Seller dashboard running. Signing secrets remain server-only.');
});
