import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { getDb, saveDb } from './server/db.js';
import { sendDiscordExamSubmission, sendDiscordInstructorDecision } from './server/discord.js';
import { ExamToken, ExamResult, AnswerSubmission, AntiCheatEvent, User, UserRole } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: '10mb' }));

// Active user tracking
let currentUserId = 'usr_leader_1'; // Default active user (Leader)

function getCurrentUser(): User {
  const db = getDb();
  return db.users.find((u) => u.id === currentUserId) || db.users[0];
}

// Middleware: restrict actions to Faction Leader only
function requireLeader(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getCurrentUser();
  if (user.role !== 'leader') {
    return res.status(403).json({
      error: 'Доступ обмежено: Тільки Лідер фракції має право керувати вебхуком, змінювати ролі та конфігурацію системи.',
    });
  }
  next();
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ==================== AUTH & DISCORD ROLE AUTHORIZATION ====================

app.get('/api/session', (req, res) => {
  const db = getDb();
  const user = getCurrentUser();
  res.json({
    user,
    settings: db.settings,
    allUsers: db.users,
  });
});

app.post('/api/session/switch', (req, res) => {
  const { userId } = req.body;
  const db = getDb();
  const target = db.users.find((u) => u.id === userId);
  if (target) {
    currentUserId = target.id;
    return res.json({ success: true, user: target });
  }
  res.status(404).json({ error: 'Користувача не знайдено' });
});

// 1. Get Discord OAuth Authorization URL
app.get('/api/auth/discord/url', (req, res) => {
  const db = getDb();
  const clientId = db.settings.discordClientId || process.env.DISCORD_CLIENT_ID;
  const redirectUri = `${APP_URL}/auth/callback`;

  if (!clientId) {
    return res.status(400).json({
      error: 'Discord Client ID не налаштовано. Лідер може вказати його у вкладці «Ролі та Доступ» або через змінну DISCORD_CLIENT_ID.',
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds guilds.members.read',
  });

  const authUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;
  res.json({ url: authUrl, redirectUri });
});

// 2. Discord OAuth Callback (handles both /auth/callback and /auth/callback/)
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code, error } = req.query;
  const db = getDb();
  const clientId = db.settings.discordClientId || process.env.DISCORD_CLIENT_ID;
  const clientSecret = db.settings.discordClientSecret || process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = `${APP_URL}/auth/callback`;

  if (error || !code) {
    return res.send(`
      <html>
        <body style="background:#0b1120;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;">
          <h3>Помилка авторизації в Discord</h3>
          <p>${error || 'Код авторизації не отримано'}</p>
          <button onclick="window.close()" style="padding:8px 16px;background:#1e293b;color:#fff;border:none;border-radius:6px;cursor:pointer;">Закрити</button>
        </body>
      </html>
    `);
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return res.send(`
        <html>
          <body style="background:#0b1120;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;">
            <h3>Помилка отримання токена Discord</h3>
            <p style="font-size:12px;opacity:0.8;">${errText}</p>
            <button onclick="window.close()" style="padding:8px 16px;background:#1e293b;color:#fff;border:none;border-radius:6px;cursor:pointer;">Закрити</button>
          </body>
        </html>
      `);
    }

    const tokenData = await tokenRes.json();
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();

    // Check roles if Discord Guild is configured
    let assignedRole: UserRole = 'instructor';
    let guildRoles: string[] = [];

    if (db.settings.discordGuildId) {
      const memberRes = await fetch(
        `https://discord.com/api/users/@me/guilds/${db.settings.discordGuildId}/member`,
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        }
      );

      if (memberRes.ok) {
        const memberData = await memberRes.json();
        guildRoles = memberData.roles || [];
        if (db.settings.discordLeaderRoleId && guildRoles.includes(db.settings.discordLeaderRoleId)) {
          assignedRole = 'leader';
        } else if (
          db.settings.discordInstructorRoleId &&
          guildRoles.includes(db.settings.discordInstructorRoleId)
        ) {
          assignedRole = 'instructor';
        }
      }
    }

    // Fallback: check if this discordId matches an existing user or fallback to leader/instructor
    const existingUser = db.users.find(
      (u) => u.discordId && (u.discordId === discordUser.id || u.discordId === discordUser.username)
    );

    if (existingUser && !db.settings.discordGuildId) {
      assignedRole = existingUser.role;
    }

    const displayName = discordUser.global_name || discordUser.username;
    let authedUser: User;

    if (existingUser) {
      existingUser.name = displayName;
      existingUser.role = assignedRole;
      existingUser.discordId = discordUser.id;
      existingUser.discordUsername = discordUser.username;
      existingUser.discordAvatar = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : undefined;
      existingUser.authMethod = 'discord_oauth';
      authedUser = existingUser;
    } else {
      authedUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: displayName,
        role: assignedRole,
        staticId: `#${Math.floor(1000 + Math.random() * 9000)}`,
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
          : undefined,
        authMethod: 'discord_oauth',
      };
      db.users.push(authedUser);
    }

    currentUserId = authedUser.id;
    saveDb();

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Авторизація Discord</title>
          <style>
            body { background: #090d16; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background: #0f172a; border: 1px solid #1e293b; padding: 32px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); max-width: 360px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #fbbf24; color: #020617; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2 style="margin:0 0 12px 0; color:#10b981;">✅ Авторизація успішна</h2>
            <p style="margin:0 0 8px 0; font-size: 14px; color: #cbd5e1;">Вітаємо, <strong>${authedUser.name}</strong>!</p>
            <div class="badge">${authedUser.role === 'leader' ? 'Лідер фракції' : 'Інструктор Академії'}</div>
            <p style="margin: 16px 0 0 0; font-size: 12px; color: #64748b;">Це вікно закриється автоматично...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${JSON.stringify(authedUser)} }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`Помилка сервера: ${err.message}`);
  }
});

// 3. Direct Discord verification by ID / Fast Role Simulator
app.post('/api/auth/discord/direct-login', (req, res) => {
  const { discordId, discordUsername, role, name, staticId } = req.body;
  const db = getDb();

  if (!discordId) {
    return res.status(400).json({ error: 'Вкажіть Discord ID' });
  }

  // Find or create user
  let user = db.users.find(
    (u) => u.discordId === discordId.trim() || (discordUsername && u.discordUsername === discordUsername.trim())
  );

  const finalRole: 'leader' | 'instructor' = role === 'leader' ? 'leader' : 'instructor';

  if (!user) {
    user = {
      id: `usr_dc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name?.trim() || discordUsername?.trim() || `Discord_${discordId.slice(-4)}`,
      role: finalRole,
      staticId: staticId?.trim() || `#${Math.floor(1000 + Math.random() * 9000)}`,
      discordId: discordId.trim(),
      discordUsername: discordUsername?.trim() || discordId.trim(),
      authMethod: 'discord_id',
    };
    db.users.push(user);
  } else {
    if (role) user.role = finalRole;
    if (name) user.name = name.trim();
    if (staticId) user.staticId = staticId.trim();
    user.authMethod = 'discord_id';
  }

  currentUserId = user.id;
  saveDb();

  res.json({ success: true, user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const db = getDb();
  // Reset to default instructor
  currentUserId = db.users[0]?.id || 'usr_inst_1';
  res.json({ success: true, user: getCurrentUser() });
});

// ==================== SETTINGS & DISCORD (LEADER PROTECTED) ====================

app.get('/api/settings', (req, res) => {
  const db = getDb();
  res.json(db.settings);
});

// ONLY Leader can update Webhook & general settings
app.post('/api/settings', requireLeader, (req, res) => {
  const db = getDb();
  db.settings = { ...db.settings, ...req.body };
  saveDb();
  res.json({ success: true, settings: db.settings });
});

// ONLY Leader can test the Webhook
app.post('/api/discord/test', requireLeader, async (req, res) => {
  const db = getDb();
  const webhookUrl = req.body.webhookUrl || db.settings.discordWebhookUrl;
  if (!webhookUrl) {
    return res.status(400).json({ error: 'Вкажіть URL Discord Webhook' });
  }

  try {
    const targetUrl = webhookUrl.includes('?') ? `${webhookUrl}&wait=true` : `${webhookUrl}?wait=true`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `${db.settings.academyName} | Тест`,
        avatar_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=128&q=80',
        content: 'Тестове повідомлення від Системи Онлайн-Тестування Академії Кадетів.',
        thread_name: 'Тестова перевірка інтеграції Discord',
        embeds: [
          {
            title: 'Тестова перевірка Discord Webhook',
            description: 'Інтеграція з сервером Академії Кадетів налаштована коректно та готова приймати результати іспитів!',
            color: 0x10b981,
            fields: [
              { name: 'Академія', value: db.settings.academyName, inline: true },
              { name: 'Фракція', value: db.settings.factionTag, inline: true },
              { name: 'Час тесту', value: new Date().toLocaleString('uk-UA'), inline: true },
            ],
            footer: { text: 'Система тестування кадетів • Discord Webhooks' },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Discord повернув помилку: ${errText}` });
    }

    res.json({ success: true, message: 'Тестове сповіщення успішно надіслано в Discord!' });
  } catch (err: any) {
    res.status(500).json({ error: `Мережева помилка при надсиланні: ${err.message}` });
  }
});

// ==================== ROLE CONFIGURATION & CONFIRMATION SAFEGUARD ====================

// ONLY Leader can rename roles, change Discord Role IDs with confirmation code/PIN
app.post('/api/settings/roles', requireLeader, (req, res) => {
  const db = getDb();
  const {
    roleTitles,
    discordGuildId,
    discordLeaderRoleId,
    discordInstructorRoleId,
    discordClientId,
    discordClientSecret,
    confirmationCode,
    reason,
  } = req.body;

  const validPin = db.settings.leaderSecurityPin || '7777';
  const isConfirmed =
    confirmationCode === 'ПІДТВЕРДЖУЮ' ||
    confirmationCode === 'ПІДТВЕРДИТИ' ||
    confirmationCode === validPin;

  if (!isConfirmed) {
    return res.status(400).json({
      error: `Невірний код підтвердження! Введіть слово "ПІДТВЕРДЖУЮ" або захисний PIN-код лідера (${validPin}).`,
    });
  }

  const activeUser = getCurrentUser();
  const oldTitles = { ...db.settings.roleTitles };
  const oldLeaderRoleId = db.settings.discordLeaderRoleId || '';
  const oldInstructorRoleId = db.settings.discordInstructorRoleId || '';

  if (roleTitles) {
    db.settings.roleTitles = {
      leader: roleTitles.leader?.trim() || oldTitles.leader || 'Шеф Департаменту / Лідер',
      instructor: roleTitles.instructor?.trim() || oldTitles.instructor || 'Інструктор Академії',
      cadet: roleTitles.cadet?.trim() || oldTitles.cadet || 'Кадет Академії',
    };
  }

  if (discordGuildId !== undefined) db.settings.discordGuildId = discordGuildId.trim();
  if (discordLeaderRoleId !== undefined) db.settings.discordLeaderRoleId = discordLeaderRoleId.trim();
  if (discordInstructorRoleId !== undefined) db.settings.discordInstructorRoleId = discordInstructorRoleId.trim();
  if (discordClientId !== undefined) db.settings.discordClientId = discordClientId.trim();
  if (discordClientSecret !== undefined) db.settings.discordClientSecret = discordClientSecret.trim();

  // Create audit log entry for this role modification
  const auditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    actorName: activeUser.name,
    actorDiscordId: activeUser.discordId,
    targetRole: 'instructor' as const,
    oldTitle: `${oldTitles.leader} / ${oldTitles.instructor}`,
    newTitle: `${db.settings.roleTitles.leader} / ${db.settings.roleTitles.instructor}`,
    oldDiscordRoleId: `L:${oldLeaderRoleId || '—'} / I:${oldInstructorRoleId || '—'}`,
    newDiscordRoleId: `L:${db.settings.discordLeaderRoleId || '—'} / I:${db.settings.discordInstructorRoleId || '—'}`,
    reason: reason?.trim() || 'Зміна назв ролей та прив’язки Discord Role ID',
  };

  if (!db.settings.roleAuditLogs) {
    db.settings.roleAuditLogs = [];
  }
  db.settings.roleAuditLogs.unshift(auditEntry);

  saveDb();

  res.json({
    success: true,
    settings: db.settings,
    auditEntry,
    message: 'Структуру ролей та прив’язку Discord успішно оновлено та зафіксовано в журналі аудиту!',
  });
});

app.get('/api/discord/logs', (req, res) => {
  const db = getDb();
  res.json(db.discordLogs);
});

// ==================== INSTRUCTOR MANAGEMENT ====================

app.get('/api/instructors', (req, res) => {
  const db = getDb();
  res.json(db.users);
});

app.post('/api/instructors', (req, res) => {
  const db = getDb();
  const { name, role, staticId, discordId } = req.body;
  if (!name || !role) {
    return res.status(400).json({ error: 'ПІБ та роль обов’язкові' });
  }

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

app.delete('/api/instructors/:id', (req, res) => {
  const db = getDb();
  if (db.users.length <= 1) {
    return res.status(400).json({ error: 'Неможливо видалити останнього інструктора' });
  }
  db.users = db.users.filter((u) => u.id !== req.params.id);
  saveDb();
  res.json({ success: true });
});

// ==================== TESTS CRUD ====================

app.get('/api/tests', (req, res) => {
  const db = getDb();
  res.json(db.tests);
});

app.post('/api/tests', (req, res) => {
  const db = getDb();
  const testData = req.body;
  if (!testData.title) {
    return res.status(400).json({ error: 'Назва тесту обов’язкова' });
  }

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

app.put('/api/tests/:id', (req, res) => {
  const db = getDb();
  const idx = db.tests.findIndex((t) => t.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Тест не знайдено' });
  }

  db.tests[idx] = {
    ...db.tests[idx],
    ...req.body,
    id: db.tests[idx].id,
  };
  saveDb();
  res.json(db.tests[idx]);
});

app.delete('/api/tests/:id', (req, res) => {
  const db = getDb();
  db.tests = db.tests.filter((t) => t.id !== req.params.id);
  saveDb();
  res.json({ success: true });
});

// ==================== EXAM TOKENS & GENERATION ====================

app.get('/api/tokens', (req, res) => {
  const db = getDb();
  res.json(db.tokens);
});

app.post('/api/links/generate', (req, res) => {
  const { cadetNickname, cadetStatic, cadetDiscord, testId } = req.body;
  if (!cadetNickname || !cadetStatic || !testId) {
    return res.status(400).json({ error: 'Вкажіть нікнейм, статік та оберіть тест' });
  }

  const db = getDb();
  const test = db.tests.find((t) => t.id === testId);
  if (!test) {
    return res.status(404).json({ error: 'Тест не знайдено' });
  }

  const activeInstructor = db.users.find((u) => u.id === currentUserId) || db.users[0];

  // ================= AUTOMATION: CHECK ATTEMPT LIMIT & COOLDOWN =================
  const normStatic = cadetStatic.trim().toLowerCase();
  const normNick = cadetNickname.trim().toLowerCase();
  const normDiscord = (cadetDiscord || '').trim().toLowerCase();

  // Find all previous completed results for this cadet and this test
  const previousResults = db.results.filter(
    (r) =>
      r.testId === testId &&
      (r.cadetStatic.trim().toLowerCase() === normStatic ||
        r.cadetNickname.trim().toLowerCase() === normNick ||
        (normDiscord && r.cadetDiscord.trim().toLowerCase() === normDiscord))
  );

  // Check if any recent attempt was failed and had cooldown
  if (previousResults.length > 0) {
    // Sort by most recent
    previousResults.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );

    const lastResult = previousResults[0];

    // If already passed
    if (lastResult.status === 'passed') {
      return res.status(400).json({
        error: `Кадет ${cadetNickname} вже успішно склав цей тест з результатом ${lastResult.percentage}%!`,
        previousResultId: lastResult.id,
      });
    }

    // Check attempt limit (unless instructor granted retake on the last result)
    const attemptsCount = previousResults.length;
    const instructorGrantedRetake = lastResult.status === 'retake_allowed';

    if (attemptsCount >= test.maxAttempts && !instructorGrantedRetake) {
      return res.status(400).json({
        error: `Вичерпано ліміт спроб (${attemptsCount}/${test.maxAttempts}). Дозвіл на нову спробу повинен надати інструктор або лідер у картці результату.`,
        attemptsCount,
        maxAttempts: test.maxAttempts,
      });
    }

    // Check cooldown pause between attempts
    if (!instructorGrantedRetake) {
      const lastTime = new Date(lastResult.submittedAt).getTime();
      const elapsedHours = (Date.now() - lastTime) / (1000 * 60 * 60);
      if (elapsedHours < test.cooldownHours) {
        const remainingHours = Math.ceil(test.cooldownHours - elapsedHours);
        return res.status(400).json({
          error: `Діє обов'язкова пауза між перездачами. До наступної спроби залишилося ${remainingHours} год. (всього пауза: ${test.cooldownHours} год.).`,
          remainingHours,
        });
      }
    }
  }

  // Pick random questions from question bank
  const pool = [...test.questions];
  const countToPick = Math.min(pool.length, test.randomQuestionCount || 5);
  const shuffledPool = shuffleArray(pool);
  const selectedQuestions = shuffledPool.slice(0, countToPick);
  const selectedQuestionIds = selectedQuestions.map((q) => q.id);

  // Shuffle options for closed questions
  const optionsShuffle: Record<string, number[]> = {};
  selectedQuestions.forEach((q) => {
    if (q.options && q.options.length > 0) {
      const indices = q.options.map((_, i) => i);
      optionsShuffle[q.id] = shuffleArray(indices);
    }
  });

  const tokenString = `exam-${crypto.randomBytes(8).toString('hex')}`;
  const newToken: ExamToken = {
    id: `tok_${Date.now()}`,
    token: tokenString,
    testId: test.id,
    testTitle: test.title,
    cadetNickname: cadetNickname.trim(),
    cadetStatic: cadetStatic.trim(),
    cadetDiscord: (cadetDiscord || '').trim(),
    instructorId: activeInstructor.id,
    instructorName: activeInstructor.name,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours link validity
    status: 'pending',
    selectedQuestionIds,
    optionsShuffle,
  };

  db.tokens.unshift(newToken);
  saveDb();

  const examLink = `${APP_URL}/#exam-${newToken.token}`;

  const discordCopyTemplate = `**[Академія Кадетів] Персональний іспит**
👤 Кадет: **${cadetNickname}** (${cadetStatic})
📋 Іспит: **${test.title}**
⏱️ Час: **${test.timeLimitMinutes} хвилин**
🎯 Прохідний бал: **${test.passingScorePercent}%**
🔗 Одноразове посилання: ${examLink}

*Увага: Посилання дійсне лише для однієї спроби. Під час складання ведеться античит-моніторинг (вихід із вкладки та вставка тексту фіксуються).*`;

  res.json({
    token: newToken,
    examLink,
    discordCopyTemplate,
  });
});

// ==================== EXAM FLOW (CADET INTERACTION) ====================

app.get('/api/exam/:token', (req, res) => {
  const { token } = req.params;
  const db = getDb();
  const tokenRecord = db.tokens.find((t) => t.token === token);

  if (!tokenRecord) {
    return res.status(404).json({ error: 'Посилання на іспит недійсне або було видалено.' });
  }

  if (tokenRecord.status === 'submitted') {
    return res.status(400).json({ error: 'Цей іспит вже було складено. Повторне проходження за цим посиланням заборонено.' });
  }

  if (new Date(tokenRecord.expiresAt).getTime() < Date.now()) {
    tokenRecord.status = 'expired';
    saveDb();
    return res.status(400).json({ error: 'Термін дії цього одноразового посилання вичерпано.' });
  }

  const test = db.tests.find((t) => t.id === tokenRecord.testId);
  if (!test) {
    return res.status(404).json({ error: 'Тест не знайдено в системі.' });
  }

  // Mark in_progress if first open
  if (tokenRecord.status === 'pending') {
    tokenRecord.status = 'in_progress';
    tokenRecord.startedAt = new Date().toISOString();
    saveDb();
  }

  // Build sanitized questions WITHOUT correct answers or explanations!
  const questionsMap = new Map(test.questions.map((q) => [q.id, q]));
  const sanitizedQuestions = tokenRecord.selectedQuestionIds
    .map((qid) => {
      const q = questionsMap.get(qid);
      if (!q) return null;

      const shuffleOrder = tokenRecord.optionsShuffle[q.id];
      let preparedOptions = q.options ? [...q.options] : undefined;
      if (preparedOptions && shuffleOrder) {
        preparedOptions = shuffleOrder.map((originalIdx) => q.options![originalIdx]);
      }

      return {
        id: q.id,
        type: q.type,
        title: q.title,
        description: q.description,
        category: q.category,
        options: preparedOptions,
        maxPoints: q.maxPoints,
      };
    })
    .filter(Boolean);

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
  const { token } = req.params;
  const { answers, antiCheatEvents, timeSpentSeconds } = req.body;

  const db = getDb();
  const tokenRecord = db.tokens.find((t) => t.token === token);

  if (!tokenRecord) {
    return res.status(404).json({ error: 'Іспит не знайдено' });
  }

  if (tokenRecord.status === 'submitted') {
    return res.status(400).json({ error: 'Іспит вже здано раніше' });
  }

  const test = db.tests.find((t) => t.id === tokenRecord.testId);
  if (!test) {
    return res.status(404).json({ error: 'Тест не знайдено' });
  }

  const questionsMap = new Map(test.questions.map((q) => [q.id, q]));
  let autoScore = 0;
  let maxAutoScore = 0;
  let maxManualScore = 0;
  let hasOpen = false;

  const evaluatedAnswers: AnswerSubmission[] = [];

  for (const qid of tokenRecord.selectedQuestionIds) {
    const q = questionsMap.get(qid);
    if (!q) continue;

    const userAns = (answers || []).find((a: any) => a.questionId === qid) || {};
    const shuffleOrder = tokenRecord.optionsShuffle[q.id] || [];

    if (q.type === 'single') {
      maxAutoScore += q.maxPoints;
      let isCorrect = false;
      let score = 0;

      if (userAns.selectedOption !== undefined && userAns.selectedOption !== null) {
        // Map displayed index back to original index
        const originalSelected = shuffleOrder[userAns.selectedOption];
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
    } else if (q.type === 'multiple') {
      maxAutoScore += q.maxPoints;
      let isCorrect = false;
      let score = 0;

      const userSelections: number[] = userAns.selectedOptions || [];
      const mappedOriginals = userSelections.map((dispIdx) => shuffleOrder[dispIdx]).sort();
      const actualCorrect = [...(q.correctOptions || [])].sort();

      const isExactMatch =
        mappedOriginals.length === actualCorrect.length &&
        mappedOriginals.every((val, index) => val === actualCorrect[index]);

      if (isExactMatch) {
        isCorrect = true;
        score = q.maxPoints;
        autoScore += score;
      } else {
        // Partial credit if no incorrect items chosen
        const incorrectCount = mappedOriginals.filter((i) => !actualCorrect.includes(i)).length;
        if (incorrectCount === 0 && mappedOriginals.length > 0) {
          score = Math.floor((mappedOriginals.length / actualCorrect.length) * q.maxPoints);
          autoScore += score;
        }
      }

      evaluatedAnswers.push({
        questionId: q.id,
        type: 'multiple',
        selectedOptions: userAns.selectedOptions || [],
        autoScore: score,
        maxPoints: q.maxPoints,
        isCorrect,
      });
    } else if (q.type === 'open') {
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
  const initialTotalScore = autoScore;
  const percentage = maxTotalScore > 0 ? Math.round((initialTotalScore / maxTotalScore) * 100) : 0;
  const autoPassed = percentage >= test.passingScorePercent;

  let finalStatus: 'pending_review' | 'passed' | 'failed' = 'pending_review';
  if (!hasOpen) {
    finalStatus = autoPassed ? 'passed' : 'failed';
  }

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
    totalScore: initialTotalScore,
    maxTotalScore,
    percentage,
    autoPassed,
    hasOpenQuestions: hasOpen,
    status: finalStatus,
    answers: evaluatedAnswers,
    antiCheatEvents: antiCheatEvents || [],
    discordPosted: false,
  };

  // Update token
  tokenRecord.status = 'submitted';
  tokenRecord.completedAt = new Date().toISOString();

  db.results.unshift(newResult);
  saveDb();

  // Send to Discord Webhook
  const discordResult = await sendDiscordExamSubmission(newResult, APP_URL);
  if (discordResult.success) {
    newResult.discordPosted = true;
    saveDb();
  }

  res.json({
    success: true,
    resultId: newResult.id,
    percentage,
    autoScore,
    maxAutoScore,
    status: newResult.status,
    hasOpenQuestions: hasOpen,
    antiCheatCount: (antiCheatEvents || []).length,
  });
});

// ==================== RESULTS & INSTRUCTOR REVIEW ====================

app.get('/api/results', (req, res) => {
  const db = getDb();
  const { status, search, testId } = req.query;

  let list = [...db.results];

  if (status && status !== 'all') {
    list = list.filter((r) => r.status === status);
  }

  if (testId && testId !== 'all') {
    list = list.filter((r) => r.testId === testId);
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(
      (r) =>
        r.cadetNickname.toLowerCase().includes(q) ||
        r.cadetStatic.toLowerCase().includes(q) ||
        r.cadetDiscord.toLowerCase().includes(q) ||
        r.testTitle.toLowerCase().includes(q)
    );
  }

  res.json(list);
});

app.get('/api/results/:id', (req, res) => {
  const db = getDb();
  const result = db.results.find((r) => r.id === req.params.id);
  if (!result) {
    return res.status(404).json({ error: 'Результат не знайдено' });
  }

  const test = db.tests.find((t) => t.id === result.testId);
  const token = db.tokens.find((t) => t.token === result.token);

  // Augment answer list with original question titles, explanations, and original options for instructor breakdown
  const detailedAnswers = result.answers.map((ans) => {
    const question = test?.questions.find((q) => q.id === ans.questionId);
    return {
      ...ans,
      title: question?.title || 'Питання видалено',
      description: question?.description,
      category: question?.category,
      explanation: question?.explanation,
      options: question?.options,
      correctOption: question?.correctOption,
      correctOptions: question?.correctOptions,
    };
  });

  res.json({
    ...result,
    test,
    tokenRecord: token,
    answers: detailedAnswers,
  });
});

app.post('/api/results/:id/grade-open', (req, res) => {
  const db = getDb();
  const result = db.results.find((r) => r.id === req.params.id);
  if (!result) {
    return res.status(404).json({ error: 'Результат не знайдено' });
  }

  const { grades } = req.body; // Array of { questionId, manualScore, instructorComment }
  if (Array.isArray(grades)) {
    let newManualTotal = 0;
    grades.forEach((g) => {
      const targetAns = result.answers.find((a) => a.questionId === g.questionId);
      if (targetAns) {
        targetAns.manualScore = Math.min(Math.max(0, Number(g.manualScore) || 0), targetAns.maxPoints);
        if (g.instructorComment !== undefined) {
          targetAns.instructorComment = g.instructorComment;
        }
      }
    });

    result.answers.forEach((a) => {
      if (a.type === 'open') {
        newManualTotal += a.manualScore || 0;
      }
    });

    result.manualScore = newManualTotal;
    result.totalScore = result.autoScore + result.manualScore;
    result.percentage = result.maxTotalScore > 0 ? Math.round((result.totalScore / result.maxTotalScore) * 100) : 0;
    saveDb();
  }

  res.json({ success: true, result });
});

app.post('/api/results/:id/decision', async (req, res) => {
  const { decision, comment, threadId } = req.body;
  if (!['passed', 'failed', 'retake_allowed'].includes(decision)) {
    return res.status(400).json({ error: 'Некоректний статус вердикту' });
  }

  const db = getDb();
  const result = db.results.find((r) => r.id === req.params.id);
  if (!result) {
    return res.status(404).json({ error: 'Результат не знайдено' });
  }

  // If instructor provided or confirmed a threadId/URL
  if (threadId && typeof threadId === 'string' && threadId.trim()) {
    const cleanId = threadId.trim().split('/').filter(Boolean).pop()?.trim();
    if (cleanId) {
      result.discordThreadId = cleanId;
    }
  }

  const currentInstructor = db.users.find((u) => u.id === currentUserId) || db.users[0];

  result.status = decision;
  result.instructorDecision = {
    instructorId: currentInstructor.id,
    instructorName: currentInstructor.name,
    decision,
    comment: (comment || '').trim(),
    decidedAt: new Date().toISOString(),
  };

  saveDb();

  // Send Discord decision update
  const discordRes = await sendDiscordInstructorDecision(result, APP_URL);

  res.json({
    success: true,
    result,
    discordSent: discordRes.success,
    discordError: discordRes.error,
  });
});

// ==================== CADET HISTORY LOOKUP ====================

app.get('/api/cadets/history', (req, res) => {
  const { query } = req.query;
  const db = getDb();
  if (!query) return res.json([]);

  const q = String(query).toLowerCase().trim();
  const matched = db.results.filter(
    (r) =>
      r.cadetNickname.toLowerCase().includes(q) ||
      r.cadetStatic.toLowerCase().includes(q) ||
      r.cadetDiscord.toLowerCase().includes(q)
  );

  res.json(matched);
});

// ==================== VITE SPA & DEV MIDDLEWARE ====================

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Cadet Academy] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
