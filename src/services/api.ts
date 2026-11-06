import {
  TestConfig,
  ExamToken,
  ExamResult,
  AppSettings,
  User,
  DiscordLogEntry,
} from '../types';

// Авторизація тепер працює через httpOnly cookie (його ставить сервер після входу),
// тому жодних ідентифікаторів користувача в заголовках передавати не потрібно.
function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...extra,
  };
}

export const api = {
  // Session & Auth
  async getSession(): Promise<{ user: User; settings: AppSettings; allUsers: User[] }> {
    const res = await fetch('/api/session', { headers: getAuthHeaders() });
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

  async backupLogin(payload: { login: string; password: string }): Promise<{ success: boolean; user: User }> {
    const res = await fetch('/api/auth/backup-login', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка авторизації Шерифа');
    return data;
  },

  async changeCuratorPassword(payload: { currentPassword: string; newPassword: string }): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка зміни пароля');
    return data;
  },

  async getDiscordAuthUrl(): Promise<{ url: string; redirectUri: string }> {
    const res = await fetch('/api/auth/discord/url', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка отримання Discord OAuth URL');
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

  async updateRoleSettings(payload: any): Promise<{ success: boolean; settings: AppSettings; message?: string }> {
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
    const res = await fetch('/api/settings', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Помилка отримання налаштувань');
    return res.json();
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<{ success: boolean; settings: AppSettings }> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Помилка оновлення налаштувань');
    }
    return res.json();
  },

  async testDiscordWebhook(webhookUrl?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch('/api/discord/test', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ webhookUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка надсилання до Discord');
    return data;
  },

  async getDiscordLogs(): Promise<DiscordLogEntry[]> {
    const res = await fetch('/api/discord/logs', { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  // Tests
  async getTests(): Promise<TestConfig[]> {
    const res = await fetch('/api/tests', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Помилка завантаження тестів (${res.status})`);
    return res.json();
  },

  async saveTest(test: Partial<TestConfig>): Promise<TestConfig> {
    const method = test.id && !test.id.startsWith('new_') ? 'PUT' : 'POST';
    const url = test.id && !test.id.startsWith('new_') ? `/api/tests/${test.id}` : '/api/tests';
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(test),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Помилка збереження тесту');
    }
    return res.json();
  },

  async deleteTest(testId: string): Promise<boolean> {
    const res = await fetch(`/api/tests/${testId}`, { method: 'DELETE', headers: getAuthHeaders() });
    return res.ok;
  },

  // Tokens / Link Generation
  async generateExamLink(data: any): Promise<{ token: ExamToken; examLink: string; discordCopyTemplate: string }> {
    const res = await fetch('/api/links/generate', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Не вдалося створити посилання');
    return result;
  },

  async getTokens(): Promise<ExamToken[]> {
    const res = await fetch('/api/tokens', { headers: getAuthHeaders() });
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

  async submitExam(token: string, payload: any): Promise<any> {
    const res = await fetch(`/api/exam/${token}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка надсилання відповідей');
    return data;
  },

  // Results
  async getResults(filters?: any): Promise<ExamResult[]> {
    const res = await fetch('/api/results', { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getResultDetail(id: string): Promise<any> {
    const res = await fetch(`/api/results/${id}`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка завантаження результату');
    return data;
  },

  async gradeOpenQuestions(id: string, grades: any[]): Promise<any> {
    const res = await fetch(`/api/results/${id}/grade-open`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ grades }),
    });
    return res.json();
  },

  async submitDecision(id: string, decision: string, comment: string, threadId?: string): Promise<any> {
    const res = await fetch(`/api/results/${id}/decision`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ decision, comment, threadId }),
    });
    return res.json();
  },

  async getInstructors(): Promise<User[]> {
    const res = await fetch('/api/instructors', { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async addInstructor(data: any): Promise<User> {
    const res = await fetch('/api/instructors', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const resData = await res.json();
    if (!res.ok) throw new Error(resData.error || 'Помилка додавання інструктора');
    return resData;
  },

  async deleteInstructor(id: string): Promise<boolean> {
    const res = await fetch(`/api/instructors/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    return res.ok;
  },

  async searchCadetHistory(query: string): Promise<ExamResult[]> {
    if (!query) return [];
    const res = await fetch(`/api/cadets/history?query=${encodeURIComponent(query)}`, { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  },
};
