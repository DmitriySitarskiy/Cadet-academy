import React, { useState } from 'react';
import { Search, RefreshCw, ShieldAlert, ChevronRight, Inbox } from 'lucide-react';
import { ExamResult, TestConfig } from '../types';
import { PageHeader, Segmented, StatusLabel, EmptyState, RESULT_STATUS, ResultStatusKey, pluralUa, timeAgo } from './ui';

interface ResultsTableProps {
  results: ExamResult[];
  tests: TestConfig[];
  onSelectResult: (resultId: string) => void;
  onRefresh: () => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ results, tests, onSelectResult, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [testFilter, setTestFilter] = useState<string>('all');

  const count = (status: string) => results.filter((r) => r.status === status).length;
  const pending = results.filter((r) => r.status === 'pending_review');

  const filtered = results.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (testFilter !== 'all' && r.testId !== testFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const haystack = [r.cadetNickname, r.cadetStatic, r.cadetDiscord, r.testTitle].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const hasFilters = statusFilter !== 'all' || testFilter !== 'all' || searchQuery.trim() !== '';
  const resetFilters = () => {
    setStatusFilter('all');
    setTestFilter('all');
    setSearchQuery('');
  };

  return (
    <div>
      <PageHeader
        title="Результати іспитів"
        description="Роботи кадетів, які чекають вашого рішення, і архів уже перевірених."
        actions={
          <button onClick={onRefresh} className="btn btn-secondary" title="Оновити список">
            <RefreshCw className="h-4 w-4" />
            Оновити
          </button>
        }
      />

      {/* Черга: те, що потребує рішення, стоїть першим */}
      {pending.length > 0 && statusFilter !== 'pending_review' && (
        <section className="mb-7 overflow-hidden rounded-2xl border border-amber-400/25 bg-amber-400/[0.04]">
          <div className="flex items-baseline gap-3 px-5 pb-1 pt-5">
            <span className="num text-4xl font-semibold leading-none text-amber-300">{pending.length}</span>
            <span className="text-sm text-slate-300">
              {pluralUa(pending.length, 'робота чекає', 'роботи чекають', 'робіт чекають')} вашого рішення
            </span>
          </div>
          <ul className="mt-3 divide-y divide-amber-400/10 border-t border-amber-400/10">
            {pending.slice(0, 4).map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onSelectResult(r.id)}
                  className="group flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-amber-400/[0.06]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">
                      {r.cadetNickname}
                      <span className="ml-2 font-mono text-xs font-normal text-slate-500">{r.cadetStatic}</span>
                    </div>
                    <div className="truncate text-xs text-slate-400">{r.testTitle}</div>
                  </div>
                  <span className="hidden text-xs text-slate-500 sm:block">{timeAgo(r.submittedAt)}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-300 group-hover:text-amber-200">
                    Перевірити
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pending.length > 4 && (
            <div className="border-t border-amber-400/10 px-5 py-3">
              <button
                onClick={() => setStatusFilter('pending_review')}
                className="text-sm font-medium text-amber-300 hover:text-amber-200"
              >
                Показати всі {pending.length}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Пошук і фільтри */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'Усі', count: results.length },
            { value: 'pending_review', label: 'На перевірці', count: count('pending_review') },
            { value: 'passed', label: 'Зараховано', count: count('passed') },
            { value: 'failed', label: 'Не зараховано', count: count('failed') },
            { value: 'retake_allowed', label: 'Перездача', count: count('retake_allowed') },
          ]}
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          {tests.length > 1 && (
            <select
              value={testFilter}
              onChange={(e) => setTestFilter(e.target.value)}
              aria-label="Фільтр за іспитом"
              className="field sm:w-52"
            >
              <option value="all">Усі іспити</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              placeholder="Нікнейм або статік"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Пошук за нікнеймом або статіком"
              className="field !pl-9"
            />
          </div>
        </div>
      </div>

      {/* Список робіт */}
      <div className="panel overflow-hidden">
        {filtered.length === 0 ? (
          results.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="Робіт ще немає"
              text="Коли кадет складе іспит за посиланням, результат з'явиться тут."
            />
          ) : (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="Нічого не знайдено"
              text="Змініть запит або зніміть фільтри."
              action={
                hasFilters ? (
                  <button onClick={resetFilters} className="btn btn-secondary">
                    Скинути фільтри
                  </button>
                ) : undefined
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#1b2740] text-xs font-medium text-slate-500">
                  <th className="px-5 py-3 font-medium">Кадет</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Іспит</th>
                  <th className="px-4 py-3 font-medium">Результат</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Здано</th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#142038]">
                {filtered.map((item) => {
                  const meta = RESULT_STATUS[item.status as ResultStatusKey];
                  const violations = item.antiCheatEvents.length;
                  const minutes = Math.max(1, Math.round(item.timeSpentSeconds / 60));
                  return (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      onClick={() => onSelectResult(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSelectResult(item.id);
                      }}
                      className="group relative cursor-pointer transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04]"
                    >
                      <td className="relative px-5 py-4">
                        {meta && (
                          <span className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-r ${meta.rail}`} />
                        )}
                        <div className="text-sm font-medium text-white">{item.cadetNickname}</div>
                        <div className="mt-0.5 font-mono text-xs text-slate-500">{item.cadetStatic}</div>
                      </td>

                      <td className="hidden max-w-[16rem] px-4 py-4 sm:table-cell">
                        <div className="truncate text-sm text-slate-200">{item.testTitle}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{item.instructorName}</div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="num text-sm font-semibold text-white">{item.percentage}%</div>
                        <div className="num mt-0.5 text-xs text-slate-500">
                          {item.totalScore} з {item.maxTotalScore} б.
                          {item.hasOpenQuestions && item.status === 'pending_review' && ' · без відкритих'}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2.5">
                          <StatusLabel status={item.status} />
                          {violations > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-400"
                              title={`Подій антисписування: ${violations}`}
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                              <span className="num">{violations}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="hidden px-4 py-4 md:table-cell">
                        <div className="text-sm text-slate-300">{timeAgo(item.submittedAt)}</div>
                        <div className="num mt-0.5 text-xs text-slate-500">{minutes} хв на іспит</div>
                      </td>

                      <td className="px-3 py-4 text-slate-600 group-hover:text-amber-400">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
