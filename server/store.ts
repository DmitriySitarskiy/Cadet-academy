import fs from 'fs';
import path from 'path';

// Сховище для даних порталу, яких багато і які додаються по одному рядку:
// офіцери, кадрові аудити, звіти складу. Кожен запис — окремий маленький рядок,
// тому нічого не перезаписується цілою базою і одночасні звіти не затирають одне одного.
export type TableName = 'officers' | 'hr_audits' | 'craft_reports';

const isNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isNetlify ? path.resolve('/tmp', 'data') : path.resolve(process.cwd(), 'data');
const FILE = path.resolve(DATA_DIR, 'portal.json');

const SUPABASE_URL = process.env.SUPABASE_URL
  ? process.env.SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
  : '';
const SUPABASE_KEY = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY)?.trim() || '';
const CLOUD = Boolean(SUPABASE_URL && SUPABASE_KEY);

export class StoreError extends Error {}

function cloudHeaders(extra: Record<string, string> = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function cloud(method: string, pathAndQuery: string, body?: unknown, extra: Record<string, string> = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      method,
      headers: cloudHeaders(extra),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e: any) {
    throw new StoreError(`База даних недоступна: ${e.message}`);
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404 || /PGRST205|42P01|does not exist|schema cache/i.test(text)) {
      throw new StoreError('Таблиці порталу ще не створені в Supabase. Виконайте файл supabase-portal.sql у SQL Editor.');
    }
    console.error('[Store]', method, pathAndQuery, res.status, text);
    throw new StoreError(`Помилка бази даних (${res.status})`);
  }
  if (res.status === 204) return null;
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------- Локальний режим (розробка без Supabase) ----------
type LocalDb = Record<TableName, { id: string; createdAt: string; data: any }[]>;
let local: LocalDb | null = null;

function loadLocal(): LocalDb {
  if (local) return local;
  try {
    if (fs.existsSync(FILE)) {
      local = { officers: [], hr_audits: [], craft_reports: [], ...JSON.parse(fs.readFileSync(FILE, 'utf-8')) };
      return local!;
    }
  } catch (e) {
    console.warn('portal.json недоступний:', e);
  }
  local = { officers: [], hr_audits: [], craft_reports: [] };
  return local;
}

function saveLocal() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(local, null, 2), 'utf-8');
  } catch (e) {
    console.error('Помилка збереження portal.json:', e);
  }
}

const q = (v: string) => encodeURIComponent(v);

export const store = {
  cloud: CLOUD,

  async get<T>(table: TableName, id: string): Promise<T | null> {
    if (!CLOUD) return (loadLocal()[table].find((r) => r.id === id)?.data as T) ?? null;
    const rows = await cloud('GET', `${table}?id=eq.${q(id)}&select=data&limit=1`);
    return rows && rows[0] ? (rows[0].data as T) : null;
  },

  // Найновіші спочатку; limit обмежує трафік до бази
  async list<T>(table: TableName, limit = 200): Promise<T[]> {
    if (!CLOUD) {
      return [...loadLocal()[table]]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((r) => r.data as T);
    }
    const rows = await cloud('GET', `${table}?select=data&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 1000))}`);
    return (rows || []).map((r: any) => r.data as T);
  },

  async put<T>(table: TableName, id: string, data: T): Promise<void> {
    if (!CLOUD) {
      const t = loadLocal()[table];
      const i = t.findIndex((r) => r.id === id);
      if (i >= 0) t[i].data = data;
      else t.push({ id, createdAt: new Date().toISOString(), data });
      saveLocal();
      return;
    }
    await cloud('POST', `${table}?on_conflict=id`, { id, data }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
  },

  async remove(table: TableName, id: string): Promise<void> {
    if (!CLOUD) {
      const db = loadLocal();
      db[table] = db[table].filter((r) => r.id !== id);
      saveLocal();
      return;
    }
    await cloud('DELETE', `${table}?id=eq.${q(id)}`, undefined, { Prefer: 'return=minimal' });
  },
};
