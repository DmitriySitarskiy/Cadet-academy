import fs from 'fs';
import path from 'path';
import { TestConfig, ExamToken, ExamResult, AppSettings, User, DiscordLogEntry, CraftItem } from '../src/types.js';

const isNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isNetlify ? path.resolve('/tmp', 'data') : path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

const SUPABASE_URL = process.env.SUPABASE_URL
  ? process.env.SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
  : '';
const SUPABASE_KEY = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY)?.trim() || '';

export interface DatabaseSchema {
  settings: AppSettings;
  users: User[];
  tests: TestConfig[];
  tokens: ExamToken[];
  results: ExamResult[];
  discordLogs: DiscordLogEntry[];
  // Рідко змінювані налаштування порталу (довідники). Великі дані лежать в окремих таблицях (server/store.ts)
  portal: PortalData;
}

export interface PortalData {
  reasons: string[]; // типові підстави кадрових рішень
  purposes: string[]; // типові цілі крафту
  catalog: CraftItem[]; // позиції крафту та вартість матеріалів
  updatedAt?: string;
  updatedBy?: string;
}

const defaultPortal: PortalData = {
  reasons: [
    'Результати співбесіди',
    'Переведення з іншого відділу',
    'Підвищення за нормативами',
    'Пониження за порушення дисципліни',
    'Звільнення за власним бажанням',
    'Звільнення за неактив',
  ],
  purposes: ['Моя добова норма'],
  catalog: [],
};

export function sanitizePortal(p: any): PortalData {
  return {
    ...defaultPortal,
    ...(p || {}),
    reasons: Array.isArray(p?.reasons) ? p.reasons : defaultPortal.reasons,
    purposes: Array.isArray(p?.purposes) ? p.purposes : defaultPortal.purposes,
    catalog: Array.isArray(p?.catalog) ? p.catalog : [],
  };
}

const defaultSettings: AppSettings = {
  academyName: process.env.ACADEMY_NAME || 'Sheriff Academy',
  factionTag: process.env.FACTION_TAG || 'BCSD',
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  discordForumThreadNameFormat: '📋 [ІСПИТ] {test} — {cadet} ({static})',
  discordRoleMentionId: '',
  antiCheatStrictness: 'high',
  discordGuildId: process.env.DISCORD_GUILD_ID || '',
  discordLeaderRoleId: process.env.DISCORD_LEADER_ROLE_ID || '',
  discordInstructorRoleId: process.env.DISCORD_INSTRUCTOR_ROLE_ID || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  // Секрет і PIN НЕ зберігаються в базі. Беруться зі змінних середовища (див. server.ts).
  discordClientSecret: '',
  roleTitles: {
    leader: 'Шеф Департаменту / Лідер',
    instructor: 'Інструктор Академії',
    cadet: 'Кадет Академії',
  },
  roleAuditLogs: [],
};

const defaultUsers: User[] = [];
function sanitizeSettings(settings: any): AppSettings {
  const merged: AppSettings = { ...defaultSettings, ...(settings || {}) };
  // Прибираємо старі чутливі поля, які раніше потрапляли в базу
  delete (merged as any).leaderSecurityPin;
  if (process.env.DISCORD_CLIENT_SECRET) merged.discordClientSecret = '';
  merged.roleTitles = { ...defaultSettings.roleTitles, ...(merged.roleTitles || {}) };
  return merged;
}

function sanitizeUsers(users: User[] = []): User[] {
  // ВАЖЛИВО: 'usr_sheriff_root' тут НЕ має бути — це акаунт резервного входу Шерифа.
  const legacy = new Set(['usr_leader_1', 'usr_inst_1', 'usr_inst_2', 'usr_initial_admin']);
  return users.filter((u) => !legacy.has(u.id));
}


const cloudHeaders = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` });
const CLOUD_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);

// Лічильники для оцінки трафіку (дивіться /api/test-db). Скидаються при перезапуску сервера.
const stats = { since: new Date().toISOString(), metaChecks: 0, fullFetches: 0, skippedFetches: 0, fullBytes: 0, lastFullKB: 0, pushes: 0, pushBytes: 0 };
export function getDbStats() {
  return { ...stats, approxEgressMB: Math.round((stats.fullBytes / 1048576) * 100) / 100 };
}

const toMs = (v: unknown): number | null => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};

// Дуже легкий запит: лише мітка часу останнього збереження (кілька десятків байтів)
async function fetchCloudStamp(): Promise<{ ok: boolean; updatedAt: number | null }> {
  try {
    stats.metaChecks++;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.main&select=updated_at`, { headers: cloudHeaders() });
    if (!res.ok) return { ok: false, updatedAt: null };
    const rows = (await res.json()) as any[];
    return { ok: true, updatedAt: rows.length ? toMs(rows[0]?.updated_at) : null };
  } catch (err) {
    console.warn('[Supabase Stamp Error]:', err);
    return { ok: false, updatedAt: null };
  }
}

async function fetchFromSupabase(): Promise<{ db: DatabaseSchema; updatedAt: number | null } | null> {
  if (!CLOUD_ENABLED) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.main&select=data,updated_at`, { headers: cloudHeaders() });
    if (res.ok) {
      const text = await res.text();
      stats.fullFetches++;
      stats.fullBytes += text.length;
      stats.lastFullKB = Math.round(text.length / 1024);
      const rows = JSON.parse(text) as any[];
      if (rows.length > 0 && rows[0].data) {
        return { db: rows[0].data as DatabaseSchema, updatedAt: toMs(rows[0].updated_at) };
      }
    }
  } catch (err) {
    console.warn('[Supabase Fetch Error]:', err);
  }
  return null;
}

let pendingPushes = 0;
let knownUpdatedAt: number | null = null; // мітка часу версії бази, яку ми вже маємо
let stampUnusable = false; // якщо Supabase не віддає updated_at, рідше перевіряємо базу
let lastSaveAt = 0;

async function pushToSupabase(data: DatabaseSchema): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  pendingPushes++;
  const stamp = new Date();
  try {
    const body = JSON.stringify({ id: 'main', data, updated_at: stamp.toISOString() });
    stats.pushes++;
    stats.pushBytes += body.length;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body,
    });
    if (!res.ok) {
      console.error('[Supabase Save Error]:', res.status, await res.text());
    } else {
      // Наше власне збереження не потрібно завантажувати назад
      knownUpdatedAt = stamp.getTime();
    }
  } catch (err) {
    console.error('[Supabase Save Exception]:', err);
  } finally {
    pendingPushes--;
    lastSaveAt = Date.now();
  }
}

function initDbSync(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        settings: sanitizeSettings(parsed.settings),
        users: sanitizeUsers(parsed.users || []),
        tests: parsed.tests || [],
        tokens: parsed.tokens || [],
        results: parsed.results || [],
        discordLogs: parsed.discordLogs || [],
        portal: sanitizePortal(parsed.portal),
      };
    }
  } catch (err) {
    console.warn('Локальний файл db.json недоступний:', err);
  }

  const initialDb: DatabaseSchema = {
    settings: defaultSettings,
    users: defaultUsers,
    tests: [],
    tokens: [],
    results: [],
    discordLogs: [],
    portal: sanitizePortal(null),
  };

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
  } catch {}

  return initialDb;
}

let dbInstance: DatabaseSchema = initDbSync();
let lastCloudFetchTime = 0;

export async function ensureDbLoaded(): Promise<void> {
  if (!CLOUD_ENABLED) return;
  const now = Date.now();
  if (now - lastCloudFetchTime < (stampUnusable ? 15000 : 3000)) return;
  // Не підтягуємо базу з хмари, поки наші зміни ще записуються (інакше свіжі дані затираються старими)
  if (pendingPushes > 0 || now - lastSaveAt < 5000) return;
  lastCloudFetchTime = now;

  // 1) Спершу легка перевірка: чи хтось змінював базу після нашої версії?
  const stamp = await fetchCloudStamp();
  stampUnusable = stamp.ok && stamp.updatedAt === null && knownUpdatedAt !== null;
  if (stamp.ok && stamp.updatedAt !== null && knownUpdatedAt !== null && stamp.updatedAt === knownUpdatedAt) {
    stats.skippedFetches++;
    return;
  }

  // 2) База змінилась (або це перший запуск): завантажуємо повністю
  const cloud = await fetchFromSupabase();
  if (cloud) {
    const cloudDb = cloud.db;
    dbInstance = {
      settings: sanitizeSettings(cloudDb.settings),
      users: sanitizeUsers(cloudDb.users || []),
      tests: cloudDb.tests || [],
      tokens: cloudDb.tokens || [],
      results: cloudDb.results || [],
      discordLogs: cloudDb.discordLogs || [],
      portal: sanitizePortal((cloudDb as any).portal),
    };
    knownUpdatedAt = cloud.updatedAt;
  }
}

export function getDb(): DatabaseSchema {
  return dbInstance;
}

export function saveDb(): void {
  lastSaveAt = Date.now();
  // Журнал Discord не має рости безкінечно (це зменшує базу й трафік)
  if (dbInstance.discordLogs.length > 200) dbInstance.discordLogs = dbInstance.discordLogs.slice(0, 200);
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(dbInstance, null, 2), 'utf-8');
  } catch (err) {
    console.error('Помилка локального збереження:', err);
  }

  pushToSupabase(dbInstance).catch((err) => {
    console.error('Помилка асинхронного збереження в Supabase:', err);
  });
}
