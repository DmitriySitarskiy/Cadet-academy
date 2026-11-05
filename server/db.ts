import fs from 'fs';
import path from 'path';
import { TestConfig, ExamToken, ExamResult, AppSettings, User, DiscordLogEntry } from '../src/types.js';

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
}

const defaultSettings: AppSettings = {
  academyName: process.env.ACADEMY_NAME || 'Поліцейська Академія',
  factionTag: process.env.FACTION_TAG || 'Шериф / Поліція',
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  discordForumThreadNameFormat: '📋 [ІСПИТ] {test} — {cadet} ({static})',
  discordRoleMentionId: '',
  antiCheatStrictness: 'high',
  discordGuildId: process.env.DISCORD_GUILD_ID || '',
  discordLeaderRoleId: process.env.DISCORD_LEADER_ROLE_ID || '',
  discordInstructorRoleId: process.env.DISCORD_INSTRUCTOR_ROLE_ID || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  leaderSecurityPin: process.env.LEADER_SECURITY_PIN || '7777',
  roleTitles: {
    leader: 'Шеф Департаменту / Лідер',
    instructor: 'Інструктор Академії',
    cadet: 'Кадет Академії',
  },
  roleAuditLogs: [],
};

const defaultUsers: User[] = [];
function sanitizeUsers(users: User[] = []): User[] {
  const legacy = new Set(['usr_leader_1', 'usr_inst_1', 'usr_inst_2', 'usr_initial_admin', 'usr_sheriff_root']);
  return users.filter((u) => !legacy.has(u.id));
}


async function fetchFromSupabase(): Promise<DatabaseSchema | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.main&select=data`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (res.ok) {
      const rows = (await res.json()) as any[];
      if (rows.length > 0 && rows[0].data) {
        return rows[0].data as DatabaseSchema;
      }
    }
  } catch (err) {
    console.warn('[Supabase Fetch Error]:', err);
  }
  return null;
}

async function pushToSupabase(data: DatabaseSchema): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: 'main',
        data,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      console.error('[Supabase Save Error]:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[Supabase Save Exception]:', err);
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
        settings: { ...defaultSettings, ...(parsed.settings || {}) },
        users: sanitizeUsers(parsed.users || []),
        tests: parsed.tests || [],
        tokens: parsed.tokens || [],
        results: parsed.results || [],
        discordLogs: parsed.discordLogs || [],
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
  };

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
  } catch {}

  return initialDb;
}

let dbInstance: DatabaseSchema = initDbSync();
let lastCloudFetchTime = 0;

export async function ensureDbLoaded(): Promise<void> {
  if (Date.now() - lastCloudFetchTime < 3000) return;
  const cloudDb = await fetchFromSupabase();
  if (cloudDb) {
    dbInstance = {
      settings: { ...defaultSettings, ...(cloudDb.settings || {}) },
      users: sanitizeUsers(cloudDb.users || []),
      tests: cloudDb.tests || [],
      tokens: cloudDb.tokens || [],
      results: cloudDb.results || [],
      discordLogs: cloudDb.discordLogs || [],
    };
  }
  lastCloudFetchTime = Date.now();
}

export function getDb(): DatabaseSchema {
  return dbInstance;
}

export function saveDb(): void {
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
