import fs from 'fs';
import path from 'path';
import { TestConfig, ExamToken, ExamResult, AppSettings, User, DiscordLogEntry } from '../src/types.js';

// Визначаємо середовище: на Netlify пишемо в /tmp, локально — у ./data
const isNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isNetlify
  ? path.resolve('/tmp', 'data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

export interface DatabaseSchema {
  settings: AppSettings;
  users: User[];
  tests: TestConfig[];
  tokens: ExamToken[];
  results: ExamResult[];
  discordLogs: DiscordLogEntry[];
}

// Базові системні налаштування (за замовчуванням беруться зі змінних середовища)
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
    leader: 'Лідер',
    instructor: 'Інструктор',
    cadet: 'Кадет',
  },
  roleAuditLogs: [],
};

// Початковий системний користувач (щоб сервер не падав до першого входу через Discord)
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

function initDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('Не вдалося створити директорію бази даних:', err);
  }

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);

      return {
        settings: {
          ...defaultSettings,
          ...(parsed.settings || {}),
          roleTitles: {
            ...defaultSettings.roleTitles,
            ...(parsed.settings?.roleTitles || {}),
          },
          roleAuditLogs: parsed.settings?.roleAuditLogs || [],
        },
        users: parsed.users?.length ? parsed.users : defaultUsers,
        tests: parsed.tests || [],
        tokens: parsed.tokens || [],
        results: parsed.results || [],
        discordLogs: parsed.discordLogs || [],
      };
    }
  } catch (err) {
    console.error('Помилка читання db.json, ініціалізація нової бази:', err);
  }

  // Чиста база даних без мокових даних
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
  } catch (err) {
    console.warn('Не вдалося записати файл бази даних:', err);
  }

  return initialDb;
}

let dbInstance: DatabaseSchema = initDb();

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
    console.error('Помилка збереження бази даних:', err);
  }
}