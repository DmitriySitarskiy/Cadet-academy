import fs from 'fs';
import path from 'path';
import { TestConfig, ExamToken, ExamResult, AppSettings, User, DiscordLogEntry } from '../src/types.js';

const isNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isNetlify ? path.resolve('/tmp', 'data') : path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

export interface DatabaseSchema {
  settings: AppSettings;
  users: User[];
  tests: TestConfig[];
  tokens: ExamToken[];
  results: ExamResult[];
  discordLogs: DiscordLogEntry[];
}

const defaultSettings: AppSettings = {
  academyName: process.env.ACADEMY_NAME || 'Академія',
  factionTag: process.env.FACTION_TAG || 'Фракція',
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

const defaultUsers: User[] = [
  {
    id: 'usr_initial_admin',
    name: 'Адміністратор системи',
    role: 'leader',
    staticId: '#0001',
    discordId: process.env.INITIAL_LEADER_DISCORD_ID || '',
    authMethod: 'manual',
  },
];

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
    console.warn('Не вдалося отримати дані з Supabase:', err);
  }
  return null;
}

async function pushToSupabase(data: DatabaseSchema): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/app_state`, {
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
  } catch (err) {
    console.error('Помилка синхронізації з Supabase:', err);
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
        users: parsed.users?.length ? parsed.users : defaultUsers,
        tests: parsed.tests || [],
        tokens: parsed.tokens || [],
        results: parsed.results || [],
        discordLogs: parsed.discordLogs || [],
      };
    }
  } catch (err) {
    console.warn('Помилка локального читання db.json:', err);
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

// 1. Початкова синхронна ініціалізація БЕЗ top-level await
let dbInstance: DatabaseSchema = initDbSync();
let lastCloudFetchTime = 0;

// 2. Функція підвантаження свіжих даних із Supabase (кеш на 5 секунд)
export async function ensureDbLoaded(): Promise<void> {
  if (Date.now() - lastCloudFetchTime < 5000) return;
  const cloudDb = await fetchFromSupabase();
  if (cloudDb) {
    dbInstance = {
      settings: { ...defaultSettings, ...(cloudDb.settings || {}) },
      users: cloudDb.users?.length ? cloudDb.users : defaultUsers,
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
  // Зберігаємо локально
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(dbInstance, null, 2), 'utf-8');
  } catch (err) {
    console.error('Помилка запису db.json:', err);
  }

  // Зберігаємо в Supabase
  pushToSupabase(dbInstance).catch((err) => {
    console.error('Supabase async save error:', err);
  });
}