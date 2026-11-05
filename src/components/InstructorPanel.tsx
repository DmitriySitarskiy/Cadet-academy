import React, { useState, useEffect } from 'react';
import { Send, Copy, Check, ExternalLink, AlertTriangle, Clock, Award, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';
import { TestConfig, ExamToken } from '../types';
import { api } from '../services/api';

interface InstructorPanelProps {
  tests: TestConfig[];
  onOpenExamAsCadet: (token: string) => void;
}

export const InstructorPanel: React.FC<InstructorPanelProps> = ({ tests, onOpenExamAsCadet }) => {
  const [cadetNickname, setCadetNickname] = useState('');
  const [cadetStatic, setCadetStatic] = useState('');
  const [cadetDiscord, setCadetDiscord] = useState('');
  const [selectedTestId, setSelectedTestId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [generatedResult, setGeneratedResult] = useState<{
    token: ExamToken;
    examLink: string;
    discordCopyTemplate: string;
  } | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [tokens, setTokens] = useState<ExamToken[]>([]);
  const [refreshingTokens, setRefreshingTokens] = useState(false);

  useEffect(() => {
    if (tests.length > 0 && !selectedTestId) {
      setSelectedTestId(tests[0].id);
    }
  }, [tests, selectedTestId]);

  const loadTokens = async () => {
    try {
      setRefreshingTokens(true);
      const list = await api.getTokens();
      setTokens(list);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshingTokens(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const selectedTest = tests.find((t) => t.id === selectedTestId);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGeneratedResult(null);

    if (!cadetNickname.trim() || !cadetStatic.trim() || !selectedTestId) {
      setError('Заповніть нікнейм, статік та оберіть іспит');
      return;
    }

    setLoading(true);
    try {
      const data = await api.generateExamLink({
        cadetNickname: cadetNickname.trim(),
        cadetStatic: cadetStatic.trim(),
        cadetDiscord: cadetDiscord.trim(),
        testId: selectedTestId,
      });
      setGeneratedResult(data);
      loadTokens();
    } catch (err: any) {
      setError(err.message || 'Помилка генерації посилання');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, isTemplate: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isTemplate) {
        setCopiedTemplate(true);
        setTimeout(() => setCopiedTemplate(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch (err) {
      console.error('Clipboard copy error', err);
    }
  };

  const fillQuickDemo = (name: string, staticId: string, discord: string) => {
    setCadetNickname(name);
    setCadetStatic(staticId);
    setCadetDiscord(discord);
  };

  return (
    <div className="space-y-8">
      {/* Top Description Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800/80 border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-md mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Автоматизована видача іспитів
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            Генерація персонального одноразового посилання
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Коли кадет пише в Discord про готовність скласти іспит, введіть його дані нижче. Система перевірить ліміт спроб і паузу між перездачами, збереже правильні відповіді виключно на сервері та створить захищений токен.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start min-w-0">
        {/* Left Column: Generator Form (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm min-w-0 w-full">
          <form onSubmit={handleGenerate} className="space-y-6 min-w-0">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                Дані кадета та вибір тесту
              </h2>
              <div className="text-xs text-slate-400">
                Швидкий ввід:
                <button
                  type="button"
                  onClick={() => fillQuickDemo('Roman_Danyliuk', '#19482', 'danyliuk_cadet')}
                  className="ml-2 text-amber-400 hover:text-amber-300 underline font-mono"
                >
                  Кадет Данилюк
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-red-200">Помилка видачі іспиту</div>
                  <div className="text-xs text-red-300/90 mt-0.5 leading-relaxed">{error}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Нікнейм кадета (Ім'я_Прізвище) <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="напр. Alex_Mason"
                  value={cadetNickname}
                  onChange={(e) => setCadetNickname(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Статік кадета (ID в штаті) <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="напр. #14285"
                  value={cadetStatic}
                  onChange={(e) => setCadetStatic(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Discord ID або тег кадета (для сповіщення у гілці)
              </label>
              <input
                type="text"
                placeholder="напр. 392817482910293847 або @alex_mason"
                value={cadetDiscord}
                onChange={(e) => setCadetDiscord(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Якщо вказати числовий Discord ID, кадет отримає пряме згадування &lt;@ID&gt; у каналі після завершення іспиту.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Оберіть дисципліну / іспит <span className="text-amber-400">*</span>
              </label>
              <select
                value={selectedTestId}
                onChange={(e) => setSelectedTestId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.category}) · {t.timeLimitMinutes} хв
                  </option>
                ))}
              </select>
            </div>

            {selectedTest && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Параметри обраного тесту
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <Clock className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                    <div className="text-xs font-bold text-white tabular-nums">{selectedTest.timeLimitMinutes} хв</div>
                    <div className="text-[10px] text-slate-400">Ліміт часу</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <Award className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <div className="text-xs font-bold text-white tabular-nums">{selectedTest.passingScorePercent}%</div>
                    <div className="text-[10px] text-slate-400">Прохідний бал</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <RefreshCw className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <div className="text-xs font-bold text-white tabular-nums">{selectedTest.maxAttempts} спроби</div>
                    <div className="text-[10px] text-slate-400">Макс. спроб</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <ShieldAlert className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                    <div className="text-xs font-bold text-white tabular-nums">{selectedTest.cooldownHours} год</div>
                    <div className="text-[10px] text-slate-400">Пауза перездачі</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 italic">
                  Вибірка: {selectedTest.randomQuestionCount} випадкових питань з банку ({selectedTest.questions.length} доступно). Порядок питань та відповідей перемішується для кожного кадета.
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Перевірка лімітів та генерація...' : 'Створити одноразове посилання'}
            </button>
          </form>

          {/* Result Card */}
          {generatedResult && (
            <div className="mt-6 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/30 space-y-4 animate-in fade-in duration-300 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  Посилання успішно згенеровано!
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Дійсне 24 години (1 спроба)
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Пряме посилання для кадета:
                </label>
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    readOnly
                    value={generatedResult.examLink}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-amber-300 font-mono select-all truncate"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedResult.examLink, false)}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Скопійовано' : 'Копіювати'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Готове повідомлення для надсилання в Discord:
                  </label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedResult.discordCopyTemplate, true)}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 shrink-0"
                  >
                    {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedTemplate ? 'Скопійовано!' : 'Скопіювати для Discord'}
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] text-slate-300 whitespace-pre-wrap font-sans leading-relaxed break-all max-h-48 overflow-y-auto">
                  {generatedResult.discordCopyTemplate}
                </pre>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenExamAsCadet(generatedResult.token.token)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                  Відкрити іспит як кадет (Тестове проходження)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Recent Tokens & Live Status (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 min-w-0 w-full">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-white">Видані посилання</h3>
              <p className="text-[11px] text-slate-400">Останні згенеровані токени</p>
            </div>
            <button
              onClick={loadTokens}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Оновити список"
            >
              <RefreshCw className={`w-4 h-4 ${refreshingTokens ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {tokens.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Ще не видано жодного посилання.
              </div>
            ) : (
              tokens.slice(0, 8).map((tok) => {
                const isPending = tok.status === 'pending';
                const isInProgress = tok.status === 'in_progress';
                const isSubmitted = tok.status === 'submitted';
                const isExpired = tok.status === 'expired';

                return (
                  <div
                    key={tok.id}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {tok.cadetNickname}
                          <span className="text-[11px] font-mono text-slate-400 ml-1.5">
                            {tok.cadetStatic}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                          {tok.testTitle}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {isPending && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Очікує кадета
                          </span>
                        )}
                        {isInProgress && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Складає зараз
                          </span>
                        )}
                        {isSubmitted && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Здано
                          </span>
                        )}
                        {isExpired && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-500">
                            Прострочено
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/50">
                      <span>Інструктор: {tok.instructorName}</span>
                      <div className="flex items-center gap-2">
                        {!isSubmitted && !isExpired && (
                          <button
                            onClick={() => onOpenExamAsCadet(tok.token)}
                            className="text-amber-400 hover:text-amber-300 font-medium"
                          >
                            Відкрити
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
