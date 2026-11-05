export type UserRole = 'leader' | 'instructor' | 'cadet';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  staticId?: string;
  discordId?: string;
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
