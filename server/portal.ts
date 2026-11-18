import type express from 'express';
import { store, StoreError } from './store.js';
import type { DatabaseSchema } from './db.js';
import { parseNick } from '../src/nick.js';
import { RANKS, rankLabel } from '../src/ranks.js';
import { DEPARTMENT_NAME } from '../src/brand.js';
import type { CadetCandidate, User, PortalPerm, Officer, HrAudit, HrAuditType, CraftReport, CraftItem, CraftLine, PersonSnapshot } from '../src/types.js';

export interface PortalDeps {
  getCurrentUser(req: express.Request): User | null;
  getDb(): DatabaseSchema;
  saveDb(): void;
  rateLimit(key: string, max: number, windowMs: number): boolean;
  isValidWebhookUrl(url: string): boolean;
}

const DISCORD_ID = /^\d{17,20}$/;
const STATIC_ID = /^\d{1,8}$/;
const TYPE_LABEL: Record<HrAuditType, string> = { hire: 'Прийняття', promote: 'Підвищення', demote: 'Пониження', dismiss: 'Звільнення', correction: 'Виправлення' };
const TYPE_COLOR: Record<HrAuditType, number> = { hire: 0x57f287, promote: 0x3b82f6, demote: 0xf59e0b, dismiss: 0xef4444, correction: 0x94a3b8 };

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------- Права ----------
export const isMember = (u: User | null): u is User => !!u && ['leader', 'instructor', 'officer'].includes(u.role);
export const hasPerm = (u: User | null, p: PortalPerm): boolean => !!u && isMember(u) && (u.role === 'leader' || (u.perms || []).includes(p));

// ---------- Офіцери ----------
let officersCache: { at: number; list: Officer[] } | null = null;
const OFFICERS_TTL_MS = 20_000;
const invalidateOfficers = () => (officersCache = null);

async function listOfficers(): Promise<Officer[]> {
  if (officersCache && Date.now() - officersCache.at < OFFICERS_TTL_MS) return officersCache.list;
  const list = await store.list<Officer>('officers', 1000);
  officersCache = { at: Date.now(), list };
  return list;
}

// Створює запис офіцера при першому вході: ім'я та статік беремо з серверного нікнейму.
// Наступні входи нічого не перезаписують — людина сама правила профіль.
export async function ensureOfficer(input: { discordId: string; nick?: string | null; fallbackName?: string }, strict = false): Promise<Officer | null> {
  try {
    const existing = await store.get<Officer>('officers', input.discordId);
    if (existing) return existing;
    const parsed = parseNick(input.nick || '');
    const now = new Date().toISOString();
    const officer: Officer = {
      discordId: input.discordId,
      name: parsed.name || clean(input.fallbackName, 60),
      staticId: parsed.staticId,
      department: parsed.department,
      rank: null,
      confirmed: false,
      createdAt: now,
      updatedAt: now,
    };
    await store.put('officers', officer.discordId, officer);
    invalidateOfficers();
    return officer;
  } catch (e) {
    console.warn('[Portal] ensureOfficer:', (e as Error).message);
    if (strict) throw e;
    return null;
  }
}

const snap = (o: Officer): PersonSnapshot => ({ discordId: o.discordId, name: o.name, staticId: o.staticId, department: o.department });

// ---------- Discord ----------
function kyivStamp(iso: string): string {
  const parts = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${g('day')}.${g('month')}.${g('year')} ${g('hour')}:${g('minute')}`;
}

interface WebhookFile { name: string; type: string; data: Buffer }

async function postWebhook(url: string, payload: any, files: WebhookFile[] = []): Promise<{ ok: boolean; error?: string }> {
  if (!url) return { ok: false, error: 'Вебхук не налаштований (Ролі та доступ → Портал).' };
  const target = `${url}${url.includes('?') ? '&' : '?'}wait=true`;
  try {
    let res: Response;
    if (files.length) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      files.forEach((f, i) => form.append(`files[${i}]`, new Blob([new Uint8Array(f.data)], { type: f.type }), f.name));
      res = await fetch(target, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
    } else {
      res = await fetch(target, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
      });
    }
    if (!res.ok) return { ok: false, error: `Discord ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Не вдалося звернутись до Discord: ${e.message}` };
  }
}

const personLine = (p: PersonSnapshot) => `${p.name} ${p.staticId}${p.discordId ? ` <@${p.discordId}>` : ''}`.trim();

async function postHrAudit(db: DatabaseSchema, a: HrAudit) {
  const rank =
    a.type === 'promote' || a.type === 'demote'
      ? `${rankLabel(a.rankFrom)} → ${rankLabel(a.rankTo)}`
      : a.type === 'correction'
        ? (a.rankFrom !== a.rankTo ? `${rankLabel(a.rankFrom)} → ${rankLabel(a.rankTo)}` : rankLabel(a.rankTo))
        : rankLabel(a.type === 'dismiss' ? a.rankFrom : a.rankTo);
  const changeField = a.type === 'correction' && a.changes?.length
    ? [{ name: 'Що змінено', value: a.changes.map((c) => `• ${c.field}: ${c.from || '—'} → ${c.to || '—'}`).join('\n').slice(0, 1000) }]
    : [];
  const payload = {
    content: '🔔 **Заповнено Кадровий Аудит**',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `📝 Кадровий аудит — ${TYPE_LABEL[a.type]}`,
        color: TYPE_COLOR[a.type],
        fields: [
          { name: 'Тип кадрового аудиту', value: TYPE_LABEL[a.type] },
          { name: "Ім'я Прізвище , номер паспорту", value: personLine(a.officer).slice(0, 1000) },
          { name: 'Порядковий ранг', value: rank },
          ...changeField,
          { name: 'Згідно чого?', value: a.basis.slice(0, 1000) },
          { name: 'Хто заповнив', value: personLine(a.filer).slice(0, 1000) },
          { name: 'Дата та час заповнення', value: kyivStamp(a.createdAt) },
        ],
        footer: { text: `Відділ Кадрів | ${db.settings.academyName ? 'Blaine County Sheriff’s Department' : ''}` },
        timestamp: a.createdAt,
      },
    ],
  };
  return postWebhook((db.settings.discordHrWebhookUrl || '').trim(), payload);
}

// ---------- Скріншоти ----------
const MAX_SHOT_BYTES = 4 * 1024 * 1024;
function decodeShot(dataUrl: unknown, label: string, idx: number): WebhookFile {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error(`Скріншот «${label}» відсутній або має невірний формат (потрібні JPG, PNG або WebP).`);
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_SHOT_BYTES) throw new Error(`Скріншот «${label}» завеликий (макс. 4 МБ).`);
  const head = data.subarray(0, 12);
  const isJpg = head[0] === 0xff && head[1] === 0xd8;
  const isPng = head[0] === 0x89 && head.subarray(1, 4).toString() === 'PNG';
  const isWebp = head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP';
  if (!(isJpg || isPng || isWebp)) throw new Error(`Файл «${label}» не є зображенням.`);
  const ext = m[1] === 'image/jpeg' ? 'jpg' : m[1] === 'image/png' ? 'png' : 'webp';
  return { name: `${idx + 1}-${['before', 'tablet', 'after'][idx]}.${ext}`, type: m[1], data };
}

// ---------- Маршрути ----------
export function registerPortalRoutes(app: express.Express, d: PortalDeps) {
  const guard = (check: (u: User | null) => boolean, denied: string): express.RequestHandler => (req, res, next) => {
    const user = d.getCurrentUser(req);
    if (check(user)) return next();
    return res.status(user ? 403 : 401).json({ error: user ? denied : 'Потрібна авторизація.' });
  };
  const requireMember = guard(isMember, 'Доступ лише для особового складу.');
  const requireHr = guard((u) => hasPerm(u, 'hr'), 'Доступ лише для відділу кадрів.');
  const requireMts = guard((u) => hasPerm(u, 'mts'), 'Доступ лише для МТС.');
  const requireStaffRole = guard((u) => u?.role === 'leader' || u?.role === 'instructor', 'Доступ лише для інструкторів та керівника.');
  const requireLeaderOnly = guard((u) => u?.role === 'leader', 'Доступ лише для керівника.');

  const fail = (res: express.Response, e: unknown) => {
    const status = e instanceof StoreError ? 503 : 500;
    if (!(e instanceof StoreError)) console.error('[Portal]', e);
    res.status(status).json({ error: (e as Error).message || 'Помилка сервера' });
  };

  // Профіль поточного користувача (створюється з нікнейму, якщо ще немає)
  async function officerOf(user: User): Promise<Officer | null> {
    if (!user.discordId) return null;
    return ensureOfficer({ discordId: user.discordId, nick: user.name, fallbackName: user.name }, true);
  }
  // Хто заповнив: беремо з профілю, а не з тіла запиту
  async function filerOf(user: User): Promise<PersonSnapshot> {
    const o = await officerOf(user);
    if (o) {
      if (!o.name || !o.staticId) throw new Error("Спершу заповніть профіль: ім'я та статік (клік по вашому імені в меню).");
      return snap(o);
    }
    return { name: user.name, staticId: String(user.staticId || '').replace(/^#/, '') }; // резервний вхід куратора
  }

  // ----- Довідники -----
  app.get('/api/portal/config', requireMember, (req, res) => {
    const user = d.getCurrentUser(req)!;
    const p = d.getDb().portal;
    res.json({
      ranks: RANKS,
      reasons: p.reasons,
      purposes: p.purposes,
      catalog: hasPerm(user, 'mts') ? p.catalog : p.catalog.filter((i) => i.active),
    });
  });

  app.put('/api/portal/reasons', requireHr, (req, res) => {
    const list: unknown[] = Array.isArray(req.body?.reasons) ? req.body.reasons : [];
    const reasons = [...new Set(list.map((r) => clean(r, 120)).filter(Boolean))].slice(0, 40);
    const db = d.getDb();
    db.portal.reasons = reasons;
    d.saveDb();
    res.json({ success: true, reasons });
  });

  app.put('/api/portal/catalog', requireMts, (req, res) => {
    const user = d.getCurrentUser(req)!;
    const db = d.getDb();
    const rawItems: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length > 200) return res.status(400).json({ error: 'Забагато позицій (макс. 200).' });
    const known = new Set(db.portal.catalog.map((i) => i.id));
    const seen = new Set<string>();
    const items: CraftItem[] = [];
    for (const r of rawItems) {
      const name = clean(r?.name, 60);
      if (!name) continue;
      if (seen.has(name.toLowerCase())) return res.status(400).json({ error: `Позиція «${name}» зустрічається двічі.` });
      seen.add(name.toLowerCase());
      const cost = Number(r?.cost);
      if (!Number.isFinite(cost) || cost < 0 || cost > 100000) return res.status(400).json({ error: `Невірна вартість для «${name}».` });
      const id = typeof r?.id === 'string' && known.has(r.id) ? r.id : uid('itm');
      items.push({ id, name, cost: Math.round(cost), active: r?.active !== false });
    }
    const purposes = [...new Set((Array.isArray(req.body?.purposes) ? req.body.purposes : []).map((p: unknown) => clean(p, 120)).filter(Boolean))].slice(0, 20) as string[];
    db.portal.catalog = items;
    db.portal.purposes = purposes;
    db.portal.updatedAt = new Date().toISOString();
    db.portal.updatedBy = user.name;
    d.saveDb();
    res.json({ success: true, catalog: items, purposes });
  });

  // ----- Профіль -----
  app.get('/api/me/profile', requireMember, async (req, res) => {
    try {
      const user = d.getCurrentUser(req)!;
      const officer = await officerOf(user);
      res.json({ officer, discordLinked: Boolean(user.discordId) });
    } catch (e) { fail(res, e); }
  });

  app.put('/api/me/profile', requireMember, async (req, res) => {
    try {
      const user = d.getCurrentUser(req)!;
      if (!user.discordId) return res.status(400).json({ error: 'Профіль доступний лише після входу через Discord.' });
      const name = clean(req.body?.name, 60);
      const staticId = clean(req.body?.staticId, 8).replace(/^#/, '');
      const department = clean(req.body?.department, 40);
      if (name.length < 2) return res.status(400).json({ error: "Вкажіть ім'я та прізвище (або позивний)." });
      if (!STATIC_ID.test(staticId)) return res.status(400).json({ error: 'Статік — це число (до 8 цифр).' });
      const officer = await officerOf(user);
      if (!officer) return res.status(500).json({ error: 'Не вдалося завантажити профіль.' });
      const updated: Officer = { ...officer, name, staticId, department, confirmed: true, updatedAt: new Date().toISOString() };
      await store.put('officers', updated.discordId, updated);
      invalidateOfficers();
      // Ім'я в кабінеті теж оновлюємо
      const dbUser = d.getDb().users.find((u) => u.id === user.id);
      if (dbUser) { dbUser.name = name; dbUser.staticId = staticId; d.saveDb(); }
      res.json({ officer: updated, user: dbUser || user });
    } catch (e) { fail(res, e); }
  });

  // ----- Особовий склад -----
  app.get('/api/hr/officers', requireHr, async (_req, res) => {
    try {
      const list = [...(await listOfficers())].sort((a, b) => (b.rank || 0) - (a.rank || 0) || a.name.localeCompare(b.name, 'uk'));
      res.json(list);
    } catch (e) { fail(res, e); }
  });

  // Пряме редагування картки офіцера (кадровик, керівник, куратор): запис потрапляє в журнал як «Корекція»
  app.put('/api/hr/officers/:id', requireHr, async (req, res) => {
    const user = d.getCurrentUser(req)!;
    try {
      const existing = await store.get<Officer>('officers', req.params.id);
      if (!existing) return res.status(404).json({ error: 'Офіцера не знайдено.' });
      const b = req.body || {};
      const name = clean(b.name, 60);
      const staticId = clean(b.staticId, 8).replace(/^#/, '');
      if (name.length < 2) return res.status(400).json({ error: "Вкажіть ім'я та прізвище (або позивний)." });
      if (!STATIC_ID.test(staticId)) return res.status(400).json({ error: 'Статік — це число (до 8 цифр).' });
      let rank: number | null = null;
      if (b.rank !== null && b.rank !== undefined && b.rank !== '') {
        rank = Number(b.rank);
        if (!Number.isInteger(rank) || rank < 1 || rank > RANKS.length) return res.status(400).json({ error: 'Невірний ранг.' });
      }
      const now = new Date().toISOString();
      const updated: Officer = { ...existing, name, staticId, department: clean(b.department, 40), rank, updatedAt: now };
      const filer = await filerOf(user);
      const audit: HrAudit = {
        id: uid('aud'), type: 'correction', officer: snap(updated), rankFrom: existing.rank, rankTo: rank,
        basis: clean(b.note, 300) || 'Корекція даних картки', filer, createdAt: now, discordPosted: false, local: true,
      };
      await store.put('hr_audits', audit.id, audit);
      await store.put('officers', updated.discordId, updated);
      invalidateOfficers();
      res.json({ officer: updated });
    } catch (e) {
      if (e instanceof StoreError) return fail(res, e);
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ----- Пошук кадета для видачі посилання -----
  // Джерела: попередні посилання та результати іспитів + база офіцерів (рекрути, кадети, без рангу)
  app.get('/api/cadets/search', requireStaffRole, async (req, res) => {
    const normStatic = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/^#/, '');
    const q = normStatic(clean(req.query.q, 60));
    if (q.length < 2) return res.json([]);
    const db = d.getDb();
    const map = new Map<string, CadetCandidate>();
    const touch = (nickname: string, staticId: string, discordId: string, at?: string, status?: CadetCandidate['lastStatus'], countAttempt = false) => {
      const key = normStatic(staticId) || nickname.toLowerCase();
      if (!key) return;
      let c = map.get(key);
      if (!c) { c = { nickname, staticId, discordId: discordId || '', attempts: 0, inOfficerDb: false }; map.set(key, c); }
      if (countAttempt) c.attempts++;
      if (!c.discordId && discordId) c.discordId = discordId;
      if (at && (!c.lastAt || at > c.lastAt)) {
        c.lastAt = at;
        c.nickname = nickname || c.nickname;
        c.staticId = staticId || c.staticId;
        if (status) c.lastStatus = status;
      }
    };
    for (const t of db.tokens) touch(t.cadetNickname || '', t.cadetStatic || '', t.cadetDiscord || '', t.createdAt);
    for (const r of db.results) touch(r.cadetNickname || '', r.cadetStatic || '', r.cadetDiscord || '', r.submittedAt, r.status, true);
    try {
      for (const o of await listOfficers()) {
        if (o.rank !== null && o.rank > 3) continue;
        const key = normStatic(o.staticId) || o.name.toLowerCase();
        const existing = map.get(key);
        if (existing) { existing.inOfficerDb = true; existing.rank = o.rank; if (!existing.discordId) existing.discordId = o.discordId; }
        else map.set(key, { nickname: o.name, staticId: o.staticId ? `#${o.staticId}` : '', discordId: o.discordId, attempts: 0, rank: o.rank, inOfficerDb: true });
      }
    } catch { /* пошук працює й без бази офіцерів */ }

    const found = [...map.values()]
      .filter((c) => `${c.nickname} ${normStatic(c.staticId)} ${c.discordId}`.toLowerCase().includes(q))
      .sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''))
      .slice(0, 8);
    res.json(found);
  });

  // ----- Кадровий аудит -----
  app.get('/api/hr/audits', requireHr, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 300));
      res.json(await store.list<HrAudit>('hr_audits', limit));
    } catch (e) { fail(res, e); }
  });

  app.post('/api/hr/audits', requireHr, async (req, res) => {
    const user = d.getCurrentUser(req)!;
    if (!d.rateLimit(`hr:${user.id}`, 30, 60_000)) return res.status(429).json({ error: 'Забагато запитів. Зачекайте хвилину.' });
    try {
      const b = req.body || {};
      const type = b.type as HrAuditType;
      if (!['hire', 'promote', 'demote', 'dismiss', 'correction'].includes(type)) return res.status(400).json({ error: 'Невірний тип кадрового аудиту.' });
      const basis = clean(b.basis, 500);
      if (basis.length < 2) return res.status(400).json({ error: 'Вкажіть, згідно чого прийнято кадрове рішення.' });
      const discordId = clean(b.discordId, 20);
      if (!DISCORD_ID.test(discordId)) return res.status(400).json({ error: 'Невірний Discord ID (17–20 цифр).' });

      let rankTo: number | null = null;
      if (type === 'correction') {
        if (b.rankTo !== undefined && b.rankTo !== null && b.rankTo !== '') {
          rankTo = Number(b.rankTo);
          if (!Number.isInteger(rankTo) || rankTo < 1 || rankTo > RANKS.length) return res.status(400).json({ error: 'Невірний ранг.' });
        }
      } else if (type !== 'dismiss') {
        rankTo = Number(b.rankTo);
        if (!Number.isInteger(rankTo) || rankTo < 1 || rankTo > RANKS.length) return res.status(400).json({ error: 'Оберіть ранг.' });
      }

      const filer = await filerOf(user);
      if (filer.discordId && filer.discordId === discordId && user.role !== 'leader') {
        return res.status(403).json({ error: 'Не можна оформлювати кадрове рішення щодо себе.' });
      }
      const existing = await store.get<Officer>('officers', discordId);
      const now = new Date().toISOString();
      let officer: Officer;
      let rankFrom: number | null = null;
      let movedFrom = '';
      let changes: { field: string; from: string; to: string }[] | undefined;

      if (type === 'hire') {
        if (existing && existing.rank !== null) {
          return res.status(409).json({ error: `${existing.name} уже є в базі з рангом ${rankLabel(existing.rank)}. Для зміни рангу використайте підвищення чи пониження.` });
        }
        const name = clean(b.name, 60);
        const staticId = clean(b.staticId, 8).replace(/^#/, '');
        if (name.length < 2) return res.status(400).json({ error: "Вкажіть ім'я та прізвище (або позивний) офіцера." });
        if (!STATIC_ID.test(staticId)) return res.status(400).json({ error: 'Статік — це число (до 8 цифр).' });
        officer = {
          discordId, name, staticId, department: clean(b.department, 40),
          rank: rankTo, confirmed: existing?.confirmed || false, createdAt: existing?.createdAt || now, updatedAt: now,
        };
      } else if (type === 'correction') {
        if (!existing) return res.status(404).json({ error: 'Офіцера немає в базі.' });
        const name = clean(b.name, 60);
        const staticId = clean(b.staticId, 8).replace(/^#/, '');
        if (name.length < 2) return res.status(400).json({ error: "Вкажіть ім'я та прізвище (або позивний)." });
        if (!STATIC_ID.test(staticId)) return res.status(400).json({ error: 'Статік — це число (до 8 цифр).' });
        rankFrom = existing.rank;
        if (rankTo === null) rankTo = existing.rank;
        const newId = clean(b.newDiscordId, 20) || discordId;
        if (!DISCORD_ID.test(newId)) return res.status(400).json({ error: 'Невірний Discord ID (17–20 цифр).' });
        if (newId !== discordId) {
          const clash = await store.get<Officer>('officers', newId);
          if (clash) return res.status(409).json({ error: `Discord ID ${newId} уже належить офіцеру ${clash.name}.` });
          movedFrom = discordId;
        }
        officer = { ...existing, discordId: newId, name, staticId, department: clean(b.department, 40), rank: rankTo, updatedAt: now };
        const diff = (field: string, from: string, to: string) => (from !== to ? [{ field, from, to }] : []);
        changes = [
          ...diff('Discord ID', discordId, newId),
          ...diff("Ім'я", existing.name, officer.name),
          ...diff('Статік', existing.staticId, officer.staticId),
          ...diff('Відділ', existing.department, officer.department),
          ...diff('Ранг', existing.rank === null ? '' : rankLabel(existing.rank), officer.rank === null ? '' : rankLabel(officer.rank)),
        ];
        if (!changes.length) return res.status(400).json({ error: 'Нічого не змінено.' });
      } else {
        if (!existing) return res.status(404).json({ error: 'Офіцера немає в базі. Для нового співробітника використайте «Прийняття».' });
        rankFrom = existing.rank;
        if (type === 'promote' && rankFrom !== null && rankTo! <= rankFrom) return res.status(400).json({ error: 'Підвищення: новий ранг має бути вищим за поточний.' });
        if (type === 'demote' && rankFrom !== null && rankTo! >= rankFrom) return res.status(400).json({ error: 'Пониження: новий ранг має бути нижчим за поточний.' });
        officer = { ...existing, rank: type === 'dismiss' ? existing.rank : rankTo, updatedAt: now };
      }

      const audit: HrAudit = {
        id: uid('aud'), type, officer: snap(officer), rankFrom, rankTo: type === 'dismiss' ? null : rankTo,
        basis, filer, createdAt: now, discordPosted: false, ...(changes ? { changes } : {}),
      };
      // Спершу журнал (щоб рішення не загубилось), потім зміна бази офіцерів
      await store.put('hr_audits', audit.id, audit);
      try {
        if (type === 'dismiss') await store.remove('officers', discordId);
        else {
          await store.put('officers', officer.discordId, officer);
          if (movedFrom) await store.remove('officers', movedFrom);
        }
        invalidateOfficers();
      } catch (e) {
        await store.remove('hr_audits', audit.id).catch(() => {});
        throw e;
      }

      const posted = await postHrAudit(d.getDb(), audit);
      if (posted.ok) {
        audit.discordPosted = true;
      } else {
        audit.discordError = posted.error;
      }
      await store.put('hr_audits', audit.id, audit);
      res.json({ success: true, audit, discordSent: posted.ok, discordError: posted.error });
    } catch (e) {
      if (e instanceof StoreError) return fail(res, e);
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/hr/audits/:id/repost', requireHr, async (req, res) => {
    try {
      const audit = await store.get<HrAudit>('hr_audits', req.params.id);
      if (!audit) return res.status(404).json({ error: 'Запис не знайдено.' });
      if (audit.local) return res.status(400).json({ error: 'Корекція даних зберігається лише в журналі й у Discord не надсилається.' });
      const posted = await postHrAudit(d.getDb(), audit);
      audit.discordPosted = posted.ok;
      audit.discordError = posted.ok ? undefined : posted.error;
      await store.put('hr_audits', audit.id, audit);
      res.json({ success: posted.ok, audit, discordError: posted.error });
    } catch (e) { fail(res, e); }
  });

  // ----- Звіт крафту -----
  app.get('/api/crafts', requireMts, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 300));
      res.json(await store.list<CraftReport>('craft_reports', limit));
    } catch (e) { fail(res, e); }
  });

  app.post('/api/crafts', requireMember, async (req, res) => {
    const user = d.getCurrentUser(req)!;
    // Куратору (резервний вхід) дозволено все, навіть без Discord ID
    if (!user.discordId && user.role !== 'leader') return res.status(400).json({ error: 'Звіт крафту подається після входу через Discord (потрібен ваш Discord ID).' });
    if (!d.rateLimit(`craft:${user.id}`, 10, 60_000)) return res.status(429).json({ error: 'Забагато звітів за хвилину. Зачекайте.' });
    try {
      const db = d.getDb();
      const b = req.body || {};
      const rawLines: any[] = Array.isArray(b.lines) ? b.lines : [];
      if (!rawLines.length || rawLines.length > 30) return res.status(400).json({ error: 'Додайте від 1 до 30 позицій.' });

      // Вартість рахуємо на сервері з актуального каталогу, а не довіряємо клієнту
      const lines: CraftLine[] = [];
      const used = new Set<string>();
      for (const l of rawLines) {
        const item = db.portal.catalog.find((i) => i.id === l?.itemId);
        if (!item || !item.active) return res.status(400).json({ error: 'Одна з позицій більше недоступна. Оновіть сторінку.' });
        if (used.has(item.id)) return res.status(400).json({ error: `Позиція «${item.name}» додана двічі.` });
        used.add(item.id);
        const qty = Number(l?.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 9999) return res.status(400).json({ error: `Невірна кількість для «${item.name}».` });
        lines.push({ itemId: item.id, name: item.name, qty, unitCost: item.cost });
      }
      const purpose = clean(b.purpose, 200);
      if (purpose.length < 2) return res.status(400).json({ error: 'Вкажіть мету крафту.' });

      const labels = ['до крафту', 'планшет з історією', 'після крафту'];
      const keys = ['before', 'tablet', 'after'];
      let files: WebhookFile[];
      try {
        files = keys.map((k, i) => decodeShot(b.shots?.[k], labels[i], i));
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }

      const filer = await filerOf(user);
      const totalCost = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
      const now = new Date().toISOString();
      const who = `${filer.name} ${filer.staticId}`.trim();
      const content = [
        `**Хто крафтить:** ${user.discordId ? `<@${user.discordId}> | ` : ''}${filer.name} | ${filer.staticId}`,
        `**Що крафтить:** ${lines.map((l) => `${l.name} - ${l.qty}`).join(', ')}`,
        `**Скільки потрібно матеріалів:** ${totalCost}`,
        `**Мета, для чого:** ${purpose}`,
        `📸 Скріншоти: 1) ${labels[0]} · 2) ${labels[1]} · 3) ${labels[2]}`,
      ].join('\n');

      const payload: any = { content: content.slice(0, 1900), allowed_mentions: { parse: [] } };
      if (db.settings.discordCraftUseThread) payload.thread_name = `${who} — ${kyivStamp(now)}`.slice(0, 100);
      const posted = await postWebhook((db.settings.discordCraftWebhookUrl || '').trim(), payload, files);
      if (!posted.ok) return res.status(502).json({ error: `Звіт не надіслано в Discord. ${posted.error}` });

      const report: CraftReport = { id: uid('crf'), createdAt: now, officer: { ...filer, discordId: user.discordId || undefined }, lines, totalCost, purpose };
      store.put('craft_reports', report.id, report).catch((e) => console.error('[Portal] craft save:', e.message));
      res.json({ success: true, totalCost });
    } catch (e) {
      if (e instanceof StoreError) return fail(res, e);
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ----- Налаштування порталу (керівник) -----
  app.post('/api/settings/portal', requireLeaderOnly, (req, res) => {
    const db = d.getDb();
    const b = req.body || {};
    for (const key of ['discordOfficerRoleId', 'discordHrRoleId', 'discordMtsRoleId'] as const) {
      if (typeof b[key] !== 'string') continue;
      const v = b[key].trim();
      if (v && !DISCORD_ID.test(v)) return res.status(400).json({ error: 'Role ID має складатися з 17–20 цифр.' });
      db.settings[key] = v;
    }
    for (const key of ['discordHrWebhookUrl', 'discordCraftWebhookUrl'] as const) {
      if (typeof b[key] !== 'string') continue;
      const v = b[key].trim();
      if (v && !d.isValidWebhookUrl(v)) return res.status(400).json({ error: 'Невірний Discord Webhook URL. Очікується https://discord.com/api/webhooks/...' });
      db.settings[key] = v;
    }
    if (typeof b.discordCraftUseThread === 'boolean') db.settings.discordCraftUseThread = b.discordCraftUseThread;
    d.saveDb();
    res.json({ success: true });
  });
}
