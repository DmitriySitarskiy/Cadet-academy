import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { getDb, saveDb, ensureDbLoaded } from './server/db.js';
import { sendDiscordExamSubmission, sendDiscordInstructorDecision } from './server/discord.js';
import { ExamToken, ExamResult, AnswerSubmission, AntiCheatEvent, User, UserRole, AppSettings } from './src/types.js';

dotenv.config();

const __dirname = process.cwd();

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

// APP_URL: спершу явна змінна, далі автоматичні змінні Render / Netlify, інакше localhost.
// Прибираємо пробіли та кінцеві слеші, щоб redirect_uri збігався з Discord Developer Portal.
const APP_URL = (
  process.env.APP_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.URL ||
  `http://localhost:${PORT}`
)
  .trim()
  .replace(/\/+$/, '');

const IS_HTTPS = APP_URL.startsWith('https://');
const IS_PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

// Render / Netlify стоять за проксі — потрібно, щоб req.ip та Secure-cookie працювали правильно
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

app.use(async (req, res, next) => {
  try {
    await ensureDbLoaded();
  } catch (err) {
    console.warn('Помилка підвантаження бази:', err);
  }
  next();
});

// ==================== СЕСІЇ (підписаний httpOnly cookie) ====================

const SESSION_COOKIE = 'cadet_session';
const OAUTH_STATE_COOKIE = 'cadet_oauth_state';
const SESSION_TTL_SEC = 12 * 60 * 60; // 12 годин
const SHERIFF_ROOT_ID = 'usr_sheriff_root';

function buildSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const parts = [process.env.ADMIN_PASSWORD, process.env.DISCORD_CLIENT_SECRET, process.env.SUPABASE_ANON_KEY, process.env.SUPABASE_KEY].filter(Boolean);
  if (parts.length > 0) {
    console.warn('[Security] SESSION_SECRET не задано — ключ сесій виведено зі змінних середовища. Рекомендується задати SESSION_SECRET.');
    return crypto.createHash('sha256').update(`cadet-session|${parts.join('|')}`).digest('hex');
  }
  console.warn('[Security] SESSION_SECRET не задано — використано випадковий ключ (сесії скидатимуться після перезапуску).');
  return crypto.randomBytes(32).toString('hex');
}
const SESSION_SECRET = buildSessionSecret();

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = crypto.createHash('sha256').update(a).digest();
  const bb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ab, bb);
}

function createSessionToken(userId: string): string {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_SEC * 1000 }));
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data?.uid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return String(data.uid);
  } catch {
    return null;
  }
}

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      /* ignore */
    }
  }
  return out;
}

function setCookie(res: express.Response, name: string, value: string, maxAgeSec: number) {
  res.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${IS_HTTPS ? '; Secure' : ''}`
  );
}

function clearCookie(res: express.Response, name: string) {
  setCookie(res, name, '', 0);
}

function startSession(res: express.Response, user: User) {
  setCookie(res, SESSION_COOKIE, createSessionToken(user.id), SESSION_TTL_SEC);
}

function ensureSheriffRoot(): User {
  const db = getDb();
  let sheriff = db.users.find((u) => u.id === SHERIFF_ROOT_ID);
  if (!sheriff) {
    sheriff = {
      id: SHERIFF_ROOT_ID,
      name: 'Шериф Департаменту',
      role: 'leader',
      staticId: '#0001',
      authMethod: 'manual',
    };
    db.users.unshift(sheriff);
  }
  return sheriff;
}

// Єдине джерело правди про поточного користувача — підписаний cookie.
// Заголовок x-user-id / параметр userId більше НЕ довіряються.
function getCurrentUser(req?: express.Request): User | null {
  if (!req) return null;
  const uid = verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
  if (!uid) return null;
  const db = getDb();
  const found = db.users.find((u) => u.id === uid);
  if (found) return found;
  // Акаунт резервного входу не повинен зникати, якщо базу перезавантажили з хмари
  if (uid === SHERIFF_ROOT_ID) return ensureSheriffRoot();
  return null;
}

function requireLeader(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getCurrentUser(req);
  if (user && user.role === 'leader') return next();
  return res.status(user ? 403 : 401).json({
    error: user
      ? 'Доступ обмежено: Тільки Шериф / Лідер має право керувати вебхуком, змінювати ролі та конфігурацію системи.'
      : 'Потрібна авторизація. Увійдіть через Discord або як Куратор.',
  });
}

function requireStaff(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getCurrentUser(req);
  if (user && (user.role === 'leader' || user.role === 'instructor')) return next();
  return res.status(user ? 403 : 401).json({
    error: user ? 'Доступ обмежено: Дія дозволена лише Інструкторам та Шерифу.' : 'Потрібна авторизація. Увійдіть через Discord або як Куратор.',
  });
}

// ---------- Простий обмежувач спроб (захист від підбору пароля) ----------
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  rec.count++;
  return rec.count <= max;
}

// ---------- Паролі ----------
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// Пароль Куратора: спочатку хеш, змінений в інтерфейсі; інакше ADMIN_PASSWORD зі змінних середовища.
function verifyCuratorPassword(password: string): boolean | 'not_configured' {
  const db = getDb();
  if (db.settings.curatorPasswordHash) return verifyPasswordHash(password, db.settings.curatorPasswordHash);
  const envPass = process.env.ADMIN_PASSWORD;
  if (!envPass) return 'not_configured';
  return safeEqual(password, envPass);
}

// ---------- Налаштування без секретів ----------
function settingsForUser(user: User | null): Partial<AppSettings> {
  const s = getDb().settings;
  const publicPart: Partial<AppSettings> = {
    academyName: s.academyName,
    factionTag: s.factionTag,
    roleTitles: s.roleTitles,
    antiCheatStrictness: s.antiCheatStrictness,
  };
  if (!user || (user.role !== 'leader' && user.role !== 'instructor')) return publicPart;

  const staffPart: Partial<AppSettings> = {
    ...publicPart,
    discordGuildId: s.discordGuildId,
    discordLeaderRoleId: s.discordLeaderRoleId,
    discordInstructorRoleId: s.discordInstructorRoleId,
    discordClientId: s.discordClientId,
  };
  if (user.role !== 'leader') return staffPart;

  return {
    ...staffPart,
    discordWebhookUrl: s.discordWebhookUrl,
    discordForumThreadNameFormat: s.discordForumThreadNameFormat,
    discordRoleMentionId: s.discordRoleMentionId,
    discordClientSecretSet: Boolean(getClientSecret()),
    roleAuditLogs: s.roleAuditLogs || [],
  };
}

function getClientSecret(): string {
  return (process.env.DISCORD_CLIENT_SECRET || getDb().settings.discordClientSecret || '').trim();
}

function getClientId(): string {
  return (getDb().settings.discordClientId || process.env.DISCORD_CLIENT_ID || '').trim();
}

function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      ['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'].includes(u.hostname) &&
      u.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Безпечно вбудувати JSON у <script>
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ==================== ДІАГНОСТИКА SUPABASE (ТІЛЬКИ ШЕРИФ) ====================
// Раніше цей маршрут був публічним і ПЕРЕЗАПИСУВАВ рядок id='main' (усю базу!).
// Тепер він тестує запис в окремий рядок 'connection_test' і нічого не віддає з даних.
app.get('/api/test-db', requireLeader, async (req, res) => {
  const rawUrl = process.env.SUPABASE_URL?.trim() || '';
  const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY)?.trim();

  const diagnostics: any = {
    hasUrl: Boolean(url),
    urlFormatValid: url ? url.startsWith('https://') : false,
    hasKey: Boolean(key),
    keyLength: key ? key.length : 0,
  };

  if (!url || !key) {
    return res.status(500).json({ success: false, message: 'SUPABASE_URL або SUPABASE_ANON_KEY відсутні', diagnostics });
  }

  try {
    const fetchRes = await fetch(`${url}/rest/v1/app_state?id=eq.main&select=id,updated_at`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    diagnostics.readStatus = fetchRes.status;
    if (fetchRes.ok) {
      const rows = (await fetchRes.json()) as any[];
      diagnostics.mainRowExists = rows.length > 0;
      diagnostics.mainRowUpdatedAt = rows[0]?.updated_at;
    } else {
      diagnostics.readText = (await fetchRes.text()).slice(0, 300);
    }
  } catch (err: any) {
    diagnostics.readError = err.message || String(err);
  }

  try {
    const writeRes = await fetch(`${url}/rest/v1/app_state?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: 'connection_test',
        data: { testConnection: true, time: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }),
    });
    diagnostics.writeStatus = writeRes.status;
    if (!writeRes.ok) diagnostics.writeText = (await writeRes.text()).slice(0, 300);
  } catch (err: any) {
    diagnostics.writeError = err.message || String(err);
  }

  const isSuccess = diagnostics.readStatus === 200 && (diagnostics.writeStatus === 200 || diagnostics.writeStatus === 201 || diagnostics.writeStatus === 204);
  res.json({ success: isSuccess, verdict: isSuccess ? '✅ База Supabase підключена і працює!' : '❌ Помилка зв’язку', diagnostics });
});

// ==================== AUTH & DISCORD ====================

app.get('/api/session', (req, res) => {
  const db = getDb();
  const user = getCurrentUser(req);
  res.json({
    user,
    settings: settingsForUser(user),
    // Повний список користувачів бачить лише Шериф; інші — тільки себе
    allUsers: user?.role === 'leader' ? db.users : user ? [user] : [],
  });
});

// «Переглянути як…» — тільки Шериф, з виданням нової підписаної сесії
app.post('/api/session/switch', requireLeader, (req, res) => {
  const { userId } = req.body || {};
  const db = getDb();
  const target = db.users.find((u) => u.id === userId);
  if (!target) return res.status(404).json({ error: 'Користувача не знайдено' });
  startSession(res, target);
  res.json({ success: true, user: target });
});

// Резервний вхід Шерифа
app.post('/api/auth/backup-login', (req, res) => {
  const { login, password } = req.body || {};

  if (!rateLimit(`login:${req.ip}`, 8, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Забагато спроб входу. Спробуйте через 10 хвилин.' });
  }
  if (!login || !password) {
    return res.status(400).json({ error: 'Введіть логін та пароль' });
  }

  const validLogin = (process.env.ADMIN_LOGIN || 'sheriff').trim().toLowerCase();
  const passCheck = verifyCuratorPassword(String(password).trim());

  if (passCheck === 'not_configured') {
    return res.status(503).json({
      error: 'Резервний вхід вимкнено: на сервері не задано ADMIN_PASSWORD. Додайте змінну середовища ADMIN_PASSWORD і перезапустіть сервіс.',
    });
  }

  const isLoginCorrect = String(login).trim().toLowerCase() === validLogin;
  if (!isLoginCorrect || !passCheck) {
    return res.status(401).json({ error: 'Невірний логін або пароль Куратора!' });
  }

  const sheriff = ensureSheriffRoot();
  saveDb();
  startSession(res, sheriff);
  res.json({ success: true, user: sheriff });
});

app.post('/api/auth/change-password', requireLeader, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!rateLimit(`chpass:${req.ip}`, 8, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Забагато спроб. Спробуйте пізніше.' });
  }
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Введіть поточний і новий пароль' });
  if (String(newPassword).length < 8) return res.status(400).json({ error: 'Новий пароль має містити щонайменше 8 символів' });

  const ok = verifyCuratorPassword(String(currentPassword).trim());
  if (ok === 'not_configured') return res.status(503).json({ error: 'На сервері не задано ADMIN_PASSWORD.' });
  if (!ok) return res.status(401).json({ error: 'Поточний пароль невірний' });

  getDb().settings.curatorPasswordHash = hashPassword(String(newPassword).trim());
  saveDb();
  res.json({ success: true, message: 'Пароль Куратора успішно змінено!' });
});

app.get('/api/auth/discord/url', (req, res) => {
  const clientId = getClientId();
  const redirectUri = `${APP_URL}/auth/callback`;

  if (!clientId) {
    return res.status(400).json({
      error: 'Discord Client ID не налаштовано. Шериф може вказати його у вкладці «Ролі та Доступ».',
    });
  }

  // state захищає від підміни OAuth-відповіді (CSRF)
  const state = crypto.randomBytes(16).toString('hex');
  setCookie(res, OAUTH_STATE_COOKIE, state, 10 * 60);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds guilds.members.read',
    state,
  });

  res.json({ url: `https://discord.com/oauth2/authorize?${params.toString()}`, redirectUri });
});

function authResultPage(payload: { type: 'OAUTH_AUTH_SUCCESS'; user: User } | { type: 'OAUTH_AUTH_ERROR'; error: string }): string {
  const isOk = payload.type === 'OAUTH_AUTH_SUCCESS';
  const title = isOk ? '✅ Авторизація успішна' : '⛔ Помилка авторизації';
  const color = isOk ? '#10b981' : '#f87171';
  const body = isOk
    ? `Вітаємо, <strong>${escapeHtml((payload as any).user.name)}</strong>!`
    : escapeHtml((payload as any).error);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Авторизація</title>
<style>body{background:#090d16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}
.card{background:#0f172a;border:1px solid #1e293b;padding:32px;border-radius:16px;max-width:420px;}</style></head>
<body><div class="card"><h2 style="color:${color};">${title}</h2><p>${body}</p><p style="color:#64748b;font-size:12px;">Вікно закриється автоматично…</p></div>
<script>
(function(){
  var data = ${jsonForScript(payload)};
  var origin = ${jsonForScript(new URL(APP_URL).origin)};
  // 1) postMessage в опенер (може бути недоступний, якщо Discord скинув window.opener)
  try { if (window.opener) window.opener.postMessage(data, origin); } catch (e) {}
  // 2) резервний канал між вікнами одного сайту
  try { var bc = new BroadcastChannel('cadet_auth'); bc.postMessage(data); bc.close(); } catch (e) {}
  setTimeout(function(){ window.close(); setTimeout(function(){ window.location.href = '/'; }, 800); }, ${isOk ? 600 : 2500});
})();
</script></body></html>`;
}

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code, error, state } = req.query;
  const db = getDb();
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const redirectUri = `${APP_URL}/auth/callback`;

  const fail = (msg: string) => res.send(authResultPage({ type: 'OAUTH_AUTH_ERROR', error: msg }));

  const cookieState = parseCookies(req)[OAUTH_STATE_COOKIE];
  clearCookie(res, OAUTH_STATE_COOKIE);

  if (error || !code) return fail(`Discord повернув помилку: ${String(error || 'код не отримано')}`);
  if (!cookieState || typeof state !== 'string' || !safeEqual(state, cookieState)) {
    return fail('Недійсний параметр state. Закрийте вікно й почніть вхід через Discord заново.');
  }
  if (!clientId || !clientSecret) {
    return fail('Не налаштовано Discord Client ID / Client Secret. Додайте DISCORD_CLIENT_SECRET у змінні середовища сервера.');
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Discord token error]:', tokenRes.status, errText);
      return fail(`Discord не видав токен (${tokenRes.status}). Перевірте Client ID, Client Secret та Redirect URI (${redirectUri}).`);
    }

    const tokenData: any = await tokenRes.json();
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return fail(`Не вдалося отримати профіль Discord (${userRes.status}).`);
    const discordUser: any = await userRes.json();

    let assignedRole: UserRole | null = null;
    let diagnosticInfo = '';
    let guildNickname: string | null = null;

    const guildId = (db.settings.discordGuildId || '').trim();
    const leaderRoleId = (db.settings.discordLeaderRoleId || '').trim();
    const instructorRoleId = (db.settings.discordInstructorRoleId || '').trim();

    if (guildId) {
      try {
        const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (memberRes.ok) {
          const memberData: any = await memberRes.json();
          const guildRoles: string[] = Array.isArray(memberData.roles) ? memberData.roles : [];
          guildNickname = memberData.nick || null;

          if (leaderRoleId && guildRoles.includes(leaderRoleId)) {
            assignedRole = 'leader';
          } else if (instructorRoleId && guildRoles.includes(instructorRoleId)) {
            assignedRole = 'instructor';
          } else {
            diagnosticInfo = 'Ваші ролі на сервері не збігаються з ролями Шерифа чи Інструктора, вказаними в налаштуваннях.';
          }
        } else {
          diagnosticInfo = `Discord API повернув статус ${memberRes.status}. Переконайтеся, що ви перебуваєте на сервері фракції (Guild ID налаштовано вірно).`;
        }
      } catch (err: any) {
        diagnosticInfo = `Помилка запиту до Discord: ${err.message}`;
      }
    } else {
      diagnosticInfo = 'У системі ще не вказано ID сервера Discord (Guild ID). Увійдіть як Куратор (резервний вхід) і налаштуйте його у вкладці «Ролі та Доступ».';
    }

    if (!assignedRole) {
      return fail(`У вашому Discord-акаунті відсутня роль Інструктора або Шерифа на сервері фракції. Вхід дозволено лише викладацькому складу. ${diagnosticInfo}`);
    }

    const displayName = guildNickname || discordUser.global_name || discordUser.username;
    const avatar = discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : undefined;
    let authedUser = db.users.find((u) => u.discordId === discordUser.id);

    if (authedUser) {
      authedUser.name = displayName;
      authedUser.role = assignedRole;
      authedUser.discordUsername = discordUser.username;
      authedUser.discordAvatar = avatar;
      authedUser.authMethod = 'discord_oauth';
    } else {
      authedUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: displayName,
        role: assignedRole,
        staticId: `#${Math.floor(1000 + Math.random() * 9000)}`,
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: avatar,
        authMethod: 'discord_oauth',
      };
      db.users.push(authedUser);
    }

    saveDb();
    startSession(res, authedUser);
    res.send(authResultPage({ type: 'OAUTH_AUTH_SUCCESS', user: authedUser }));
  } catch (err: any) {
    console.error('[OAuth callback error]:', err);
    fail(`Помилка сервера: ${err.message}`);
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearCookie(res, SESSION_COOKIE);
  res.json({ success: true, user: null });
});

// ==================== SETTINGS (ТІЛЬКИ ШЕРИФ) ====================

app.get('/api/settings', (req, res) => {
  res.json(settingsForUser(getCurrentUser(req)));
});

// Дозволені лише ці поля (раніше приймався будь-який JSON — «mass assignment»)
app.post('/api/settings', requireLeader, (req, res) => {
  const db = getDb();
  const body = req.body || {};

  if (typeof body.discordWebhookUrl === 'string') {
    const url = body.discordWebhookUrl.trim();
    if (url && !isValidWebhookUrl(url)) {
      return res.status(400).json({ error: 'Невірний Discord Webhook URL. Очікується https://discord.com/api/webhooks/...' });
    }
    db.settings.discordWebhookUrl = url;
  }
  if (typeof body.discordForumThreadNameFormat === 'string') db.settings.discordForumThreadNameFormat = body.discordForumThreadNameFormat.slice(0, 200);
  if (typeof body.discordRoleMentionId === 'string') db.settings.discordRoleMentionId = body.discordRoleMentionId.trim().slice(0, 40);
  if (typeof body.academyName === 'string') db.settings.academyName = body.academyName.trim().slice(0, 100);
  if (typeof body.factionTag === 'string') db.settings.factionTag = body.factionTag.trim().slice(0, 100);
  if (['high', 'medium', 'low'].includes(body.antiCheatStrictness)) db.settings.antiCheatStrictness = body.antiCheatStrictness;

  saveDb();
  res.json({ success: true, settings: settingsForUser(getCurrentUser(req)) });
});

app.post('/api/discord/test', requireLeader, async (req, res) => {
  const db = getDb();
  const webhookUrl = (req.body?.webhookUrl || db.settings.discordWebhookUrl || '').trim();
  if (!webhookUrl) return res.status(400).json({ error: 'Вкажіть URL Discord Webhook' });
  if (!isValidWebhookUrl(webhookUrl)) {
    return res.status(400).json({ error: 'Невірний Discord Webhook URL. Очікується https://discord.com/api/webhooks/...' });
  }

  try {
    const targetUrl = webhookUrl.includes('?') ? `${webhookUrl}&wait=true` : `${webhookUrl}?wait=true`;

    const payload: any = {
      username: `${db.settings.academyName || 'Шериф Академія'} | Тест`,
      avatar_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=128&q=80',
      content: 'Тестове повідомлення від Системи Онлайн-Тестування Академії.',
      // Обов'язково для Forum-каналів Discord!
      thread_name: '📋 Тестова перевірка Discord Webhook',
      embeds: [
        {
          title: '✅ Тестова перевірка інтеграції Discord',
          description: 'Зв’язок успішно встановлено! Система готова автоматично публікувати результати іспитів кадетів.',
          color: 0x10b981,
          fields: [
            { name: 'Академія', value: db.settings.academyName || 'Sheriff Academy', inline: true },
            { name: 'Фракція', value: db.settings.factionTag || 'BCSD', inline: true },
            { name: 'Час тесту', value: new Date().toLocaleString('uk-UA'), inline: true },
          ],
          footer: { text: 'Шериф Департамент • Discord Webhook' },
        },
      ],
    };

    let response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Звичайний текстовий канал не приймає thread_name — повторюємо без нього
    if (!response.ok && response.status === 400) {
      delete payload.thread_name;
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Discord Webhook Error]:', response.status, errText);
      return res.status(400).json({ error: `Discord помилка (${response.status}): ${errText}` });
    }

    res.json({ success: true, message: 'Тестове повідомлення успішно надіслано в Discord!' });
  } catch (err: any) {
    console.error('[Webhook Network Error]:', err);
    res.status(500).json({ error: `Мережева помилка: ${err.message}` });
  }
});

app.post('/api/settings/roles', requireLeader, (req, res) => {
  const db = getDb();
  const actor = getCurrentUser(req);
  const { roleTitles, discordGuildId, discordLeaderRoleId, discordInstructorRoleId, discordClientId, discordClientSecret, confirmationCode, reason } = req.body || {};

  if (!rateLimit(`roles:${req.ip}`, 10, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Забагато спроб. Спробуйте пізніше.' });
  }

  // Підтвердження: слово «ПІДТВЕРДЖУЮ» або PIN із змінної середовища LEADER_SECURITY_PIN (якщо задано)
  const envPin = (process.env.LEADER_SECURITY_PIN || '').trim();
  const codeOk =
    confirmationCode === 'ПІДТВЕРДЖУЮ' ||
    confirmationCode === 'ПІДТВЕРДИТИ' ||
    (envPin !== '' && typeof confirmationCode === 'string' && safeEqual(confirmationCode, envPin));
  if (!codeOk) {
    return res.status(400).json({ error: 'Невірний код! Введіть слово "ПІДТВЕРДЖУЮ"' + (envPin ? ' або PIN лідера' : '') });
  }

  const before = { ...db.settings.roleTitles };
  const beforeLeaderRole = db.settings.discordLeaderRoleId || '';
  const beforeInstructorRole = db.settings.discordInstructorRoleId || '';

  if (roleTitles) {
    db.settings.roleTitles = {
      leader: roleTitles.leader?.trim() || db.settings.roleTitles.leader,
      instructor: roleTitles.instructor?.trim() || db.settings.roleTitles.instructor,
      cadet: roleTitles.cadet?.trim() || db.settings.roleTitles.cadet,
    };
  }
  if (typeof discordGuildId === 'string') db.settings.discordGuildId = discordGuildId.trim();
  if (typeof discordLeaderRoleId === 'string') db.settings.discordLeaderRoleId = discordLeaderRoleId.trim();
  if (typeof discordInstructorRoleId === 'string') db.settings.discordInstructorRoleId = discordInstructorRoleId.trim();
  if (typeof discordClientId === 'string') db.settings.discordClientId = discordClientId.trim();
  // Порожній secret = «не змінювати» (клієнт ніколи не отримує поточне значення)
  if (typeof discordClientSecret === 'string' && discordClientSecret.trim()) {
    db.settings.discordClientSecret = discordClientSecret.trim();
  }

  // Журнал змін ролей
  const audit = db.settings.roleAuditLogs || [];
  const stamp = () => `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const makeEntry = (targetRole: UserRole, oldTitle: string, newTitle: string, oldId: string, newId: string) => ({
    id: stamp(),
    timestamp: new Date().toISOString(),
    actorName: actor?.name || 'Невідомо',
    actorDiscordId: actor?.discordId,
    targetRole,
    oldTitle,
    newTitle,
    oldDiscordRoleId: oldId,
    newDiscordRoleId: newId,
    reason: typeof reason === 'string' ? reason.trim().slice(0, 300) : undefined,
  });
  if (before.leader !== db.settings.roleTitles.leader || beforeLeaderRole !== (db.settings.discordLeaderRoleId || '')) {
    audit.unshift(makeEntry('leader', before.leader, db.settings.roleTitles.leader, beforeLeaderRole, db.settings.discordLeaderRoleId || ''));
  }
  if (before.instructor !== db.settings.roleTitles.instructor || beforeInstructorRole !== (db.settings.discordInstructorRoleId || '')) {
    audit.unshift(makeEntry('instructor', before.instructor, db.settings.roleTitles.instructor, beforeInstructorRole, db.settings.discordInstructorRoleId || ''));
  }
  db.settings.roleAuditLogs = audit.slice(0, 50);

  saveDb();
  res.json({ success: true, settings: settingsForUser(actor), message: 'Ролі успішно оновлено!' });
});

app.get('/api/discord/logs', requireStaff, (req, res) => {
  res.json(getDb().discordLogs);
});

// ==================== INSTRUCTOR MANAGEMENT (ТІЛЬКИ ШЕРИФ) ====================

app.get('/api/instructors', requireStaff, (req, res) => {
  res.json(getDb().users);
});

app.post('/api/instructors', requireLeader, (req, res) => {
  const db = getDb();
  const { name, role, staticId, discordId } = req.body || {};
  if (!name || !role) return res.status(400).json({ error: 'ПІБ та роль обов’язкові' });

  const newUser: User = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    role: role === 'leader' ? 'leader' : 'instructor',
    staticId: staticId || '',
    discordId: discordId || '',
  };
  db.users.push(newUser);
  saveDb();
  res.json(newUser);
});

app.delete('/api/instructors/:id', requireLeader, (req, res) => {
  const db = getDb();
  if (req.params.id === SHERIFF_ROOT_ID) {
    return res.status(400).json({ error: 'Акаунт резервного входу Шерифа видалити не можна.' });
  }
  db.users = db.users.filter((u) => u.id !== req.params.id);
  saveDb();
  res.json({ success: true });
});

// ==================== TESTS CRUD (Шериф та Інструктори) ====================

app.get('/api/tests', requireStaff, (req, res) => {
  res.json(getDb().tests);
});

app.post('/api/tests', requireStaff, (req, res) => {
  const db = getDb();
  const testData = req.body;
  if (!testData.title) return res.status(400).json({ error: 'Назва обов’язкова' });

  const newTest = {
    id: `test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: testData.title,
    description: testData.description || '',
    category: testData.category || 'Загальне',
    timeLimitMinutes: Number(testData.timeLimitMinutes) || 15,
    passingScorePercent: Number(testData.passingScorePercent) || 80,
    randomQuestionCount: Number(testData.randomQuestionCount) || 5,
    maxAttempts: Number(testData.maxAttempts) || 2,
    cooldownHours: Number(testData.cooldownHours) || 24,
    isActive: testData.isActive ?? true,
    questions: testData.questions || [],
  };
  db.tests.push(newTest);
  saveDb();
  res.json(newTest);
});

app.put('/api/tests/:id', requireStaff, (req, res) => {
  const db = getDb();
  const idx = db.tests.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Тест не знайдено' });
  db.tests[idx] = { ...db.tests[idx], ...req.body, id: db.tests[idx].id };
  saveDb();
  res.json(db.tests[idx]);
});

app.delete('/api/tests/:id', requireStaff, (req, res) => {
  const db = getDb();
  db.tests = db.tests.filter((t) => t.id !== req.params.id);
  saveDb();
  res.json({ success: true });
});

// ==================== LINKS & EXAMS ====================

app.get('/api/tokens', requireStaff, (req, res) => {
  res.json(getDb().tokens);
});

app.post('/api/links/generate', requireStaff, (req, res) => {
  const { cadetNickname, cadetStatic, cadetDiscord, testId } = req.body || {};
  if (!cadetNickname || !cadetStatic || !testId) return res.status(400).json({ error: 'Заповніть поля' });
  
  const db = getDb();
  const test = db.tests.find((t) => t.id === testId);
  if (!test) return res.status(404).json({ error: 'Тест не знайдено' });

  // ── Контроль перездач: інтервал між іспитами та ліміт спроб ──
  {
    const norm = (v: any) => String(v || '').trim().toLowerCase();
    const staticKey = norm(cadetStatic);
    const now = Date.now();
    const cooldownMs = (Number(test.cooldownHours) >= 0 ? Number(test.cooldownHours) : 24) * 3600 * 1000;
    const fmt = (ms: number) => new Date(ms).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    const sameCadet = (x: any) => norm(x.cadetStatic) === staticKey && x.testId === testId;
    const cadetResults = db.results.filter(sameCadet);

    if (cadetResults.some((r) => r.status === 'passed')) {
      return res.status(409).json({ error: 'Цей кадет уже склав цей тест. Нове посилання не потрібне.' });
    }
    if (cadetResults.some((r) => r.status === 'pending_review')) {
      return res.status(409).json({ error: 'Робота кадета ще на перевірці. Спершу винесіть вердикт.' });
    }
    const activeToken = db.tokens.find(
      (t) => sameCadet(t) && (t.status === 'pending' || t.status === 'in_progress') && new Date(t.expiresAt).getTime() > now
    );
    if (activeToken) {
      return res.status(409).json({ error: 'Для цього кадета вже є активне посилання на цей тест. Дочекайтесь його використання або завершення терміну.' });
    }

    const failed = cadetResults.filter((r) => r.status === 'failed');
    const maxAttempts = Number(test.maxAttempts) || 0;
    if (maxAttempts > 0 && failed.length >= maxAttempts) {
      return res.status(409).json({ error: `Кадет вичерпав ліміт спроб (${maxAttempts}). Щоб дозволити ще одну, винесіть рішення «Дозволити перездачу» в останній роботі.` });
    }
    if (failed.length > 0) {
      const last = failed.reduce((a, b) => (new Date(a.submittedAt) > new Date(b.submittedAt) ? a : b));
      const availableAt = new Date(last.submittedAt).getTime() + cooldownMs;
      if (availableAt > now) {
        return res.status(429).json({ error: `Кадет не склав тест. Наступна спроба буде доступна після ${fmt(availableAt)} (інтервал між іспитами — ${Math.round(cooldownMs / 3600000)} год).` });
      }
    }
  }

  const activeInstructor = getCurrentUser(req);
  const pool = [...test.questions];
  const countToPick = Math.min(pool.length, test.randomQuestionCount || 5);
  const shuffledPool = shuffleArray(pool);
  const selectedQuestions = shuffledPool.slice(0, countToPick);
  const selectedQuestionIds = selectedQuestions.map((q) => q.id);

  const optionsShuffle: Record<string, number[]> = {};
  selectedQuestions.forEach((q) => {
    if (q.options && q.options.length > 0) {
      optionsShuffle[q.id] = shuffleArray(q.options.map((_, i) => i));
    }
  });

  const instructorId = activeInstructor ? activeInstructor.id : 'usr_curator';
  const instructorName = activeInstructor ? activeInstructor.name : 'Інструктор Академії';

  const tokenString = `exam-${crypto.randomBytes(8).toString('hex')}`;
  const newToken: ExamToken = {
    id: `tok_${Date.now()}`,
    token: tokenString,
    testId: test.id,
    testTitle: test.title,
    cadetNickname: cadetNickname.trim(),
    cadetStatic: cadetStatic.trim(),
    cadetDiscord: (cadetDiscord || '').trim(),
    instructorId,
    instructorName,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    selectedQuestionIds,
    optionsShuffle,
  };

  db.tokens.unshift(newToken);
  saveDb();

  const examLink = `${APP_URL}/#exam-${newToken.token}`;
  const discordCopyTemplate = `**[Академія Кадетів] Персональний іспит**\n👤 Кадет: **${cadetNickname}** (${cadetStatic})\n📋 Іспит: **${test.title}**\n⏱️ Час: **${test.timeLimitMinutes} хвилин**\n🎯 Прохідний бал: **${test.passingScorePercent}%**\n🔗 Одноразове посилання: ${examLink}`;

  res.json({ token: newToken, examLink, discordCopyTemplate });
});

app.get('/api/exam/:token', (req, res) => {
  const db = getDb();
  const tokenRecord = db.tokens.find((t) => t.token === req.params.token);
  if (!tokenRecord) return res.status(404).json({ error: 'Іспит не знайдено' });

  const test = db.tests.find((t) => t.id === tokenRecord.testId);
  if (!test) return res.status(404).json({ error: 'Тест не знайдено' });

  if (tokenRecord.status === 'submitted') {
    return res.status(409).json({ error: 'Це посилання вже використано: іспит складено. Попросіть інструктора видати нове.' });
  }
  if (tokenRecord.status === 'pending' && new Date(tokenRecord.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: 'Термін дії посилання минув. Попросіть інструктора видати нове.' });
  }

  if (tokenRecord.status === 'pending') {
    tokenRecord.status = 'in_progress';
    tokenRecord.startedAt = new Date().toISOString();
    saveDb();
  }

  const questionsMap = new Map(test.questions.map((q) => [q.id, q]));
  const sanitizedQuestions = tokenRecord.selectedQuestionIds.map((qid) => {
    const q = questionsMap.get(qid);
    if (!q) return null;
    const shuffleOrder = tokenRecord.optionsShuffle[q.id];
    let preparedOptions = q.options ? [...q.options] : undefined;
    if (preparedOptions && shuffleOrder) {
      preparedOptions = shuffleOrder.map((originalIdx) => q.options![originalIdx]);
    }
    return { id: q.id, type: q.type, title: q.title, description: q.description, category: q.category, options: preparedOptions, maxPoints: q.maxPoints };
  }).filter(Boolean);

  res.json({
    token: tokenRecord.token,
    testTitle: test.title,
    testDescription: test.description,
    timeLimitMinutes: test.timeLimitMinutes,
    passingScorePercent: test.passingScorePercent,
    cadetNickname: tokenRecord.cadetNickname,
    cadetStatic: tokenRecord.cadetStatic,
    cadetDiscord: tokenRecord.cadetDiscord,
    startedAt: tokenRecord.startedAt,
    serverNow: new Date().toISOString(),
    questions: sanitizedQuestions,
  });
});

app.post('/api/exam/:token/submit', async (req, res) => {
  const { answers, antiCheatEvents, timeSpentSeconds } = req.body || {};
  const db = getDb();
  const tokenRecord = db.tokens.find((t) => t.token === req.params.token);
  if (!tokenRecord) return res.status(404).json({ error: 'Іспит не знайдено' });
  if (tokenRecord.status === 'submitted') {
    return res.status(409).json({ error: 'Відповіді за цим посиланням вже надіслано.' });
  }

  const test = db.tests.find((t) => t.id === tokenRecord.testId);
  if (!test) return res.status(404).json({ error: 'Тест не знайдено' });

  let autoScore = 0;
  let maxAutoScore = 0;
  let maxManualScore = 0;
  let hasOpen = false;
  const questionsMap = new Map(test.questions.map((q) => [q.id, q]));
  const evaluatedAnswers: AnswerSubmission[] = [];

  for (const qid of tokenRecord.selectedQuestionIds) {
    const q = questionsMap.get(qid);
    if (!q) continue;
    const userAns = (answers || []).find((a: any) => a.questionId === qid) || {};
    const shuffleOrder = tokenRecord.optionsShuffle[q.id] || [];

    // 1. Одиночний вибір
    if (q.type === 'single') {
      maxAutoScore += q.maxPoints;
      let isCorrect = false;
      let score = 0;
      if (userAns.selectedOption !== undefined && userAns.selectedOption !== null) {
        const originalSelected = shuffleOrder.length > 0 ? shuffleOrder[userAns.selectedOption] : userAns.selectedOption;
        if (originalSelected === q.correctOption) {
          isCorrect = true;
          score = q.maxPoints;
          autoScore += score;
        }
      }
      evaluatedAnswers.push({
        questionId: q.id,
        type: 'single',
        selectedOption: userAns.selectedOption,
        autoScore: score,
        maxPoints: q.maxPoints,
        isCorrect,
      });
    }
    // 2. Множинний вибір (ТЕПЕР ВРАХОВУЄТЬСЯ І ДОДАЄТЬСЯ В БАЛИ!)
    else if (q.type === 'multiple') {
      maxAutoScore += q.maxPoints;
      let isCorrect = false;
      let score = 0;

      const userSelections: number[] = userAns.selectedOptions || [];
      const mappedOriginals = shuffleOrder.length > 0
        ? userSelections.map((dispIdx) => (shuffleOrder[dispIdx] !== undefined ? shuffleOrder[dispIdx] : dispIdx)).sort()
        : [...userSelections].sort();
      const actualCorrect = [...(q.correctOptions || [])].sort();

      const isExactMatch =
        mappedOriginals.length === actualCorrect.length &&
        mappedOriginals.every((val, index) => val === actualCorrect[index]);

      if (isExactMatch) {
        isCorrect = true;
        score = q.maxPoints;
        autoScore += score;
      }
      // Якщо обрано не всі — залишається 0 балів!

      evaluatedAnswers.push({
        questionId: q.id,
        type: 'multiple',
        selectedOptions: userSelections,
        autoScore: score,
        maxPoints: q.maxPoints,
        isCorrect,
      });
    }

    // 3. Відкритий кейс
    else if (q.type === 'open') {
      hasOpen = true;
      maxManualScore += q.maxPoints;
      evaluatedAnswers.push({
        questionId: q.id,
        type: 'open',
        textAnswer: (userAns.textAnswer || '').trim(),
        manualScore: 0,
        maxPoints: q.maxPoints,
      });
    }
  }

  const maxTotalScore = maxAutoScore + maxManualScore;
  const percentage = maxTotalScore > 0 ? Math.round((autoScore / maxTotalScore) * 100) : 0;
  const finalStatus = hasOpen ? 'pending_review' : (percentage >= test.passingScorePercent ? 'passed' : 'failed');

  const newResult: ExamResult = {
    id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    token: tokenRecord.token,
    testId: test.id,
    testTitle: test.title,
    cadetNickname: tokenRecord.cadetNickname,
    cadetStatic: tokenRecord.cadetStatic,
    cadetDiscord: tokenRecord.cadetDiscord,
    instructorId: tokenRecord.instructorId,
    instructorName: tokenRecord.instructorName,
    startedAt: tokenRecord.startedAt || new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    timeSpentSeconds: Number(timeSpentSeconds) || 0,
    autoScore,
    maxAutoScore,
    manualScore: 0,
    maxManualScore,
    totalScore: autoScore,
    maxTotalScore,
    percentage,
    autoPassed: percentage >= test.passingScorePercent,
    hasOpenQuestions: hasOpen,
    status: finalStatus,
    answers: evaluatedAnswers,
    antiCheatEvents: antiCheatEvents || [],
    discordPosted: false,
  };

  tokenRecord.status = 'submitted';
  db.results.unshift(newResult);
  saveDb();

  // Обов'язково чекаємо відправку в Discord, щоб захопити ID створеної гілки!
  try {
    const discordRes = await sendDiscordExamSubmission(newResult, APP_URL);
    if (discordRes.success) {
      newResult.discordPosted = true;
      saveDb();
    }
  } catch (err) {
    console.error('Discord submission error:', err);
  }

  res.json({
    success: true,
    resultId: newResult.id,
    percentage,
    autoScore,
    maxAutoScore,
    status: newResult.status,
  });
});

// Results
app.get('/api/results', requireStaff, (req, res) => {
  res.json(getDb().results);
});

app.get('/api/results/:id', requireStaff, (req, res) => {
  const db = getDb();
  const result = db.results.find((r) => r.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Не знайдено' });

  const test = db.tests.find((t) => t.id === result.testId);
  const token = db.tokens.find((t) => t.token === result.token);

  // Підставляємо повний текст питань, правильні варіанти та вибір кадета
  const detailedAnswers = (result.answers || []).map((ans: any) => {
    const question = test?.questions?.find((q: any) => q.id === ans.questionId);
    const shuffle = token?.optionsShuffle?.[ans.questionId];

    let finalSelectedOption = ans.selectedOption;
    if (ans.type === 'single' && shuffle && ans.selectedOption !== undefined && shuffle[ans.selectedOption] !== undefined) {
      finalSelectedOption = shuffle[ans.selectedOption];
    }

    let finalSelectedOptions = ans.selectedOptions || [];
    if (ans.type === 'multiple' && shuffle && Array.isArray(ans.selectedOptions)) {
      finalSelectedOptions = ans.selectedOptions.map((dispIdx: number) => (shuffle[dispIdx] !== undefined ? shuffle[dispIdx] : dispIdx));
    }

    return {
      ...ans,
      selectedOption: finalSelectedOption,
      selectedOptions: finalSelectedOptions,
      title: question?.title || 'Питання (без назви)',
      description: question?.description || '',
      category: question?.category || '',
      explanation: question?.explanation || '',
      options: question?.options || [],
      correctOption: question?.correctOption,
      correctOptions: question?.correctOptions || [],
    };
  });

  res.json({
    ...result,
    test,
    tokenRecord: token,
    answers: detailedAnswers,
  });
});

app.post('/api/results/:id/grade-open', requireStaff, (req, res) => {
  const { grades } = req.body || {};
  if (!Array.isArray(grades)) return res.status(400).json({ error: 'Невірні дані оцінок' });
  const db = getDb();
  const result: any = db.results.find((r) => r.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Результат не знайдено' });
  const test = db.tests.find((t) => t.id === result.testId);

  for (const g of grades) {
    const ans = (result.answers || []).find((a: any) => a.questionId === g.questionId && a.type === 'open');
    if (!ans) continue;
    const max = Number(ans.maxPoints) || 0;
    const score = Math.max(0, Math.min(max, Math.round(Number(g.manualScore) || 0)));
    ans.manualScore = score;
    ans.instructorComment = String(g.instructorComment || '').slice(0, 2000);
  }

  const openAnswers = (result.answers || []).filter((a: any) => a.type === 'open');
  result.manualScore = openAnswers.reduce((sum: number, a: any) => sum + (Number(a.manualScore) || 0), 0);
  result.totalScore = (Number(result.autoScore) || 0) + result.manualScore;
  const maxTotal = Number(result.maxTotalScore) || 0;
  result.percentage = maxTotal > 0 ? Math.round((result.totalScore / maxTotal) * 100) : 0;

  const passMark = test?.passingScorePercent ?? 70;
  result.autoPassed = result.percentage >= passMark;
  // Якщо інструктор ще не виніс вердикт, статус лишається «на перевірці»
  if (!result.instructorDecision) result.status = 'pending_review';

  saveDb();
  res.json({ success: true, result });
});

app.post('/api/results/:id/decision', requireStaff, async (req, res) => {
  const { decision, comment, threadId } = req.body || {};
  if (!['passed', 'failed', 'retake_allowed'].includes(decision)) {
    return res.status(400).json({ error: 'Невірне рішення' });
  }
  const db = getDb();
  const result = db.results.find((r) => r.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Не знайдено' });

  // Зберігаємо або оновлюємо ID гілки Discord Forum, якщо інструктор вказав посилання чи ID
  if (threadId && typeof threadId === 'string' && threadId.trim()) {
    const cleanId = threadId.trim().split('/').filter(Boolean).pop()?.trim();
    if (cleanId) {
      result.discordThreadId = cleanId;
    }
  }

  const currentInstructor = getCurrentUser(req);
  result.status = decision;
  result.instructorDecision = {
    instructorId: currentInstructor?.id || 'usr_inst',
    instructorName: currentInstructor?.name || 'Інструктор',
    decision,
    comment: (comment || '').trim(),
    decidedAt: new Date().toISOString(),
  };

  saveDb();

  const discordRes = await sendDiscordInstructorDecision(result, APP_URL);
  res.json({ success: true, result, discordSent: discordRes.success, discordError: discordRes.error });
});

app.get('/api/cadets/history', requireStaff, (req, res) => {
  const { query } = req.query;
  const db = getDb();
  if (!query) return res.json([]);
  const q = String(query).toLowerCase().trim();
  res.json(db.results.filter((r) => r.cadetNickname.toLowerCase().includes(q) || r.cadetStatic.toLowerCase().includes(q)));
});

async function startServer() {
  if (process.env.NETLIFY) return;

  // Невідомі API-маршрути — JSON 404 (а не index.html)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут не знайдено' }));

  if (IS_PROD) {
    // Продакшн (Render): роздаємо зібраний фронтенд із dist
    const distDir = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      console.error('[Startup] Папка dist/ не знайдена. Build Command на Render має бути: npm install --include=dev && npm run build');
    }
    app.use(express.static(distDir));
    app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  const port = PORT || 3000;
  app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port} (${IS_PROD ? 'production' : 'development'}), APP_URL=${APP_URL}`));
}

if (!process.env.NETLIFY) {
  startServer();
}
