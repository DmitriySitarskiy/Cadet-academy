import React, { useState, useEffect } from 'react';
import { Send, Copy, Check, ExternalLink, AlertTriangle, Clock, RefreshCw, Link2, X } from 'lucide-react';
import { TestConfig, ExamToken } from '../types';
import { api } from '../services/api';
import { PageHeader, EmptyState, timeAgo } from './ui';

interface InstructorPanelProps {
  tests: TestConfig[];
  onOpenExamAsCadet: (token: string) => void;
}

const TOKEN_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  pending: { label: 'Очікує кадета', dot: 'bg-amber-400', text: 'text-amber-300' },
  in_progress: { label: 'Складає зараз', dot: 'bg-sky-400', text: 'text-sky-300' },
  submitted: { label: 'Здано', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  expired: { label: 'Прострочено', dot: 'bg-slate-600', text: 'text-slate-500' },
};

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

  const [copied, setCopied] = useState<string | null>(null); // 'template' | 'link' | token id
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
      setTokens(await api.getTokens());
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
      setError('Заповніть нікнейм, статік і виберіть іспит.');
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
      // Форма очищається, щоб одразу видавати наступне посилання
      setCadetNickname('');
      setCadetStatic('');
      setCadetDiscord('');
      loadTokens();
    } catch (err: any) {
      setError(err.message || 'Не вдалося створити посилання.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 2000);
    } catch (err) {
      console.error('Clipboard copy error', err);
    }
  };

  const linkFor = (token: string) => `${window.location.origin}/#exam-${token}`;

  return (
    <div>
      <PageHeader
        title="Видати посилання"
        description="Створіть одноразове посилання для кадета й надішліть його в Discord. Посилання діє 24 години."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Ліва колонка: результат і форма */}
        <div className="min-w-0 space-y-5">
          {generatedResult && (
            <section className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-5 sm:p-6" aria-live="polite">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold text-white">
                    <Check className="h-4 w-4 text-emerald-400" />
                    Посилання для {generatedResult.token.cadetNickname} готове
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    Скопіюйте повідомлення й вставте його в канал іспитів у Discord.
                  </p>
                </div>
                <button
                  onClick={() => setGeneratedResult(null)}
                  className="btn btn-ghost !p-1.5"
                  aria-label="Закрити"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <pre className="mt-4 max-h-52 overflow-y-auto whitespace-pre-wrap break-all rounded-xl border border-[#1b2740] bg-[#070d1a] p-4 font-sans text-sm leading-relaxed text-slate-300">
                {generatedResult.discordCopyTemplate}
              </pre>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copyText(generatedResult.discordCopyTemplate, 'template')}
                  className="btn btn-primary"
                >
                  {copied === 'template' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === 'template' ? 'Скопійовано' : 'Копіювати для Discord'}
                </button>
                <button onClick={() => copyText(generatedResult.examLink, 'link')} className="btn btn-secondary">
                  {copied === 'link' ? <Check className="h-4 w-4 text-emerald-400" /> : <Link2 className="h-4 w-4" />}
                  {copied === 'link' ? 'Скопійовано' : 'Тільки посилання'}
                </button>
                <button
                  onClick={() => onOpenExamAsCadet(generatedResult.token.token)}
                  className="btn btn-ghost"
                  title="Відкриє іспит і запустить таймер. Посилання вважатиметься початим."
                >
                  <ExternalLink className="h-4 w-4" />
                  Пройти як кадет
                </button>
              </div>
            </section>
          )}

          <form onSubmit={handleGenerate} className="panel space-y-5 p-5 sm:p-6">
            <h2 className="text-base font-semibold text-white">Новий іспит для кадета</h2>

            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div className="leading-relaxed text-red-200">{error}</div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cadet-nick" className="label">
                  Нікнейм
                </label>
                <input
                  id="cadet-nick"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Alex_Mason"
                  value={cadetNickname}
                  onChange={(e) => setCadetNickname(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="cadet-static" className="label">
                  Статік
                </label>
                <input
                  id="cadet-static"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="#14285"
                  value={cadetStatic}
                  onChange={(e) => setCadetStatic(e.target.value)}
                  className="field font-mono"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cadet-discord" className="label">
                Discord ID кадета <span className="font-normal text-slate-500">(необов'язково)</span>
              </label>
              <input
                id="cadet-discord"
                type="text"
                autoComplete="off"
                placeholder="392817482910293847"
                value={cadetDiscord}
                onChange={(e) => setCadetDiscord(e.target.value)}
                className="field font-mono"
              />
              <p className="hint">З числовим ID кадет отримає згадування (@) у гілці, коли ви винесете вердикт.</p>
            </div>

            <div>
              <label htmlFor="test-select" className="label">
                Іспит
              </label>
              <select
                id="test-select"
                value={selectedTestId}
                onChange={(e) => setSelectedTestId(e.target.value)}
                className="field"
              >
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>

              {selectedTest && (
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    <span className="num">{selectedTest.timeLimitMinutes}</span> хв
                  </span>
                  <span>
                    прохідний бал <span className="num text-slate-200">{selectedTest.passingScorePercent}%</span>
                  </span>
                  <span>
                    <span className="num text-slate-200">{selectedTest.randomQuestionCount}</span> питань з{' '}
                    <span className="num">{selectedTest.questions.length}</span>
                  </span>
                  <span>
                    <span className="num">{selectedTest.maxAttempts}</span> спроби, пауза{' '}
                    <span className="num">{selectedTest.cooldownHours}</span> год
                  </span>
                </p>
              )}

              {tests.length === 0 && (
                <p className="hint">У банку ще немає іспитів. Створіть перший у розділі «Банк тестів».</p>
              )}
            </div>

            <button type="submit" disabled={loading || tests.length === 0} className="btn btn-primary w-full !py-3">
              <Send className="h-4 w-4" />
              {loading ? 'Створюємо…' : 'Створити посилання'}
            </button>
          </form>
        </div>

        {/* Права колонка: видані посилання */}
        <aside className="panel min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Видані посилання</h2>
            <button
              onClick={loadTokens}
              className="btn btn-ghost !p-1.5"
              title="Оновити список"
              aria-label="Оновити список"
            >
              <RefreshCw className={`h-4 w-4 ${refreshingTokens ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {tokens.length === 0 ? (
            <EmptyState
              icon={<Link2 className="h-5 w-5" />}
              title="Посилань ще немає"
              text="Створіть перше, і воно з'явиться тут."
            />
          ) : (
            <ul className="-mx-2 max-h-[34rem] divide-y divide-[#142038] overflow-y-auto">
              {tokens.slice(0, 12).map((tok) => {
                const meta = TOKEN_STATUS[tok.status] || TOKEN_STATUS.expired;
                const usable = tok.status === 'pending' || tok.status === 'in_progress';
                return (
                  <li key={tok.id} className="flex items-start gap-3 px-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">
                        {tok.cadetNickname}
                        <span className="ml-2 font-mono text-xs font-normal text-slate-500">{tok.cadetStatic}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">{tok.testTitle}</div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${meta.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        <span className="text-slate-600">{timeAgo(tok.createdAt)}</span>
                      </div>
                    </div>
                    {usable && (
                      <button
                        onClick={() => copyText(linkFor(tok.token), tok.id)}
                        className="btn btn-ghost !p-2"
                        title="Скопіювати посилання"
                        aria-label="Скопіювати посилання"
                      >
                        {copied === tok.id ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
};
