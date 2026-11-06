import React, { useState, useEffect } from 'react';
import {
  Radio,
  Send,
  CheckCircle2,
  AlertTriangle,
  Info,
  Copy,
  ExternalLink,
  RefreshCw,
  Sparkles,
  MessageSquare,
  Shield,
  Layers,
} from 'lucide-react';
import { AppSettings, DiscordLogEntry, User } from '../types';
import { api } from '../services/api';
import { PageHeader } from './ui';
import { Lock } from 'lucide-react';

interface DiscordWebhookSettingsProps {
  settings: AppSettings | null;
  currentUser?: User | null;
  onRefreshSettings: () => void;
}

export const DiscordWebhookSettings: React.FC<DiscordWebhookSettingsProps> = ({
  settings,
  currentUser,
  onRefreshSettings,
}) => {
  const isLeader = currentUser?.role === 'leader';
  const [webhookUrl, setWebhookUrl] = useState('');
  const [threadFormat, setThreadFormat] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [factionTag, setFactionTag] = useState('');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [logs, setLogs] = useState<DiscordLogEntry[]>([]);
  const [refreshingLogs, setRefreshingLogs] = useState(false);

  useEffect(() => {
    if (settings) {
      setWebhookUrl(settings.discordWebhookUrl || '');
      setThreadFormat(
        settings.discordForumThreadNameFormat || '📋 [ІСПИТ] {test} — {cadet} ({static})'
      );
      setAcademyName(settings.academyName || '');
      setFactionTag(settings.factionTag || '');
    }
  }, [settings]);

  const loadLogs = async () => {
    try {
      setRefreshingLogs(true);
      const data = await api.getDiscordLogs();
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setTestResult(null);

    try {
      await api.updateSettings({
        discordWebhookUrl: webhookUrl.trim(),
        discordForumThreadNameFormat: threadFormat.trim(),
        academyName: academyName.trim(),
        factionTag: factionTag.trim(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onRefreshSettings();
    } catch (err: any) {
      alert(err.message || 'Помилка збереження налаштувань');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      alert('Вкажіть Discord Webhook URL для тестування');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      // Auto-save webhook settings so it is persisted for all future tests
      await api.updateSettings({
        discordWebhookUrl: webhookUrl.trim(),
        discordForumThreadNameFormat: threadFormat.trim(),
        academyName: academyName.trim(),
        factionTag: factionTag.trim(),
      });
      onRefreshSettings();

      const res = await api.testDiscordWebhook(webhookUrl.trim());
      setTestResult({
        success: true,
        message: res.message || 'Тестове повідомлення успішно надіслано в Discord!',
      });
      loadLogs();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Помилка надсилання до Discord',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Discord-вебхук"
        description="Сюди надходять звіти про складені іспити. Інструктор виносить вердикт, і кадет бачить його в тій самій гілці."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start min-w-0">
        {/* Left Column: Settings Form (6 cols) */}
        <div className="lg:col-span-6 panel p-5 sm:p-6 space-y-6 min-w-0 w-full">
          <h2 className="text-base font-semibold text-white">Підключення</h2>

          {!isLeader && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-300">
                  Доступ обмежено: Тільки Лідер фракції
                </div>
                <div className="text-[11px] text-amber-200/80 mt-1 leading-relaxed">
                  Змінювати URL вебхука, шаблон гілок та проводити тестові запити має право виключно Лідер ({settings?.roleTitles?.leader || 'Шеф Департаменту'}). Інструктори мають доступ до видачі посилань та перевірки.
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4 min-w-0">
            <div>
              <label className="label">
                Discord Webhook URL (Forum або текстовий канал)
              </label>
              <input
                type="url"
                placeholder="https://discord.com/api/webhooks/123456.../abcdef..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                disabled={!isLeader}
                className="field font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Без вебхука звіти нікуди не надсилаються.
              </span>
            </div>

            <div>
              <label className="label">
                Назва теми у Forum-каналі
              </label>
              <input
                type="text"
                value={threadFormat}
                onChange={(e) => setThreadFormat(e.target.value)}
                className="field font-mono"
              />
              <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-2">
                <span>Змінні: <code>{'{test}'}</code>, <code>{'{cadet}'}</code>, <code>{'{static}'}</code></span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="label">
                  Назва академії
                </label>
                <input
                  type="text"
                  value={academyName}
                  onChange={(e) => setAcademyName(e.target.value)}
                  className="field"
                  placeholder="Поліцейська Академія"
                />
              </div>

              <div>
                <label className="label">
                  Підзаголовок (тег фракції)
                </label>
                <input
                  type="text"
                  value={factionTag}
                  onChange={(e) => setFactionTag(e.target.value)}
                  className="field"
                  placeholder="НПУ / СБУ / Шериф"
                />
              </div>
            </div>

            {saveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Збережено.</span>
              </div>
            )}

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2 break-words ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/20 text-red-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="break-all">{testResult.message}</div>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="submit"
                disabled={saving || !isLeader}
                className={`w-full sm:flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition-colors shadow-sm ${
                  isLeader
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-50'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                }`}
              >
                {saving ? 'Збереження…' : isLeader ? 'Зберегти' : 'Тільки для керівника'}
              </button>

              <button
                type="button"
                onClick={handleTestWebhook}
                disabled={testing || !isLeader}
                className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{testing ? 'Надсилання…' : 'Надіслати тест'}</span>
              </button>
            </div>
          </form>

          {/* Setup Guide */}
          <details className="group rounded-xl border border-[#1b2740] bg-[#070d1a] p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-300 hover:text-white">
              <Info className="h-4 w-4 shrink-0 text-amber-400" />
              <span>Як створити вебхук</span>
            </summary>
            <div className="mt-3 space-y-3">
            <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                У вашому Discord-сервері натисніть <strong>«+»</strong> біля списку каналів та оберіть тип <strong>Forum (Форум)</strong>.
              </li>
              <li>
                У налаштуваннях Forum-каналу перейдіть у вкладку <strong>«Інтеграції» (Integrations)</strong> ➔ <strong>«Вебхуки»</strong>.
              </li>
              <li>
                Натисніть <strong>«Новий вебхук»</strong>, назвіть його «Академія Кадетів» та скопіюйте <strong>Webhook URL</strong>.
              </li>
              <li>
                Вставте посилання у поле вгорі. Кожен складений іспит автоматично створить нову тему у форумі з повним звітом для інструкторів!
              </li>
            </ol>
            </div>
          </details>
        </div>

        {/* Right Column: Live Discord Post Mockup & Simulator (6 cols) */}
        <div className="lg:col-span-6 space-y-6 min-w-0 w-full overflow-hidden">
          {/* Discord Forum Simulator */}
          <div className="rounded-2xl bg-[#313338] border border-[#232428] shadow-xl overflow-hidden text-[#dbdee1] font-sans w-full">
            {/* Discord Channel Header */}
            <div className="px-4 py-2.5 bg-[#2b2d31] border-b border-[#1f2023] flex items-center justify-between gap-2 text-xs font-semibold text-white">
              <div className="flex items-center gap-2 truncate">
                <span className="text-[#949ba4] shrink-0">#</span>
                <span className="truncate">екзамени-кадетів (Discord Forum)</span>
              </div>
              <span className="text-[10px] text-[#949ba4] font-normal shrink-0">Приклад публікації</span>
            </div>

            {/* Post Content */}
            <div className="p-4 space-y-3 text-xs min-w-0">
              <div className="text-[#949ba4] font-mono text-[11px] truncate">
                Тема: <strong className="text-white">📋 [ІСПИТ] Теорія: Законодавство — Bogdan_Kravchenko (#18392)</strong>
              </div>

              {/* Bot User Header */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-white truncate max-w-[200px]">
                      {academyName || 'Поліцейська Академія'} | Екзаменатор
                    </span>
                    <span className="bg-[#5865f2] text-white text-[9px] font-bold px-1 rounded uppercase tracking-wider shrink-0">
                      ВЕБХУК
                    </span>
                  </div>
                  <div className="text-[10px] text-[#949ba4]">Сьогодні о 14:20</div>
                </div>
              </div>

              <div className="text-[#00a8fc] font-medium break-all">
                @392817482910293847 завершив складання іспиту!
              </div>

              {/* Discord Embed */}
              <div className="rounded-md border-l-4 border-l-[#23a55a] bg-[#2b2d31] p-3.5 space-y-3 min-w-0 overflow-hidden">
                <div className="font-bold text-white text-sm break-words">
                  📋 Звіт з іспиту: Теорія: Законодавство та Процесуальний кодекс
                </div>
                <div className="text-xs text-[#b5bac1] break-words">
                  Кадет **Bogdan_Kravchenko** (#18392) здав роботу на розгляд інструкторського корпусу.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[#35373c] text-xs">
                  <div>
                    <span className="text-[10px] text-[#949ba4] block uppercase font-bold">👤 Кадет</span>
                    <span className="text-white font-medium break-words">Bogdan_Kravchenko (#18392)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#949ba4] block uppercase font-bold">🎯 Результат</span>
                    <span className="text-white font-bold text-[#23a55a]">8 / 8 балів (100%)</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#35373c]">
                  <span className="text-[10px] text-[#949ba4] block uppercase font-bold mb-1">📊 Розшифровка тестів</span>
                  <div className="text-[11px] text-[#dbdee1] font-mono bg-[#1e1f22] p-2 rounded break-words leading-relaxed">
                    ✅ П1: Правильно (1/1) · ✅ П2: Правильно (1/1) · ✅ П3: Правильно (2/2)
                  </div>
                </div>

                <div className="pt-2 border-t border-[#35373c]">
                  <span className="text-[10px] text-[#949ba4] block uppercase font-bold mb-1">🛡️ Протокол антисписування</span>
                  <div className="text-[11px] text-[#23a55a] break-words">
                    ✅ Чисто (порушень не зафіксовано, кадет не залишав вкладку)
                  </div>
                </div>

                <div className="pt-2 border-t border-[#35373c]">
                  <span className="text-[10px] text-[#949ba4] block uppercase font-bold mb-1">🔗 Інспекція</span>
                  <div className="text-[#00a8fc] underline font-medium cursor-pointer">
                    [➡️ Відкрити результат та винести вердикт]
                  </div>
                </div>
              </div>

              {/* Instructor verdict thread message */}
              <div className="pt-3 border-t border-[#35373c] space-y-2">
                <div className="text-[11px] text-[#949ba4] font-semibold">
                  Відповідь інструктора у гілку (після натискання «Зараховано»):
                </div>
                <div className="rounded-md border-l-4 border-l-[#23a55a] bg-[#2b2d31] p-3 text-xs space-y-1 min-w-0">
                  <div className="font-bold text-[#23a55a] flex items-center gap-1.5">
                    <span>🟢</span> ВЕРДИКТ ІНСТРУКТОРА: ЗАРАХОВАНО
                  </div>
                  <div className="text-[#dbdee1]">
                    👨‍🏫 Інструктор: <strong>Дмитро Марченко</strong>
                  </div>
                  <div className="text-[#b5bac1] italic break-words">
                    «Відмінне знання процесуального кодексу та грамотно описані дії на 10-55. Допущено до патрулювання другого ступеня.»
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Discord Dispatches Log */}
          <div className="panel p-5 space-y-3 min-w-0 w-full">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Журнал надсилань ({logs.length})
              </h3>
              <button
                onClick={loadLogs}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                title="Оновити журнал"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {logs.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  Надсилань ще не було.
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white truncate">
                        {log.cadetNickname} · {log.status}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                          log.success
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {log.success ? 'Успіх' : 'Помилка'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 break-all line-clamp-2 leading-relaxed">
                      {log.response}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {new Date(log.timestamp).toLocaleString('uk-UA')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
