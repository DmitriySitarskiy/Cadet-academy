import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TestConfig, ExamToken, ExamResult, AppSettings, User, DiscordLogEntry } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

export interface DatabaseSchema {
  settings: AppSettings;
  users: User[];
  tests: TestConfig[];
  tokens: ExamToken[];
  results: ExamResult[];
  discordLogs: DiscordLogEntry[];
}

const defaultSettings: AppSettings = {
  academyName: 'Поліцейська Академія — Патрульна Поліція',
  factionTag: 'НПУ / СБУ / Шериф',
  discordWebhookUrl: '',
  discordForumThreadNameFormat: '📋 [ІСПИТ] {test} — {cadet} ({static})',
  discordRoleMentionId: '',
  antiCheatStrictness: 'high',
  discordGuildId: '',
  discordLeaderRoleId: '',
  discordInstructorRoleId: '',
  discordClientId: '',
  discordClientSecret: '',
  leaderSecurityPin: '7777',
  roleTitles: {
    leader: 'Шеф Департаменту / Лідер',
    instructor: 'Інструктор Академії',
    cadet: 'Кадет Академії',
  },
  roleAuditLogs: [
    {
      id: 'log_initial_role',
      timestamp: new Date().toISOString(),
      actorName: 'Система (Ініціалізація)',
      targetRole: 'leader',
      oldTitle: 'Лідер',
      newTitle: 'Шеф Департаменту / Лідер',
      oldDiscordRoleId: '—',
      newDiscordRoleId: '—',
      reason: 'Базова ініціалізація структури ролей фракції',
    },
  ],
};

const defaultUsers: User[] = [
  {
    id: 'usr_leader_1',
    name: 'Олександр Коваль',
    role: 'leader',
    staticId: '#1001',
    discordId: 'koval_leader',
  },
  {
    id: 'usr_inst_1',
    name: 'Дмитро Марченко',
    role: 'instructor',
    staticId: '#1420',
    discordId: 'marchenko_inst',
  },
  {
    id: 'usr_inst_2',
    name: 'Сергій Ткаченко',
    role: 'instructor',
    staticId: '#2891',
    discordId: 'tkachenko_inst',
  },
];

const defaultTests: TestConfig[] = [
  {
    id: 'test_law_proc',
    title: 'Теорія: Законодавство та Процесуальний кодекс',
    description: 'Базовий теоретичний іспит на знання прав громадян, стадій застосування сили, правил Міранди та підстав для затримання.',
    category: 'Законодавство',
    timeLimitMinutes: 12,
    passingScorePercent: 80,
    randomQuestionCount: 6,
    maxAttempts: 2,
    cooldownHours: 12,
    isActive: true,
    questions: [
      {
        id: 'q_law_1',
        type: 'single',
        title: 'Коли офіцер зобов’язаний зачитати затриманому Правило Міранди?',
        category: 'Процесуальний кодекс',
        options: [
          'Безпосередньо на місці затримання або під час транспортування до відділку перед першим допитом',
          'Виключно після прибуття до ізолятора тимчасового тримання',
          'Лише за присутності адвоката затриманого',
          'Правило Міранди зачитується тільки за бажанням самого офіцера'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: 'Згідно з процесуальним регламентом, Правило Міранди зачитується одразу після обмеження волі особи перед будь-якими запитаннями по суті правопорушення.'
      },
      {
        id: 'q_law_2',
        type: 'single',
        title: 'Скільки стадій застосування сили передбачено статутом поліції?',
        category: 'Статут та Регламент',
        options: [
          '3 стадії',
          '4 стадії',
          '5 стадій',
          '6 стадій'
        ],
        correctOption: 2,
        maxPoints: 1,
        explanation: 'Стандартні 5 стадій: 1. Присутність офіцера; 2. Усні накази; 3. Фізичний вплив без спецзасобів; 4. Спецзасоби (тайзер/кийок); 5. Вогнепальна зброя.'
      },
      {
        id: 'q_law_3',
        type: 'multiple',
        title: 'Оберіть законні підстави для проведення первинного обшуку особи на місці:',
        category: 'Процесуальний кодекс',
        options: [
          'Особа перебуває у наручниках під арештом за скоєння злочину',
          'Підозра на наявність вогнепальної зброї, що загрожує життю офіцера',
          'Громадянин здався підозрілим через темний колір одягу',
          'Пряма письмова згода громадянина на поверхневу перевірку'
        ],
        correctOptions: [0, 1, 3],
        maxPoints: 2,
        explanation: 'Колір одягу без орієнтування не є законною підставою для обшуку.'
      },
      {
        id: 'q_law_4',
        type: 'single',
        title: 'Який максимальний термін затримання особи до пред’явлення офіційного звинувачення або рішення суду?',
        category: 'Законодавство',
        options: [
          '15 хвилин',
          '60 хвилин (1 година)',
          '72 години (або 30 хвилин за правилами штату для первинних слідчих дій)',
          'Термін не обмежений'
        ],
        correctOption: 2,
        maxPoints: 1,
        explanation: 'Процесуальний кодекс встановлює чіткі часові рамки утримання підозрюваного.'
      },
      {
        id: 'q_law_5',
        type: 'single',
        title: 'Чи має право затриманий вимагати державного адвоката, якщо не має коштів на приватного?',
        category: 'Права громадян',
        options: [
          'Так, держава зобов’язана надати захисника за запитом підозрюваного',
          'Ні, державний адвокат надається тільки за рішенням прокурора',
          'Тільки якщо сума застави перевищує $50,000',
          'Адвокат викликається тільки після посадки до в’язниці'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: 'Конституційне право на безоплатну правову допомогу є непорушним.'
      },
      {
        id: 'q_law_6',
        type: 'open',
        title: 'Ситуаційний кейс: Проведення трафік-стопу 10-55',
        category: 'Ситуаційний кейс',
        description: 'Водій зупиненого авто відмовляється заглушити двигун та тримає руки під панеллю приладів, ігноруючи усні накази. Опишіть покроково ваші дії як старшого патруля.',
        maxPoints: 3,
        explanation: 'Оцінюється: виклик підкріплення (10-32/10-77), контроль дистанції, утримання руки на кобурі без зайвої агресії, чіткі повторні накази, перехід на 10-66 у разі прямої загрози.'
      },
      {
        id: 'q_law_7',
        type: 'single',
        title: 'Який статус має громадянин, якщо він свідчить проти себе під тиском або без зачитаного правила Міранди?',
        category: 'Процесуальний кодекс',
        options: [
          'Свідчення вважаються неприпустимими доказами в суді («плід отруєного дерева»)',
          'Свідчення залишаються повністю чинними',
          'Офіцер отримує підвищення за розкриття справи',
          'Рішення приймає сержант зміни'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: 'Будь-які зізнання, отримані з порушенням регламенту Міранди, є нікчемними.'
      },
      {
        id: 'q_law_8',
        type: 'multiple',
        title: 'Які спецзасоби дозволено застосовувати під час 4-ї стадії сили?',
        category: 'Статут та Регламент',
        options: [
          'Електрошокер (Taser X26)',
          'Перцевий спрей / Газовий балончик',
          'Тактичний кийок (Batton)',
          'Автоматичний карабін M4 з бойовими набоями'
        ],
        correctOptions: [0, 1, 2],
        maxPoints: 2,
        explanation: 'Вогнепальна зброя належить виключно до 5-ї (летальної) стадії сили.'
      }
    ]
  },
  {
    id: 'test_tactics_codes',
    title: 'Тактика затримання, 10-коди та регламент радіозв’язку',
    description: 'Перевірка знання базових тен-кодів, ситуаційних кодів небезпеки, правила ведення радіоефіру та тактики штурму / переслідування.',
    category: 'Тактична підготовка',
    timeLimitMinutes: 10,
    passingScorePercent: 85,
    randomQuestionCount: 5,
    maxAttempts: 2,
    cooldownHours: 24,
    isActive: true,
    questions: [
      {
        id: 'q_tac_1',
        type: 'single',
        title: 'Що означає тен-код «10-4» у радіоефірі?',
        category: 'Тен-коди',
        options: [
          'Повідомлення прийнято / Зрозумів (Affirmative/Copy)',
          'Терміново потрібна допомога',
          'Веду переслідування підозрюваного',
          'Завершив зміну'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: '10-4 — загальноприйнятий код підтвердження прийому радіограми.'
      },
      {
        id: 'q_tac_2',
        type: 'single',
        title: 'Який код оголошується при нападі на офіцера або смертельній небезпеці (officer down / urgent backup)?',
        category: 'Ситуаційні коди',
        options: [
          'Код 0 (Code 0) або 10-99',
          'Код 4 (Code 4)',
          'Код 2 (Code 2)',
          '10-20'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: 'Code 0 або 10-99 — найвищий пріоритет: напад на офіцера, весь доступний юніт негайно прибуває на допомогу.'
      },
      {
        id: 'q_tac_3',
        type: 'single',
        title: 'Що означає оголошення «Code 4» у секторі?',
        category: 'Ситуаційні коди',
        options: [
          'Ситуація під контролем, додаткова допомога не потрібна',
          'Використання сирен та проблискових маячків без звуку',
          'Виїзд на місце ДТП',
          'Оголошення плану перехоплення'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: 'Код 4 інформує диспетчера та всі екіпажі, що сектор стабілізовано.'
      },
      {
        id: 'q_tac_4',
        type: 'multiple',
        title: 'Які обов’язкові дані офіцер повинен передати під час початку погоні (10-80)?',
        category: 'Радіоефір',
        options: [
          'Марка, модель та колір транспортного засобу підозрюваного',
          'Напрямок руху та поточна вулиця / орієнтир',
          'Кількість підозрюваних у салоні та наявність зброї',
          'Свій поточний настрій та особисті коментарі'
        ],
        correctOptions: [0, 1, 2],
        maxPoints: 2,
        explanation: 'Ефір повинен бути коротким, чітким і виключно інформативним.'
      },
      {
        id: 'q_tac_5',
        type: 'open',
        title: 'Ситуаційний кейс: Трафік-стоп підвищеного ризику (10-66)',
        category: 'Ситуаційний кейс',
        description: 'Ви зупинили авто за орієнтуванням на озброєне пограбування банку. У салоні 2 особи. Опишіть розстановку патрульних крузерів, команди підозрюваним та процедуру затримання пасажира і водія.',
        maxPoints: 3,
        explanation: 'Оцінюється: шаховий порядок авто під кутом 45 градусів, захист двигуном крузера, гучномовець, наказ вимкнути запалювання, викинути ключі, вихід з піднятими руками по одному спиною до офіцерів.'
      },
      {
        id: 'q_tac_6',
        type: 'single',
        title: 'Що позначає тен-код «10-20»?',
        category: 'Тен-коди',
        options: [
          'Поточне місцезнаходження (локація)',
          'Заправка службового автомобіля',
          'Повернення до ділянки',
          'Запит на евакуатор'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: '10-20 — стандартний запит або передача своєї локації.'
      }
    ]
  },
  {
    id: 'test_subordination_ethics',
    title: 'Субординація, етика та статут департаменту',
    description: 'Етичні норми спілкування з громадянами та колегами, дисциплінарні стягнення, порядок звернення до старшого офіцерського складу.',
    category: 'Субординація та етика',
    timeLimitMinutes: 8,
    passingScorePercent: 80,
    randomQuestionCount: 4,
    maxAttempts: 3,
    cooldownHours: 6,
    isActive: true,
    questions: [
      {
        id: 'q_eth_1',
        type: 'single',
        title: 'Як кадет або молодший офіцер повинен звертатися до старшого за званням?',
        category: 'Субординація',
        options: [
          '«Пане Сержант» / «Пане Офіцер» або за офіційним званням та прізвищем',
          'На «ти» або прізвиськом',
          'Виключно через диспетчера',
          'Звернення вільне без обов’язкового зазначення звання'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: 'Військова та поліцейська субординація вимагає чіткого поважного звернення за званням.'
      },
      {
        id: 'q_eth_2',
        type: 'single',
        title: 'Чи має право офіцер застосовувати нецензурну лексику або провокувати затриманого громадянина?',
        category: 'Етика',
        options: [
          'Категорично заборонено за будь-яких обставин',
          'Дозволено, якщо громадянин почав ображати першим',
          'Дозволено в нічний час',
          'Дозволено за згодою старшого патруля'
        ],
        correctOption: 0,
        maxPoints: 1,
        explanation: 'Офіцер представляє закон і зобов’язаний зберігати холоднокровність і професіоналізм.'
      },
      {
        id: 'q_eth_3',
        type: 'multiple',
        title: 'Що є грубим порушенням статуту Академії та тягне за собою відрахування?',
        category: 'Дисципліна',
        options: [
          'Використання службової зброї та спецзасобів без наказу чи загрози (DM/NonRP)',
          'Прогул робочого дня у формі або використання службового авто в особистих цілях',
          'Спроба дачі або отримання хабаря',
          'Ввічливе звернення до шефа у кабінеті'
        ],
        correctOptions: [0, 1, 2],
        maxPoints: 2,
        explanation: 'Корупція, прогули та безпідставна стрілянина — підстави для звільнення з ЧС.'
      },
      {
        id: 'q_eth_4',
        type: 'open',
        title: 'Ситуаційний кейс: Конфлікт між патрульними на зміні',
        category: 'Субординація',
        description: 'Ваш напарник відмовляється виконувати законний наказ старшого зміни і на підвищених тонах вступає в перепалку на очах цивільних. Ваші дії?',
        maxPoints: 2,
        explanation: 'Оцінюється: негайне припинення публічної суперечки, відсторонення цивільних від конфлікту, виконання законного наказу старшого, доповідь керівництву після завершення інциденту рапортом.'
      }
    ]
  }
];

const defaultTokens: ExamToken[] = [
  {
    id: 'tok_demo_active',
    token: 'cadet-demo-alpha-8821',
    testId: 'test_law_proc',
    testTitle: 'Теорія: Законодавство та Процесуальний кодекс',
    cadetNickname: 'Bogdan_Kravchenko',
    cadetStatic: '#18392',
    cadetDiscord: '392817482910293847',
    instructorId: 'usr_inst_1',
    instructorName: 'Дмитро Марченко',
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    status: 'pending',
    selectedQuestionIds: ['q_law_1', 'q_law_2', 'q_law_3', 'q_law_5', 'q_law_6'],
    optionsShuffle: {
      'q_law_1': [0, 1, 2, 3],
      'q_law_2': [2, 0, 1, 3],
      'q_law_3': [0, 1, 2, 3],
      'q_law_5': [0, 1, 2, 3]
    }
  }
];

const defaultResults: ExamResult[] = [
  {
    id: 'res_sample_1',
    token: 'cadet-finished-01',
    testId: 'test_law_proc',
    testTitle: 'Теорія: Законодавство та Процесуальний кодекс',
    cadetNickname: 'Vladyslav_Sokolov',
    cadetStatic: '#12904',
    cadetDiscord: '482910394857201928',
    instructorId: 'usr_inst_1',
    instructorName: 'Дмитро Марченко',
    startedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    submittedAt: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
    timeSpentSeconds: 580,
    autoScore: 5,
    maxAutoScore: 5,
    manualScore: 3,
    maxManualScore: 3,
    totalScore: 8,
    maxTotalScore: 8,
    percentage: 100,
    autoPassed: true,
    hasOpenQuestions: true,
    status: 'passed',
    instructorDecision: {
      instructorId: 'usr_inst_1',
      instructorName: 'Дмитро Марченко',
      decision: 'passed',
      comment: 'Відмінне знання процесуального кодексу та грамотно описані дії на 10-55. Допущено до патрулювання другого ступеня.',
      decidedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString()
    },
    answers: [
      {
        questionId: 'q_law_1',
        type: 'single',
        selectedOption: 0,
        autoScore: 1,
        maxPoints: 1,
        isCorrect: true
      },
      {
        questionId: 'q_law_2',
        type: 'single',
        selectedOption: 2,
        autoScore: 1,
        maxPoints: 1,
        isCorrect: true
      },
      {
        questionId: 'q_law_3',
        type: 'multiple',
        selectedOptions: [0, 1, 3],
        autoScore: 2,
        maxPoints: 2,
        isCorrect: true
      },
      {
        questionId: 'q_law_5',
        type: 'single',
        selectedOption: 0,
        autoScore: 1,
        maxPoints: 1,
        isCorrect: true
      },
      {
        questionId: 'q_law_6',
        type: 'open',
        textAnswer: '1. Тримаю дистанцію 3-5 метрів від авто. 2. Оголошую в гучномовець наказ: заглушити двигун та покласти руки на кермо. 3. Рука на кобурі у позиції готовності. 4. Запитую 10-32 (підкріплення). Якщо руки не вийнято — розцінюю як пряму загрозу та готуюся до 10-66.',
        manualScore: 3,
        maxPoints: 3,
        instructorComment: 'Чудова реакція та покроковий алгоритм.'
      }
    ],
    antiCheatEvents: [
      {
        type: 'fullscreen_exit',
        timestamp: new Date(Date.now() - 1000 * 60 * 115).toISOString(),
        details: 'Вихід з повноекранного режиму (тривалість 3 сек)'
      }
    ],
    discordPosted: true,
    discordThreadUrl: 'https://discord.com/channels/example/cadet-reports/12904'
  },
  {
    id: 'res_sample_pending',
    token: 'cadet-finished-02',
    testId: 'test_tactics_codes',
    testTitle: 'Тактика затримання, 10-коди та регламент радіозв’язку',
    cadetNickname: 'Taras_Melnyk',
    cadetStatic: '#23019',
    cadetDiscord: '819203948571029384',
    instructorId: 'usr_inst_2',
    instructorName: 'Сергій Ткаченко',
    startedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    submittedAt: new Date(Date.now() - 1000 * 60 * 36).toISOString(),
    timeSpentSeconds: 520,
    autoScore: 4,
    maxAutoScore: 5,
    manualScore: 0,
    maxManualScore: 3,
    totalScore: 4,
    maxTotalScore: 8,
    percentage: 50,
    autoPassed: false,
    hasOpenQuestions: true,
    status: 'pending_review',
    answers: [
      {
        questionId: 'q_tac_1',
        type: 'single',
        selectedOption: 0,
        autoScore: 1,
        maxPoints: 1,
        isCorrect: true
      },
      {
        questionId: 'q_tac_2',
        type: 'single',
        selectedOption: 0,
        autoScore: 1,
        maxPoints: 1,
        isCorrect: true
      },
      {
        questionId: 'q_tac_3',
        type: 'single',
        selectedOption: 0,
        autoScore: 1,
        maxPoints: 1,
        isCorrect: true
      },
      {
        questionId: 'q_tac_4',
        type: 'multiple',
        selectedOptions: [0, 1],
        autoScore: 1,
        maxPoints: 2,
        isCorrect: false
      },
      {
        questionId: 'q_tac_5',
        type: 'open',
        textAnswer: 'Зупиняємося позаду авто, вмикаємо маячки. Наказуємо водію вийти з машини спиною і лягти на землю. Потім перевіряємо пасажира.',
        maxPoints: 3
      }
    ],
    antiCheatEvents: [
      {
        type: 'tab_switch',
        timestamp: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
        details: 'Перемикання на іншу вкладку / згортання браузера'
      },
      {
        type: 'copy_paste',
        timestamp: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
        details: 'Спроба копіювання тексту питання в буфер'
      }
    ],
    discordPosted: true
  }
];

function initDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const mergedSettings = {
        ...defaultSettings,
        ...(parsed.settings || {}),
        roleTitles: {
          ...defaultSettings.roleTitles,
          ...(parsed.settings?.roleTitles || {}),
        },
        roleAuditLogs: parsed.settings?.roleAuditLogs || defaultSettings.roleAuditLogs,
      };

      return {
        settings: mergedSettings,
        users: parsed.users || defaultUsers,
        tests: parsed.tests || defaultTests,
        tokens: parsed.tokens || defaultTokens,
        results: parsed.results || defaultResults,
        discordLogs: parsed.discordLogs || [],
      };
    } catch (e) {
      console.error('Error reading db.json, recreating defaults', e);
    }
  }

  const initialDb: DatabaseSchema = {
    settings: defaultSettings,
    users: defaultUsers,
    tests: defaultTests,
    tokens: defaultTokens,
    results: defaultResults,
    discordLogs: [],
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
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
    console.error('Failed to save db.json:', err);
  }
}
