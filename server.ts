import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { getDb, saveDb } from './server/db.js';
import { sendDiscordExamSubmission, sendDiscordInstructorDecision } from './server/discord.js';
import { ExamToken, ExamResult, AnswerSubmission, AntiCheatEvent, User } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: '10mb' }));

// Middleware to simulate session / user
let currentUserId = 'usr_inst_1'; // Default active user (Instructor)

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ==================== AUTH & SESSION ====================

app.get('/api/session', (req, res) => {
  const db = getDb();
  const user = db.users.find((u) => u.id === currentUserId) || db.users[0];
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

// ==================== SETTINGS & DISCORD ====================

app.get('/api/settings', (req, res) => {
  const db = getDb();
  res.json(db.settings);
});

app.post('/api/settings', (req, res) => {
  const db = getDb();
  db.settings = { ...db.settings, ...req.body };
  saveDb();
  res.json({ success: true, settings: db.settings });
});

app.post('/api/discord/test', async (req, res) => {
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
