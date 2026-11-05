import { getDb, saveDb } from './db.js';
import { ExamResult, AntiCheatEvent, DiscordLogEntry, AnswerSubmission } from '../src/types.js';

export async function sendDiscordExamSubmission(
  result: ExamResult,
  appUrl: string
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  const webhookUrl = db.settings.discordWebhookUrl?.trim();
  const host = appUrl.replace(/\/+$/, '');
  const reviewUrl = `${host}/#result-${result.id}`;

  const violationsText =
    result.antiCheatEvents.length === 0
      ? '✅ Чисто (порушень не зафіксовано)'
      : `⚠️ Виявлено ${result.antiCheatEvents.length} подій:\n` +
        result.antiCheatEvents
          .slice(0, 4)
          .map((e: AntiCheatEvent) => `• [${e.type}] ${e.details}`)
          .join('\n');

  // Closed questions breakdown summary
  const closedAnswers = result.answers.filter((a: AnswerSubmission) => a.type !== 'open');
  const openAnswers = result.answers.filter((a: AnswerSubmission) => a.type === 'open');

  const closedBreakdown = closedAnswers
    .map((a: AnswerSubmission, idx: number) => {
      const mark = a.isCorrect ? '✅' : '❌';
      return `${mark} П${idx + 1}: ${a.isCorrect ? 'Правильно' : 'Помилка'} (${a.autoScore || 0}/${a.maxPoints} б.)`;
    })
    .join('  |  ');

  const openSummary =
    openAnswers.length > 0
      ? openAnswers
          .map(
            (o: AnswerSubmission, i: number) =>
              `**Кейс #${i + 1}:** ${
                o.textAnswer ? o.textAnswer.slice(0, 150) + (o.textAnswer.length > 150 ? '...' : '') : '— Відповідь порожня —'
              }`
          )
          .join('\n\n')
      : 'Відкритих запитань у цьому білеті немає.';

  const embedColor =
    result.status === 'passed'
      ? 0x10b981
      : result.status === 'failed'
      ? 0xef4444
      : 0x3b82f6; // Blue/Amber for pending review

  const minutes = Math.floor(result.timeSpentSeconds / 60);
  const seconds = result.timeSpentSeconds % 60;

  const forumThreadName = db.settings.discordForumThreadNameFormat
    ? db.settings.discordForumThreadNameFormat
        .replace('{test}', result.testTitle)
        .replace('{cadet}', result.cadetNickname)
        .replace('{static}', result.cadetStatic)
    : `📋 [ІСПИТ] ${result.testTitle} — ${result.cadetNickname} (${result.cadetStatic})`;

  const mentionContent = result.cadetDiscord
    ? `<@${result.cadetDiscord}> завершив складання іспиту!`
    : `Кадет ${result.cadetNickname} завершив складання іспиту!`;

  const payload: any = {
    username: `${db.settings.academyName} | Екзаменатор`,
    avatar_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=128&q=80',
    content: mentionContent,
    thread_name: forumThreadName.slice(0, 100), // Discord Forum thread title
    embeds: [
      {
        title: `📋 Звіт з іспиту: ${result.testTitle}`,
        description: `Кадет **${result.cadetNickname}** (${result.cadetStatic}) здав роботу на розгляд інструкторського корпусу.`,
        color: embedColor,
        fields: [
          {
            name: '👤 Кадет та Discord ID',
            value: `**${result.cadetNickname}** (${result.cadetStatic})\nDiscord: <@${result.cadetDiscord}> \`(${result.cadetDiscord})\``,
            inline: true,
          },
          {
            name: '⏱️ Час проходження',
            value: `${minutes} хв ${seconds} сек`,
            inline: true,
          },
          {
            name: '🎯 Бали (автоперевірка)',
            value: `**${result.autoScore} / ${result.maxAutoScore}** балів (${result.percentage}%)`,
            inline: true,
          },
          {
            name: '📊 Розшифровка тестів',
            value: closedBreakdown || 'Немає закритих запитань',
            inline: false,
          },
          {
            name: '📝 Ситуаційні кейси (відкриті відповіді)',
            value: openSummary.slice(0, 1024),
            inline: false,
          },
          {
            name: '🛡️ Протокол антисписування',
            value: violationsText.slice(0, 1024),
            inline: false,
          },
          {
            name: '🔗 Інспекція та вердикт інструктора',
            value: `[➡️ Відкрити результат та винести вердикт](${reviewUrl})`,
            inline: false,
          },
        ],
        footer: {
          text: `Академія Кадетів • Видав посилання: ${result.instructorName}`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const logEntry: DiscordLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    cadetNickname: result.cadetNickname,
    testTitle: result.testTitle,
    status: 'Здано на перевірку',
    payload,
    success: false,
  };

  if (!webhookUrl) {
    logEntry.response = 'Вебхук Discord не налаштовано. Повідомлення збережено у внутрішній симулятор.';
    logEntry.success = true;
    db.discordLogs.unshift(logEntry);
    saveDb();
    return { success: true };
  }

  try {
    // If webhook is configured, try sending to Discord!
    // Supporting both thread_name for forums and query params ?thread_name=
    const targetUrl = webhookUrl.includes('?')
      ? `${webhookUrl}&wait=true`
      : `${webhookUrl}?wait=true`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      logEntry.response = `HTTP ${response.status}: ${errText}`;
      logEntry.success = false;
      db.discordLogs.unshift(logEntry);
      saveDb();
      return { success: false, error: `Discord Webhook error ${response.status}: ${errText}` };
    }

    const data = await response.json().catch(() => ({}));
    if (data && (data.channel_id || data.id)) {
      result.discordThreadId = data.channel_id || data.id;
      saveDb();
    }
    logEntry.response = 'Успішно надіслано в Discord канал/форум!';
    logEntry.success = true;
    db.discordLogs.unshift(logEntry);
    saveDb();
    return { success: true };
  } catch (err: any) {
    logEntry.response = `Мережева помилка: ${err.message || String(err)}`;
    logEntry.success = false;
    db.discordLogs.unshift(logEntry);
    saveDb();
    return { success: false, error: err.message };
  }
}

export async function sendDiscordInstructorDecision(
  result: ExamResult,
  appUrl: string
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  const webhookUrl = db.settings.discordWebhookUrl?.trim();
  const decision = result.instructorDecision;
  if (!decision) return { success: false, error: 'No decision found' };

  let statusEmoji = '🟢';
  let statusText = 'ЗАРАХОВАНО';
  let color = 0x10b981; // Green

  if (decision.decision === 'failed') {
    statusEmoji = '🔴';
    statusText = 'НЕ ЗАРАХОВАНО';
    color = 0xef4444; // Red
  } else if (decision.decision === 'retake_allowed') {
    statusEmoji = '🟣';
    statusText = 'ДОЗВОЛЕНО ПЕРЕЗДАЧУ';
    color = 0x8b5cf6; // Purple
  }

  const payload: any = {
    username: `${db.settings.academyName} | Штаб Академії`,
    avatar_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=128&q=80',
    content: result.cadetDiscord
      ? `📢 <@${result.cadetDiscord}>, інструктор оновив статус вашого іспиту!`
      : `Оновлено статус іспиту кадета ${result.cadetNickname}`,
    thread_name: `Вердикт: ${result.testTitle} — ${result.cadetNickname} (${result.cadetStatic})`.slice(0, 100),
    embeds: [
      {
        title: `${statusEmoji} ВЕРДИКТ ІНСТРУКТОРА: ${statusText}`,
        description: `Іспит: **${result.testTitle}**\nКадет: **${result.cadetNickname}** (${result.cadetStatic})`,
        color,
        fields: [
          {
            name: '👨‍🏫 Інструктор',
            value: decision.instructorName,
            inline: true,
          },
          {
            name: '🎯 Підсумковий результат',
            value: `**${result.totalScore} / ${result.maxTotalScore}** б. (${result.percentage}%)`,
            inline: true,
          },
          {
            name: '💬 Коментар інструктора',
            value: decision.comment || '— Без додаткового коментаря —',
            inline: false,
          },
        ],
        footer: {
          text: `Академія Кадетів • Дата рішення: ${new Date().toLocaleDateString('uk-UA')} ${new Date().toLocaleTimeString('uk-UA')}`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const logEntry: DiscordLogEntry = {
    id: `log_dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    cadetNickname: result.cadetNickname,
    testTitle: result.testTitle,
    status: `Рішення: ${statusText}`,
    payload,
    success: false,
  };

  if (!webhookUrl) {
    logEntry.response = 'Вебхук Discord не налаштовано. Рішення збережено у симулятор.';
    logEntry.success = true;
    db.discordLogs.unshift(logEntry);
    saveDb();
    return { success: true };
  }

  try {
    const threadParam = result.discordThreadId ? `&thread_id=${result.discordThreadId}` : '';
    const targetUrl = webhookUrl.includes('?')
      ? `${webhookUrl}&wait=true${threadParam}`
      : `${webhookUrl}?wait=true${threadParam}`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      logEntry.response = `HTTP ${response.status}: ${errText}`;
      logEntry.success = false;
      db.discordLogs.unshift(logEntry);
      saveDb();
      return { success: false, error: errText };
    }

    logEntry.response = 'Вердикт успішно надіслано в Discord!';
    logEntry.success = true;
    db.discordLogs.unshift(logEntry);
    saveDb();
    return { success: true };
  } catch (err: any) {
    logEntry.response = `Мережева помилка: ${err.message || String(err)}`;
    logEntry.success = false;
    db.discordLogs.unshift(logEntry);
    saveDb();
    return { success: false, error: err.message };
  }
}
