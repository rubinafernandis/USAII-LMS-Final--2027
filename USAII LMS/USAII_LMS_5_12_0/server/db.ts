/**
 * Where the LMS keeps its data.
 *
 * Two storage modes, chosen by the environment:
 *
 *   1. PostgreSQL  (DATABASE_URL is set). Recommended for every host. The data lives in a managed
 *      database, so restarts, redeploys, sleeping containers and new servers never lose anything.
 *   2. JSON file   (no DATABASE_URL). Everything is kept in DATA_DIR/db.json. Fine on your own
 *      computer or a VPS with a real disk. On hosts whose disk is wiped when the app restarts or
 *      sleeps (Render free plan, Railway without a volume, most "sandbox" or preview hosts) every
 *      change disappears after a restart. That is why production refuses to start in this mode
 *      unless DATA_DIR is set on purpose (see assertSafeStorage in server/index.ts).
 *
 * The rest of the server reads and changes one in-memory object through `db()` and calls `save()`
 * after a change. This module writes the change out shortly afterwards (and always on shutdown).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import type { Database } from '../shared/types';

export const ROOT = process.cwd();
/** DATA_DIR keeps the data outside the app folder, so updating or redeploying the app never touches it. */
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
export const DB_VERSION = 17;

export type StorageMode = 'postgres' | 'file';
export const storageMode: StorageMode = process.env.DATABASE_URL ? 'postgres' : 'file';

fs.mkdirSync(DATA_DIR, { recursive: true });

let state: Database | null = null;

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export const nowIso = () => new Date().toISOString();

export function db(): Database {
  if (!state) throw new Error('Database not loaded');
  return state;
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

let timer: NodeJS.Timeout | null = null;
let flushing: Promise<void> | null = null;
let dirty = false;
let retryMs = 0;
let stopping = false;

/** Ask for the current data to be written out soon. Cheap to call often. */
export function save() {
  dirty = true;
  if (timer || !state) return;
  // A short delay groups many small changes into one write.
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, Math.max(storageMode === 'postgres' ? 1000 : 250, retryMs));
}

/** Write any pending change now. Resolves when it is safely stored. */
export async function flush(): Promise<void> {
  while (flushing) await flushing;
  if (!state || !dirty) return;
  dirty = false;
  flushing = (storageMode === 'postgres' ? pgWrite() : fileWrite())
    .then(() => {
      retryMs = 0;
    })
    .catch((e) => {
      dirty = true;
      retryMs = Math.min(30_000, Math.max(2000, retryMs * 2));
      console.error(`[db] Could not save (will retry in ${Math.round(retryMs / 1000)} s):`, (e as Error).message);
    })
    .finally(() => {
      flushing = null;
    });
  await flushing;
  if (dirty && !stopping) save();
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Load the data (creating it on first start), upgrading an older format first.
 * @param migrate Upgrades older data in place and returns true, or returns false when the data is
 * too old to upgrade. A copy of the old data is always kept before an upgrade.
 */
export async function initDb(seed: () => Database, migrate: (old: Database) => boolean): Promise<Database> {
  let loaded: Database | null = null;
  let fromFile = false;
  if (storageMode === 'postgres') {
    await pgConnect();
    loaded = await pgLoad();
    // Moving from a JSON file to PostgreSQL: bring the existing data across once.
    if (!loaded && fs.existsSync(DB_FILE)) {
      loaded = readFileDb();
      if (loaded) {
        fromFile = true;
        console.log(`[db] Importing ${path.relative(ROOT, DB_FILE) || DB_FILE} into PostgreSQL.`);
      }
    }
  } else {
    loaded = fs.existsSync(DB_FILE) ? readFileDb() : null;
  }

  if (loaded) ensureShape(loaded);
  let migrated = false;
  if (loaded && loaded.version !== DB_VERSION) {
    await keepBackup(loaded);
    migrated = true;
    if (loaded.version < DB_VERSION && migrate(loaded)) {
      loaded.version = DB_VERSION;
      console.log(`[db] Data upgraded to format ${DB_VERSION}. A copy of the old data was kept.`);
    } else if (loaded.version > DB_VERSION) {
      throw new Error(`This data was written by a newer version of the LMS (format ${loaded.version}). Install that version or newer.`);
    } else {
      console.warn('[db] This data is too old to upgrade. A fresh database is created; the old data was kept as a backup.');
      loaded = null;
    }
  }
  state = loaded ?? seed();
  dirty = true;
  if (storageMode === 'postgres' && !fromFile && loaded && !migrated) {
    // Fresh from the database and unchanged: nothing needs writing.
    rememberWritten(state);
    dirty = false;
  }
  await flush();
  return state;
}

/** Every standard part exists, even when it was empty or missing in what was stored. */
function ensureShape(d: Database) {
  const raw = d as unknown as Record<string, unknown>;
  for (const k of ['users', 'courses', 'enrollments', 'events', 'notifications', 'feedback', 'audit', 'payments', 'uploads', 'enquiries']) if (!Array.isArray(raw[k])) raw[k] = [];
  for (const k of ['transcriptTranslations', 'videoCaptions']) if (!raw[k] || typeof raw[k] !== 'object') raw[k] = {};
}

function readFileDb(): Database | null {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as Database;
  } catch {
    const backup = `${DB_FILE}.unreadable-${Date.now()}`;
    fs.copyFileSync(DB_FILE, backup);
    console.warn(`[db] Could not read ${DB_FILE}. It was copied to ${backup} and a fresh database is created.`);
    return null;
  }
}

async function keepBackup(old: Database) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (storageMode === 'postgres') {
    await setMeta(`backup:v${old.version}:${stamp}`, JSON.stringify(old));
  } else if (fs.existsSync(DB_FILE)) {
    fs.copyFileSync(DB_FILE, `${DB_FILE}.v${old.version}-backup-${stamp}`);
  }
}

/* ------------------------------------------------------------------ */
/* JSON file                                                           */
/* ------------------------------------------------------------------ */

async function fileWrite() {
  const data = JSON.stringify(state);
  const tmp = DB_FILE + '.tmp';
  try {
    await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, DB_FILE);
  } catch {
    // Some Windows setups (antivirus, file indexers) briefly lock files; fall back to a direct write.
    await fs.promises.writeFile(DB_FILE, data);
  }
}

/* ------------------------------------------------------------------ */
/* PostgreSQL                                                          */
/* ------------------------------------------------------------------ */

let pool: pg.Pool | null = null;
let lockClient: pg.Client | null = null;
/** One LMS server writes to a database at a time. A second one waits until the first has stopped. */
const LOCK_KEY = 4_600_511_011;

/** The connection pool (PostgreSQL mode only), shared with the uploaded-file store. */
export function pgPool(): pg.Pool {
  if (!pool) throw new Error('PostgreSQL is not connected.');
  return pool;
}

function pgConfig(): pg.ClientConfig {
  const url = process.env.DATABASE_URL!;
  // Managed databases (Neon, Supabase, Render, Railway...) require TLS. Local ones usually do not.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url);
  const ssl = process.env.DATABASE_SSL === 'false' || local ? false : { rejectUnauthorized: process.env.DATABASE_SSL === 'strict' };
  return { connectionString: url, ssl, connectionTimeoutMillis: 15_000 };
}

async function pgConnect() {
  pool = new pg.Pool({ ...pgConfig(), max: 5, idleTimeoutMillis: 30_000 });
  pool.on('error', (e) => console.error('[db] PostgreSQL connection error:', e.message));
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lms_meta (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS lms_records (collection text NOT NULL, id text NOT NULL, seq bigint NOT NULL, data text NOT NULL, PRIMARY KEY (collection, id));
    CREATE TABLE IF NOT EXISTS lms_files (name text PRIMARY KEY, size bigint NOT NULL, mime text NOT NULL, chunk_size integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS lms_file_chunks (name text NOT NULL, n integer NOT NULL, data bytea NOT NULL, PRIMARY KEY (name, n));
  `);

  // The single-writer lock lives on its own connection for the whole life of the server.
  lockClient = new pg.Client(pgConfig());
  lockClient.on('error', (e) => {
    console.error('[db] Lost the connection that holds the database lock. Stopping so the host can restart the LMS cleanly.', e.message);
    process.exit(1);
  });
  await lockClient.connect();
  const got = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
  if (!got.rows[0].ok) {
    console.log('[db] Another LMS server is still using this database (normal for a moment during a redeploy). Waiting for it to stop...');
    await lockClient.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    console.log('[db] The previous server has stopped. Continuing.');
  }
}

export async function getMeta(key: string): Promise<string | null> {
  if (storageMode === 'postgres') {
    const r = await pgPool().query('SELECT value FROM lms_meta WHERE key = $1', [key]);
    return r.rows[0]?.value ?? null;
  }
  const f = path.join(DATA_DIR, `${key.replace(/[^a-z0-9_-]/gi, '_')}.key`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  if (storageMode === 'postgres') {
    await pgPool().query('INSERT INTO lms_meta (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, value]);
    return;
  }
  const f = path.join(DATA_DIR, `${key.replace(/[^a-z0-9_-]/gi, '_')}.key`);
  fs.writeFileSync(f, value, { mode: 0o600 });
}

/*
 * Each top-level part of the data is stored as rows:
 *   "a:<name>"  a list (users, courses, enrollments...): one row per item, keyed by its id
 *   "m:<name>"  a lookup table (caption caches): one row per key
 *   "s:<name>"  a single value (version, settings): one row
 * Only rows whose content changed since the last write are sent, so a busy site writes
 * kilobytes, not the whole database, on each save.
 */
type Kind = 'a' | 'm' | 's';
/** Lists that are kept newest-first in memory (new items are added at the front). */
const NEWEST_FIRST = new Set(['notifications', 'audit', 'feedback']);

const written = new Map<string, Map<string, { hash: string; seq: number }>>();
let nextSeq = 1;

const hashOf = (s: string) => crypto.createHash('sha1').update(s).digest('base64');

function itemKey(item: unknown, i: number): string {
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    if (typeof o.id === 'string' && o.id) return o.id;
    if (typeof o.url === 'string' && o.url) return o.url;
  }
  return `#${i}:${hashOf(JSON.stringify(item))}`;
}

function kindOf(key: string, value: unknown): Kind {
  if (Array.isArray(value)) return 'a';
  if (key !== 'settings' && value && typeof value === 'object') return 'm';
  return 's';
}

interface Row {
  collection: string;
  id: string;
  data: string;
  hash: string;
}

/** Every row the current data consists of. */
function rowsOf(d: Database): Row[] {
  const rows: Row[] = [];
  // Which parts exist and what shape they have, so an empty list comes back as an empty list.
  const keys: Record<string, Kind> = {};
  for (const [key, value] of Object.entries(d)) if (value !== undefined) keys[key] = kindOf(key, value);
  const keysData = JSON.stringify(keys);
  rows.push({ collection: 's:__keys', id: '_', data: keysData, hash: hashOf(keysData) });
  for (const [key, value] of Object.entries(d)) {
    if (value === undefined) continue;
    const kind = kindOf(key, value);
    const collection = `${kind}:${key}`;
    if (kind === 'a') {
      const list = value as unknown[];
      const seen = new Set<string>();
      list.forEach((item, i) => {
        let id = itemKey(item, i);
        while (seen.has(id)) id = `${id}~`;
        seen.add(id);
        const data = JSON.stringify(item);
        rows.push({ collection, id, data, hash: hashOf(data) });
      });
    } else if (kind === 'm') {
      for (const [id, item] of Object.entries(value as Record<string, unknown>)) {
        const data = JSON.stringify(item ?? null);
        rows.push({ collection, id, data, hash: hashOf(data) });
      }
    } else {
      const data = JSON.stringify(value);
      rows.push({ collection, id: '_', data, hash: hashOf(data) });
    }
  }
  return rows;
}

function rememberWritten(d: Database) {
  // Called right after loading: the rows in memory are exactly the rows stored.
  for (const r of rowsOf(d)) {
    const m = written.get(r.collection) ?? new Map();
    const prev = m.get(r.id);
    m.set(r.id, { hash: r.hash, seq: prev?.seq ?? nextSeq++ });
    written.set(r.collection, m);
  }
}

async function pgLoad(): Promise<Database | null> {
  const res = await pgPool().query<{ collection: string; id: string; seq: string; data: string }>('SELECT collection, id, seq, data FROM lms_records');
  if (!res.rows.length) return null;
  const groups = new Map<string, { id: string; seq: number; data: string }[]>();
  for (const r of res.rows) {
    const seq = Number(r.seq);
    nextSeq = Math.max(nextSeq, seq + 1);
    (groups.get(r.collection) ?? groups.set(r.collection, []).get(r.collection)!).push({ id: r.id, seq, data: r.data });
    const m = written.get(r.collection) ?? new Map();
    m.set(r.id, { hash: hashOf(r.data), seq });
    written.set(r.collection, m);
  }
  const out: Record<string, unknown> = {};
  const keysRow = groups.get('s:__keys');
  groups.delete('s:__keys');
  if (keysRow) for (const [key, kind] of Object.entries(JSON.parse(keysRow[0].data) as Record<string, Kind>)) out[key] = kind === 'a' ? [] : kind === 'm' ? {} : null;
  for (const [collection, rows] of groups) {
    const kind = collection.slice(0, 1) as Kind;
    const key = collection.slice(2);
    if (kind === 'a') {
      rows.sort((a, b) => (NEWEST_FIRST.has(key) ? b.seq - a.seq : a.seq - b.seq));
      out[key] = rows.map((r) => JSON.parse(r.data));
    } else if (kind === 'm') {
      out[key] = Object.fromEntries(rows.map((r) => [r.id, JSON.parse(r.data)]));
    } else {
      out[key] = JSON.parse(rows[0].data);
    }
  }
  return out as unknown as Database;
}

async function pgWrite() {
  const rows = rowsOf(state!);
  const upserts: (Row & { seq: number })[] = [];
  const present = new Map<string, Set<string>>();
  // Lists kept newest-first get their order numbers from the end, so the newest item has the highest.
  const lengths = new Map<string, number>();
  for (const r of rows) lengths.set(r.collection, (lengths.get(r.collection) ?? 0) + 1);
  const position = new Map<string, number>();
  for (const r of rows) {
    const ids = present.get(r.collection) ?? present.set(r.collection, new Set()).get(r.collection)!;
    ids.add(r.id);
    const i = position.get(r.collection) ?? 0;
    position.set(r.collection, i + 1);
    const prev = written.get(r.collection)?.get(r.id);
    if (prev && prev.hash === r.hash) continue;
    let seq = prev?.seq;
    if (seq === undefined) {
      const key = r.collection.slice(2);
      // A first write of a whole list keeps its order; later items get ever-higher numbers.
      seq = written.has(r.collection) ? nextSeq++ : NEWEST_FIRST.has(key) ? nextSeq + (lengths.get(r.collection)! - i) : nextSeq + i;
    }
    upserts.push({ ...r, seq });
  }
  for (const [c, n] of lengths) if (!written.has(c)) nextSeq += n + 1;
  const deletes: { collection: string; ids: string[] }[] = [];
  for (const [collection, m] of written) {
    const keep = present.get(collection) ?? new Set();
    const gone = [...m.keys()].filter((id) => !keep.has(id));
    if (gone.length) deletes.push({ collection, ids: gone });
  }
  if (!upserts.length && !deletes.length) return;

  const client = await pgPool().connect();
  try {
    await client.query('BEGIN');
    // Batches of ~4 MB keep each statement a sensible size.
    let batch: typeof upserts = [];
    let bytes = 0;
    const send = async () => {
      if (!batch.length) return;
      await client.query(
        `INSERT INTO lms_records (collection, id, seq, data)
         SELECT * FROM unnest($1::text[], $2::text[], $3::bigint[], $4::text[])
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, seq = EXCLUDED.seq`,
        [batch.map((r) => r.collection), batch.map((r) => r.id), batch.map((r) => r.seq), batch.map((r) => r.data)],
      );
      batch = [];
      bytes = 0;
    };
    for (const u of upserts) {
      batch.push(u);
      bytes += u.data.length;
      if (bytes > 4_000_000 || batch.length >= 2000) await send();
    }
    await send();
    for (const d of deletes) await client.query('DELETE FROM lms_records WHERE collection = $1 AND id = ANY($2::text[])', [d.collection, d.ids]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  // Stored: remember it.
  for (const u of upserts) {
    const m = written.get(u.collection) ?? written.set(u.collection, new Map()).get(u.collection)!;
    m.set(u.id, { hash: u.hash, seq: u.seq });
  }
  for (const d of deletes) for (const id of d.ids) written.get(d.collection)?.delete(id);
}

/* ------------------------------------------------------------------ */
/* Shutdown                                                            */
/* ------------------------------------------------------------------ */

/** Save everything and let go of the database, so the next server can take over at once. */
export async function closeDb() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  dirty = dirty || !!state;
  // Two tries: a shutdown is the one moment a lost write cannot be retried later.
  await flush();
  if (dirty) await flush();
  if (lockClient) {
    lockClient.removeAllListeners('error');
    await lockClient.end().catch(() => undefined);
    lockClient = null;
  }
  if (pool) {
    await pool.end().catch(() => undefined);
    pool = null;
  }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    console.log(`[db] ${sig} received: saving and stopping.`);
    // Never hang a shutdown forever.
    const force = setTimeout(() => process.exit(0), 20_000);
    force.unref();
    void closeDb()
      .catch((e) => console.error('[db] Error while saving on shutdown:', (e as Error).message))
      .finally(() => process.exit(0));
  });
}
