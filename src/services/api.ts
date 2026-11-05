import {
  TestConfig,
  ExamToken,
  ExamResult,
  AppSettings,
  User,
  DiscordLogEntry,
} from '../types';

function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const activeUserId = typeof window !== 'undefined' ? localStorage.getItem('cadet_current_user_id') || '' : '';
  return {
    'Content-Type': 'application/json',
    ...(activeUserId ? { 'x-user-id': activeUserId } : {}),
    ...extra,
  };
}

export const api = {
  // Session & Auth
  async getSession(): Promise<{ user: User; settings: AppSettings; allUsers: User[] }> {
    const res = await fetch('/api/session', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Помилка завантаження сесії');
    return res.json();
  },

  async switchUser(userId: string): Promise<{ success: boolean; user: User }> {
    const res = await fetch('/api/session/switch', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error('Не вдалося перемкнути користувача');
    return res.json();
  },

  async getDiscordAuthUrl(): Promise<{ url: string; redirectUri: string }> {
    const res = await fetch('/api/auth/discord/url', {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка отримання Discord OAuth URL');
    return data;
  },

  async directDiscordLogin(payload: {
    discordId: string;
    discordUsername?: string;
    role?: 'leader' | 'instructor';
    name?: string;
    staticId?: string;
  }): Promise<{ success: boolean; user: User }> {
    const res = await fetch('/api/auth/discord/direct-login', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка авторизації Discord');
    return data;
  },

  async logout(): Promise<{ success: boolean; user: User }> {
    const res = await fetch('/api/auth/logout', { 
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Помилка виходу');
    return res.json();
  },

  async updateRoleSettings(payload: {
    roleTitles?: { leader?: string; instructor?: string; cadet?: string };
    discordGuildId?: string;
    discordLeaderRoleId?: string;
    discordInstructorRoleId?: string;
    discordClientId?: string;
    discordClientSecret?: string;
    confirmationCode: string;
    reason?: string;
  }): Promise<{ success: boolean; settings: AppSettings; message?: string }> {
    const res = await fetch('/api/settings/roles', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка збереження структури ролей');
    return data;
  },
  
  // Settings
  async getSettings(): Promise<AppSettings> {
    const res = await fetch('/api/settings', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Помилка отримання налаштувань');
    return res.json();
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<{ success: boolean; settings: AppSettings }> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Помилка оновлення налаштувань');
    return res.json();
  },

  async testDiscordWebhook(webhookUrl?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch('/api/discord/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка надсилання до Discord');
    return data;
  },

  async getDiscordLogs(): Promise<DiscordLogEntry[]> {
    const res = await fetch('/api/discord/logs');
    if (!res.ok) return [];
    return res.json();
  },

  // Tests
  async getTests(): Promise<TestConfig[]> {
    const res = await fetch('/api/tests');
    if (!res.ok) throw new Error('Помилка завантаження тестів');
    return res.json();
  },

  async saveTest(test: Partial<TestConfig>): Promise<TestConfig> {
    const method = test.id && !test.id.startsWith('new_') ? 'PUT' : 'POST';
    const url = test.id && !test.id.startsWith('new_') ? `/api/tests/${test.id}` : '/api/tests';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(test),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Помилка збереження тесту');
    }
    return res.json();
  },

  async deleteTest(testId: string): Promise<boolean> {
    const res = await fetch(`/api/tests/${testId}`, { method: 'DELETE' });
    return res.ok;
  },

  // Tokens / Link Generation
  async generateExamLink(data: {
    cadetNickname: string;
    cadetStatic: string;
    cadetDiscord?: string;
    testId: string;
  }): Promise<{ token: ExamToken; examLink: string; discordCopyTemplate: string }> {
    const res = await fetch('/api/links/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Не вдалося створити посилання');
    }
    return result;
  },

  async getTokens(): Promise<ExamToken[]> {
    const res = await fetch('/api/tokens');
    if (!res.ok) return [];
    return res.json();
  },

  // Cadet Exam Flow
  async getExamByToken(token: string): Promise<any> {
    const res = await fetch(`/api/exam/${token}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка відкриття іспиту');
    return data;
  },

  async submitExam(
    token: string,
    payload: {
      answers: Array<{ questionId: string; selectedOption?: number; selectedOptions?: number[]; textAnswer?: string }>;
      antiCheatEvents: any[];
      timeSpentSeconds: number;
    }
  ): Promise<any> {
    const res = await fetch(`/api/exam/${token}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка надсилання відповідей');
    return data;
  },

  // Results & Grading
  async getResults(filters?: { status?: string; search?: string; testId?: string }): Promise<ExamResult[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.testId) params.set('testId', filters.testId);

    const res = await fetch(`/api/results?${params.toString()}`);
    if (!res.ok) return [];
    return res.json();
  },

  async getResultDetail(id: string): Promise<any> {
    const res = await fetch(`/api/results/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка завантаження результату');
    return data;
  },

  async gradeOpenQuestions(
    id: string,
    grades: Array<{ questionId: string; manualScore: number; instructorComment?: string }>
  ): Promise<any> {
    const res = await fetch(`/api/results/${id}/grade-open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grades }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка оцінювання');
    return data;
  },

  async submitDecision(
    id: string,
    decision: 'passed' | 'failed' | 'retake_allowed',
    comment: string,
    threadId?: string
  ): Promise<any> {
    const res = await fetch(`/api/results/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comment, threadId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка винесення вердикту');
    return data;
  },

  // Instructors
  async getInstructors(): Promise<User[]> {
    const res = await fetch('/api/instructors');
    if (!res.ok) return [];
    return res.json();
  },

  async addInstructor(data: { name: string; role: string; staticId?: string; discordId?: string }): Promise<User> {
    const res = await fetch('/api/instructors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const resData = await res.json();
    if (!res.ok) throw new Error(resData.error || 'Помилка додавання інструктора');
    return resData;
  },

  async deleteInstructor(id: string): Promise<boolean> {
    const res = await fetch(`/api/instructors/${id}`, { method: 'DELETE' });
    return res.ok;
  },

  async searchCadetHistory(query: string): Promise<ExamResult[]> {
    if (!query) return [];
    const res = await fetch(`/api/cadets/history?query=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return res.json();
  },
};
