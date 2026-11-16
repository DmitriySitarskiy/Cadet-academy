export type UserRole = 'leader' | 'instructor' | 'officer' | 'cadet';

// Додаткові права порталу (видаються окремими ролями Discord)
export type PortalPerm = 'hr' | 'mts';

export interface RoleAuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorDiscordId?: string;
  targetRole: UserRole;
  oldTitle: string;
  newTitle: string;
  oldDiscordRoleId: string;
  newDiscordRoleId: string;
  reason?: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  staticId?: string;
  discordId?: string;
  discordUsername?: string;
  discordAvatar?: string;
  authMethod?: 'discord_oauth' | 'manual' | 'discord_id';
  customRoleTitle?: string;
  perms?: PortalPerm[];
}

export type QuestionType = 'single' | 'multiple' | 'open';

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  category: string;
  description?: string;
  options?: string[];
  correctOption?: number; // 0-indexed for single
  correctOptions?: number[]; // array of indices for multiple
  maxPoints: number;
  explanation?: string;
}

export interface TestConfig {
  id: string;
  title: string;
  description: string;
  category: string;
  timeLimitMinutes: number;
  passingScorePercent: number;
  randomQuestionCount: number;
  maxAttempts: number;
  cooldownHours: number;
  isActive: boolean;
  questions: Question[];
}

export interface ExamToken {
  id: string;
  token: string;
  testId: string;
  testTitle: string;
  cadetNickname: string;
  cadetStatic: string;
  cadetDiscord: string;
  instructorId: string;
  instructorName: string;
  createdAt: string;
  expiresAt: string;
  startedAt?: string;
  completedAt?: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'expired';
  selectedQuestionIds: string[];
  optionsShuffle: Record<string, number[]>; // questionId -> [shuffled option indices]
}

export interface AntiCheatEvent {
  type: 'tab_switch' | 'fullscreen_exit' | 'copy_paste' | 'devtools' | 'blur';
  timestamp: string;
  details: string;
}

export interface AnswerSubmission {
  questionId: string;
  type: QuestionType;
  selectedOption?: number;
  selectedOptions?: number[];
  textAnswer?: string;
  autoScore?: number;
  manualScore?: number;
  maxPoints: number;
  isCorrect?: boolean;
  instructorComment?: string;
}

export interface ExamResult {
  id: string;
  token: string;
  testId: string;
  testTitle: string;
  cadetNickname: string;
  cadetStatic: string;
  cadetDiscord: string;
  instructorId: string;
  instructorName: string;
  startedAt: string;
  submittedAt: string;
  timeSpentSeconds: number;
  autoScore: number;
  maxAutoScore: number;
  manualScore: number;
  maxManualScore: number;
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  autoPassed: boolean;
  hasOpenQuestions: boolean;
  status: 'pending_review' | 'passed' | 'failed' | 'retake_allowed';
  instructorDecision?: {
    instructorId: string;
    instructorName: string;
    decision: 'passed' | 'failed' | 'retake_allowed';
    comment: string;
    decidedAt: string;
  };
  answers: AnswerSubmission[];
  antiCheatEvents: AntiCheatEvent[];
  discordPosted: boolean;
  discordThreadUrl?: string;
  discordThreadId?: string;
}

export interface AppSettings {
  academyName: string;
  factionTag: string;
  discordWebhookUrl: string;
  discordForumThreadNameFormat: string;
  discordRoleMentionId: string;
  antiCheatStrictness: 'high' | 'medium' | 'low';

  // Discord Guild & Role mapping for authorization
  discordGuildId?: string;
  discordLeaderRoleId?: string;
  discordInstructorRoleId?: string;
  discordClientId?: string;
  // Портал: ролі та вебхуки
  discordOfficerRoleId?: string;
  discordHrRoleId?: string;
  discordMtsRoleId?: string;
  discordHrWebhookUrl?: string;
  discordCraftWebhookUrl?: string;
  discordCraftUseThread?: boolean;
  // Секрет і хеш пароля НІКОЛИ не передаються на клієнт; сервер віддає лише прапорець *Set
  discordClientSecret?: string;
  discordClientSecretSet?: boolean;
  curatorPasswordHash?: string;

  // Custom Role Titles & Configurations
  roleTitles: {
    leader: string;
    instructor: string;
    cadet: string;
  };
  roleAuditLogs?: RoleAuditLogEntry[];
}

export interface DiscordLogEntry {
  id: string;
  timestamp: string;
  cadetNickname: string;
  testTitle: string;
  status: string;
  payload: any;
  success: boolean;
  response?: string;
}

/* ───────────── Портал: кадри та склад ───────────── */

export interface Officer {
  discordId: string;
  name: string;
  staticId: string;
  department: string;
  rank: number | null; // 1..15, null — ще не вказано кадровиками
  confirmed: boolean; // людина сама перевірила ім'я та статік у профілі
  createdAt: string;
  updatedAt: string;
}

export type HrAuditType = 'hire' | 'promote' | 'demote' | 'dismiss' | 'correction';

export interface PersonSnapshot {
  discordId?: string;
  name: string;
  staticId: string;
  department?: string;
}

export interface HrAudit {
  id: string;
  type: HrAuditType;
  officer: PersonSnapshot;
  rankFrom: number | null;
  rankTo: number | null;
  basis: string;
  filer: PersonSnapshot;
  createdAt: string;
  discordPosted: boolean;
  discordError?: string;
  local?: boolean; // запис лише в журналі (корекція даних), у Discord не йде
}

export interface CraftItem {
  id: string;
  name: string;
  cost: number; // матеріалів на одиницю
  active: boolean;
}

export interface CraftLine {
  itemId: string;
  name: string;
  qty: number;
  unitCost: number;
}

export interface CraftReport {
  id: string;
  createdAt: string;
  officer: PersonSnapshot;
  lines: CraftLine[];
  totalCost: number;
  purpose: string;
}

export interface PortalConfig {
  ranks: { n: number; name: string }[];
  reasons: string[];
  purposes: string[];
  catalog: CraftItem[];
}

export interface CadetCandidate {
  nickname: string;
  staticId: string;
  discordId: string;
  attempts: number; // скільки робіт уже здавав
  lastStatus?: 'pending_review' | 'passed' | 'failed' | 'retake_allowed';
  lastAt?: string;
  rank?: number | null;
  inOfficerDb: boolean;
}
