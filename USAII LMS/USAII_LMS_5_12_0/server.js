/**
 * Entry file for hosts that start a plain .js file: Hostinger "Node.js web app" (Entry file: server.js),
 * cPanel or Plesk Node.js, PM2 on a VPS. It runs the TypeScript server through tsx, in production mode.
 * Build first with `npm run build` (Hostinger runs it for you as the build command).
 */
import { register } from 'tsx/esm/api';

process.env.NODE_ENV ||= 'production';
if (!process.argv.includes('--prod')) process.argv.push('--prod');
register();
await import('./server/index.ts');
