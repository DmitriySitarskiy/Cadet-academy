import express from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { getDb, saveDb, ensureDbLoaded } from './server/db.js';
import { sendDiscordExamSubmission, sendDiscordInstructorDecision } from './server/discord.js';
import { ExamToken, ExamResult, AnswerSubmission, AntiCheatEvent, User, UserRole } from './src/types.js';

dotenv.config();

const __dirname = process.cwd();

export const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = process.env.APP_URL || process.env.URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: '10mb' }));

app.use(async (req, res, next) => {
  try {
    await ensureDbLoaded();
  } catch (err) {
    console.warn('Помилка підвантаження бази:', err);
  }
  next();
});

let currentUserId = 'usr_sheriff_root';

function getCurrentUser(req?: express.Request): User {
  const db = getDb();
  const reqUserId = (req?.headers?.['x-user-id'] as string) || (req?.query?.userId as string);
  if (reqUserId) {
    const found = db.users.find((u) => u.id === reqUserId || u.discordId === reqUserId);
    if (found) return found;
  }
  return db.users.find((u) => u.id === currentUserId) || db.users[0];
}

// Редагування доступне ТІЛЬКИ Шерифу
function requireLeader(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'leader') {
    return res.status(403).json({
      error: 'Доступ обмежено: Тільки Шериф / Лідер має право керувати вебхуком, змінювати ролі та конфігурацію системи.',
    });
  }
  next();
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Тест зв'язку з Supabase
app.get('/api/test-db', async (req, res) => {
  const rawUrl = process.env.SUPABASE_URL?.trim() || '';
  const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY)?.trim();

  const diagnostics: any = {
    hasUrl: Boolean(url),
    urlFormatValid: url ? url.startsWith('https://') : false,
    urlPreview: url ? url.slice(0, 25) + '...' : 'ВІДСУТНІЙ',
    hasKey: Boolean(key),
    keyLength: key ? key.length : 0,
  };

  if (!url || !key) {
    return res.status(500).json({ success: false, message: 'SUPABASE_URL або SUPABASE_ANON_KEY відсутні', diagnostics });
  }

  try {
    const fetchRes = await fetch(`${url}/rest/v1/app_state?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    diagnostics.readStatus = fetchRes.status;
    diagnostics.readText = await fetchRes.text();
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
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        id: 'main',
        data: { testConnection: true, time: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }),
    });
    diagnostics.writeStatus = writeRes.status;
    diagnostics.writeText = await writeRes.text();
  } catch (err: any) {
    diagnostics.writeError = err.message || String(err);
  }

  const isSuccess = diagnostics.readStatus === 200 && (diagnostics.writeStatus === 200 || diagnostics.writeStatus === 201);
  res.json({ success: isSuccess, verdict: isSuccess ? '✅ База Supabase підключена і працює!' : '❌ Помилка зв’язку', diagnostics });
});

// ==================== AUTH & DISCORD ====================

app.get('/api/session', (req, res) => {
  const db = getDb();
  const user = getCurrentUser(req);
  res.json({
    user,
    settings: db.settings,
    allUsers: db.users,
  });
});

app.post('/api/session/switch', (req, res) => {
  const { userId } = req.body;
  const db = getDb();
  const target = db.users.find((u) => u.id === userId) || db.users[0];
  if (target) {
    currentUserId = target.id;
    return res.json({ success: true, user: target });
  }
  res.status(404).json({ error: 'Користувача не знайдено' });
});

// Резервний вхід Шерифа
app.post('/api/auth/backup-login', (req, res) => {
  const { login, password } = req.body;
  const db = getDb();

  const validLogin = (process.env.ADMIN_LOGIN || 'sheriff').toLowerCase();
  const validPass = process.env.ADMIN_PASSWORD || db.settings.leaderSecurityPin || '7777';

  if (!login || !password) {
    return res.status(400).json({ error: 'Введіть логін та пароль' });
  }

  const isLoginCorrect = login.trim().toLowerCase() === validLogin || login.trim().toLowerCase() === 'admin';
  const isPassCorrect = password.trim() === validPass;

  if (!isLoginCorrect || !isPassCorrect) {
    return res.status(401).json({ error: 'Невірний логін або захисний пароль Шерифа!' });
  }

  let sheriff = db.users.find((u) => u.role === 'leader' && u.id === 'usr_sheriff_root');
  if (!sheriff) {
    sheriff = {
      id: 'usr_sheriff_root',
      name: 'Шериф Департаменту',
      role: 'leader',
      staticId: '#0001',
      authMethod: 'manual',
    };
    db.users.unshift(sheriff);
  }

  currentUserId = sheriff.id;
  saveDb();

  res.json({ success: true, user: sheriff });
});

app.get('/api/auth/discord/url', (req, res) => {
  const db = getDb();
  const clientId = db.settings.discordClientId || process.env.DISCORD_CLIENT_ID;
  const redirectUri = `${APP_URL}/auth/callback`;

  if (!clientId) {
    return res.status(400).json({
      error: 'Discord Client ID не налаштовано. Шериф може вказати його у вкладці «Ролі та Доступ».',
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

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code, error } = req.query;
  const db = getDb();
  const clientId = db.settings.discordClientId || process.env.DISCORD_CLIENT_ID;
  const clientSecret = db.settings.discordClientSecret || process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = `${APP_URL}/auth/callback`;

  if (error || !code) {
    return res.send(`<html><body style="background:#0b1120;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;"><h3>Помилка авторизації</h3><p>${error || 'Код не отримано'}</p><button onclick="window.close()">Закрити</button></body></html>`);
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
      return res.send(`<html><body style="background:#0b1120;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;"><h3>Помилка токена Discord</h3><p>${errText}</p><button onclick="window.close()">Закрити</button></body></html>`);
    }

    const tokenData = await tokenRes.json();
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();

    let assignedRole: UserRole = 'instructor';
    let guildRoles: string[] = [];

    if (db.settings.discordGuildId) {
      const memberRes = await fetch(
        `https://discord.com/api/users/@me/guilds/${db.settings.discordGuildId}/member`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );

      if (memberRes.ok) {
        const memberData = await memberRes.json();
        guildRoles = memberData.roles || [];
        if (db.settings.discordLeaderRoleId && guildRoles.includes(db.settings.discordLeaderRoleId)) {
          assignedRole = 'leader';
        } else if (db.settings.discordInstructorRoleId && guildRoles.includes(db.settings.discordInstructorRoleId)) {
          assignedRole = 'instructor';
        }
      }
    }

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

    res.send(`<!DOCTYPE html><html><head><title>Авторизація</title><style>body{background:#090d16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}.card{background:#0f172a;border:1px solid #1e293b;padding:32px;border-radius:16px;}</style></head><body><div class="card"><h2 style="color:#10b981;">✅ Авторизація успішна</h2><p>Вітаємо, <strong>${authedUser.name}</strong>!</p><p style="color:#64748b;font-size:12px;">Вікно закриється...</p></div><script>if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_SUCCESS',user:${JSON.stringify(authedUser)}},'*');window.close();}else{window.location.href='/';}</script></body></html>`);
  } catch (err: any) {
    res.status(500).send(`Помилка сервера: ${err.message}`);
  }
});

app.post('/api/auth/logout', (req, res) => {
  const db = getDb();
  currentUserId = db.users[0]?.id || 'usr_sheriff_root';
  res.json({ success: true, user: getCurrentUser(req) });
});

// ==================== SETTINGS (ТІЛЬКИ ШЕРИФ) ====================

app.get('/api/settings', (req, res) => {
  res.json(getDb().settings);
});

app.post('/api/settings', requireLeader, (req, res) => {
  const db = getDb();
  db.settings = { ...db.settings, ...req.body };
  saveDb();
  res.json({ success: true, settings: db.settings });
});

app.post('/api/discord/test', requireLeader, async (req, res) => {
  const db = getDb();
  const webhookUrl = req.body.webhookUrl || db.settings.discordWebhookUrl;
  if (!webhookUrl) return res.status(400).json({ error: 'Вкажіть URL Discord Webhook' });

  try {
    const targetUrl = webhookUrl.includes('?') ? `${webhookUrl}&wait=true` : `${webhookUrl}?wait=true`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `${db.settings.academyName} | Тест`,
        content: 'Тестова перевірка Discord Webhook успішна!',
      }),
    });
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    res.json({ success: true, message: 'Тестове сповіщення надіслано в Discord!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/roles', requireLeader, (req, res) => {
  const db = getDb();
  const { roleTitles, discordGuildId, discordLeaderRoleId, discordInstructorRoleId, discordClientId, discordClientSecret, confirmationCode } = req.body;

  const validPin = db.settings.leaderSecurityPin || '7777';
  if (confirmationCode !== 'ПІДТВЕРДЖУЮ' && confirmationCode !== 'ПІДТВЕРДИТИ' && confirmationCode !== validPin) {
    return res.status(400).json({ error: `Невірний код! Введіть "ПІДТВЕРДЖУЮ" або PIN (${validPin})` });
  }

  if (roleTitles) {
    db.settings.roleTitles = {
      leader: roleTitles.leader?.trim() || db.settings.roleTitles.leader,
      instructor: roleTitles.instructor?.trim() || db.settings.roleTitles.instructor,
      cadet: roleTitles.cadet?.trim() || db.settings.roleTitles.cadet,
    };
  }
  if (discordGuildId !== undefined) db.settings.discordGuildId = discordGuildId.trim();
  if (discordLeaderRoleId !== undefined) db.settings.discordLeaderRoleId = discordLeaderRoleId.trim();
  if (discordInstructorRoleId !== undefined) db.settings.discordInstructorRoleId = discordInstructorRoleId.trim();
  if (discordClientId !== undefined) db.settings.discordClientId = discordClientId.trim();
  if (discordClientSecret !== undefined) db.settings.discordClientSecret = discordClientSecret.trim();

  saveDb();
  res.json({ success: true, settings: db.settings, message: 'Ролі успішно оновлено!' });
});

app.get('/api/discord/logs', (req, res) => {
  res.json(getDb().discordLogs);
});

// ==================== INSTRUCTOR MANAGEMENT (ТІЛЬКИ ШЕРИФ) ====================

app.get('/api/instructors', (req, res) => {
  res.json(getDb().users);
});

app.post('/api/instructors', requireLeader, (req, res) => {
  const db = getDb();
  const { name, role, staticId, discordId } = req.body;
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
  db.users = db.users.filter((u) => u.id !== req.params.id);
  saveDb();
  res.json({ success: true });
});

// ==================== TESTS CRUD (ТІЛЬКИ ШЕРИФ) ====================

app.get('/api/tests', (req, res) => {
  res.json(getDb().tests);
});

app.post('/api/tests', requireLeader, (req, res) => {
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

app.put('/api/tests/:id', requireLeader, (req, res) => {
  const db = getDb();
  const idx = db.tests.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Тест не знайдено' });
  db.tests[idx] = { ...db.tests[idx], ...req.body, id: db.tests[idx].id };
  saveDb();
  res.json(db.tests[idx]);
});

app.delete('/api/tests/:id', requireLeader, (req, res) => {
  const db = getDb();
  db.tests = db.tests.filter((t) => t.id !== req.params.id);
  saveDb();
  res.json({ success: true });
});

// ==================== LINKS & EXAMS ====================

app.get('/api/tokens', (req, res) => {
  res.json(getDb().tokens);
});

app.post('/api/links/generate', (req, res) => {
  const { cadetNickname, cadetStatic, cadetDiscord, testId } = req.body;
  if (!cadetNickname || !cadetStatic || !testId) return res.status(400).json({ error: 'Заповніть поля' });

  const db = getDb();
  const test = db.tests.find((t) => t.id === testId);
  if (!test) return res.status(404).json({ error: 'Тест не знайдено' });

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
  const { answers, antiCheatEvents, timeSpentSeconds } = req.body;
  const db = getDb();
  const tokenRecord = db.tokens.find((t) => t.token === req.params.token);
  if (!tokenRecord) return res.status(404).json({ error: 'Іспит не знайдено' });

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

    if (q.type === 'single') {
      maxAutoScore += q.maxPoints;
      let isCorrect = false;
      let score = 0;
      if (userAns.selectedOption !== undefined && userAns.selectedOption !== null) {
        if (shuffleOrder[userAns.selectedOption] === q.correctOption) {
          isCorrect = true;
          score = q.maxPoints;
          autoScore += score;
        }
      }
      evaluatedAnswers.push({ questionId: q.id, type: 'single', selectedOption: userAns.selectedOption, autoScore: score, maxPoints: q.maxPoints, isCorrect });
    } else if (q.type === 'open') {
      hasOpen = true;
      maxManualScore += q.maxPoints;
      evaluatedAnswers.push({ questionId: q.id, type: 'open', textAnswer: (userAns.textAnswer || '').trim(), manualScore: 0, maxPoints: q.maxPoints });
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

  sendDiscordExamSubmission(newResult, APP_URL).catch(() => {});
  res.json({ success: true, resultId: newResult.id, percentage, autoScore, maxAutoScore, status: newResult.status });
});

// Results
app.get('/api/results', (req, res) => {
  res.json(getDb().results);
});

app.get('/api/results/:id', (req, res) => {
  const db = getDb();
  const result = db.results.find((r) => r.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Результат не знайдено' });

  const test = db.tests.find((t) => t.id === result.testId);
  const token = db.tokens.find((t) => t.token === result.token);

  // Підтягуємо текст питань, варіанти та що саме обрав кадет
  const detailedAnswers = (result.answers || []).map((ans: any) => {
    const question = test?.questions?.find((q: any) => q.id === ans.questionId);
    const shuffle = token?.optionsShuffle?.[ans.questionId];

    // Якщо варіанти перемішувалися для кадета — зіставляємо їх з оригіналом
    let finalSelectedOption = ans.selectedOption;
    if (shuffle && ans.selectedOption !== undefined && shuffle[ans.selectedOption] !== undefined) {
      finalSelectedOption = shuffle[ans.selectedOption];
    }

    let finalSelectedOptions = ans.selectedOptions;
    if (shuffle && Array.isArray(ans.selectedOptions)) {
      finalSelectedOptions = ans.selectedOptions.map((dispIdx: number) => shuffle[dispIdx] ?? dispIdx);
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

app.post('/api/results/:id/decision', async (req, res) => {
  const { decision, comment, threadId } = req.body;
  const db = getDb();
  const result = db.results.find((r) => r.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Не знайдено' });

  const currentInstructor = getCurrentUser(req);
  result.status = decision;
  result.instructorDecision = {
    instructorId: currentInstructor.id,
    instructorName: currentInstructor.name,
    decision,
    comment: (comment || '').trim(),
    decidedAt: new Date().toISOString(),
  };
  saveDb();

  const discordRes = await sendDiscordInstructorDecision(result, APP_URL);
  res.json({ success: true, result, discordSent: discordRes.success });
});

app.get('/api/cadets/history', (req, res) => {
  const { query } = req.query;
  const db = getDb();
  if (!query) return res.json([]);
  const q = String(query).toLowerCase().trim();
  res.json(db.results.filter((r) => r.cadetNickname.toLowerCase().includes(q) || r.cadetStatic.toLowerCase().includes(q)));
});

async function startServer() {
  if (process.env.NETLIFY) return;
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'dist', 'index.html')));
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  const port = PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

if (!process.env.NETLIFY) {
  startServer();
}
