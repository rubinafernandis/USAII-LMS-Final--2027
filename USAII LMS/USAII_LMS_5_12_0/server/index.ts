import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { exec } from 'node:child_process';
import { initDb, ROOT, storageMode, DATA_DIR } from './db';
import { fileMode, UPLOAD_DIR, INLINE_UPLOAD, serveFromDatabase, cleanUpFileStore } from './files';
import { initAuthSecret, MEDIA_COOKIE, readCookie, userForToken } from './auth';
import { canViewUpload } from './uploadAccess';
import { seedDatabase } from './seed';
import { migrateDatabase } from './migrate';
import { authRouter } from './routes/auth';
import { learnerRouter } from './routes/learner';
import { generalRouter, publicRouter } from './routes/general';
import { staffRouter } from './routes/staff';
import { uploadRouter } from './routes/uploads';
import { navVideoRouter } from './routes/navVideo';
import { transcriptRouter } from './routes/transcripts';
import { paymentsRouter, paymentWebhookRouter } from './routes/payments';
import { resumeEvaluations } from './evaluator';
import { paymentSettingsRouter } from './routes/paymentSettings';
import { siteCors, siteRouter } from './routes/site';

// 4600 keeps this app away from port 3000, where older prototypes usually run.
const BASE_PORT = Number(process.env.PORT) || 4600;
const APP_ID = 'usaii-intuitive-lms';
export const APP_VERSION = '5.14.0';
// `npm start` passes --prod, so a host runs the built app no matter how its dashboard is set up.
if (process.argv.includes('--prod')) process.env.NODE_ENV = 'production';
const isProd = process.env.NODE_ENV === 'production';

/**
 * Production must never keep learners' data on a disk that the host wipes on restart. That mistake
 * looks exactly like "my changes disappear after 10 to 30 minutes", so it is refused outright.
 */
function assertSafeStorage() {
  if (!isProd || storageMode === 'postgres' || process.env.DATA_DIR) return;
  console.error(`
  ======================================================================
   The LMS did not start: production needs a place where data survives.

   Set ONE of these in your host's environment settings:
     DATABASE_URL = postgres://...   (recommended on every host; see DEPLOY.md)
     DATA_DIR     = /path/on/a/persistent/disk   (a VPS or a mounted volume)

   Without one of them, every course, learner and submission would be
   lost each time the host restarts or puts the app to sleep.
  ======================================================================
`);
  process.exit(1);
}

let ready = false;

async function main() {
  assertSafeStorage();
  const app = express();
  app.disable('x-powered-by');
  // Behind a host's proxy (Render, nginx), req.ip must be the visitor's address for sign-in rate limits.
  // Behind a host's proxy (Hostinger, nginx, Render) the visitor's address arrives in X-Forwarded-For.
  // By default only proxies on this machine or a private network are trusted for it, so a visitor on the
  // internet cannot fake their address. Without this, every visitor shares the proxy's address and one
  // person's failed sign-ins would lock out everyone. TRUST_PROXY overrides it (a hop count or an express value).
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', tp === undefined || tp === '' ? 'loopback, linklocal, uniquelocal' : /^\d+$/.test(tp) ? Number(tp) : tp === 'false' ? false : tp === 'true' ? true : tp);
  // Payment gateway webhooks need the raw request body to check the signature, so they come first.
  app.use('/api/payments/webhook', paymentWebhookRouter);
  app.use(express.json({ limit: '5mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  });

  // The public website (landing page and course pages) may be hosted on another address.
  app.use('/api/public', siteCors);
  app.get('/api/health', (_req, res) => res.json({ app: APP_ID, status: ready ? 'ok' : 'starting', version: APP_VERSION, storage: storageMode, files: fileMode, time: new Date().toISOString() }));
  // While the data loads (or waits for the previous server to hand over during a redeploy), ask callers to retry.
  app.use(['/api', '/uploads'], (_req, res, next) => {
    if (ready) return next();
    res.setHeader('Retry-After', '3');
    res.status(503).json({ error: 'The LMS is starting. Please try again in a few seconds.' });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/learner', learnerRouter);
  app.use('/api/public', siteRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/staff/payment-settings', paymentSettingsRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/uploads', uploadRouter);
  app.use('/api/nav-video', navVideoRouter);
  app.use('/api/transcripts', transcriptRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api', generalRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // Uploaded files. Media, images and PDFs open inline; anything else (Office files, text, zip)
  // downloads and is sandboxed, so an uploaded file can never run as a page on the LMS's origin.
  // Uploaded files are private: a valid sign-in (the HttpOnly media cookie) and permission for that file.
  // Responses must not be cached by shared proxies, and each browser re-checks after a short while.
  app.use('/uploads', (req, res, next) => {
    const r = userForToken(readCookie(req, MEDIA_COOKIE));
    if (!r.user) return res.status(401).type('text/plain').send('Sign in to open this file.');
    let url = '';
    try {
      url = `/uploads${decodeURIComponent(req.path)}`;
    } catch {
      return res.status(400).type('text/plain').send('Bad file name.');
    }
    if (!canViewUpload(r.user, url)) return res.status(403).type('text/plain').send('You do not have access to this file.');
    res.setHeader('Cache-Control', 'private, max-age=300');
    next();
  });
  if (fileMode === 'disk')
    app.use(
      '/uploads',
      express.static(UPLOAD_DIR, {
        cacheControl: false,
        fallthrough: false,
        dotfiles: 'deny',
        setHeaders: (res, filePath) => {
          if (!INLINE_UPLOAD.test(filePath)) {
            res.setHeader('Content-Disposition', 'attachment');
            res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
          }
        },
      }),
    );
  else
    app.use('/uploads', (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
      serveFromDatabase(req, res).catch(next);
    });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[error]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  const server = http.createServer(app);
  // Large videos (course media and the navigation video, up to 1 GB) can take longer than
  // Node's default 5-minute request limit on a slow connection; allow up to one hour.
  server.requestTimeout = 60 * 60 * 1000;

  if (!isProd) {
    const { createServer } = await import('vite');
    // Live-reload runs over this same server/port, so it never collides with another app.
    const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(ROOT, 'dist');
    if (!fs.existsSync(dist)) {
      console.error('Build not found. Run "npm run build" first (on Render: Build Command "npm install && npm run build").');
      process.exit(1);
    }
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // On a hosting platform the port is assigned and must be used exactly as given;
  // only on a local machine do we hunt for the next free port.
  const fixedPort = !!process.env.PORT;
  // Listen first, so the host's health check sees the app while the data loads.
  const port = fixedPort ? await listenOnPort(server, BASE_PORT) : await listenOnFreePort(server, BASE_PORT);

  await initDb(seedDatabase, migrateDatabase);
  await initAuthSecret();
  await cleanUpFileStore();
  ready = true;
  // Automatic evaluations that were waiting when the server last stopped.
  resumeEvaluations();

  const url = `http://localhost:${port}`;
  console.log('');
  console.log('  ==============================================');
  console.log(`   USAII Intuitive LMS ${APP_VERSION} is running`);
  console.log(`   Open ${url}`);
  console.log('  ==============================================');
  if (port !== BASE_PORT) console.log(`   (Port ${BASE_PORT} was busy, so ${port} is used instead.)`);
  console.log(`   Data: ${storageMode === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : path.join(DATA_DIR, 'db.json')}`);
  console.log(`   Uploaded files: ${fileMode === 'database' ? 'PostgreSQL' : UPLOAD_DIR}`);
  console.log('');
  if (!isProd) {
    console.log('   Keep this window open while you use the LMS. Close it to stop.');
    console.log('');
  }
  if (process.env.OPEN_BROWSER === '1') openBrowser(url);
}

function listenOnPort(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(port));
  });
}

function listenOnFreePort(server: http.Server, start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryPort = () => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && port < start + 20) {
          port += 1;
          tryPort();
        } else reject(err);
      });
      server.listen(port, () => resolve(port));
    };
    tryPort();
  });
}

function openBrowser(url: string) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
