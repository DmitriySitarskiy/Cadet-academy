import React, { useState } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ShieldAlert,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { ExamResult, TestConfig } from '../types';

interface ResultsTableProps {
  results: ExamResult[];
  tests: TestConfig[];
  onSelectResult: (resultId: string) => void;
  onRefresh: () => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  results,
  tests,
  onSelectResult,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [testFilter, setTestFilter] = useState<string>('all');

  const filtered = results.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (testFilter !== 'all' && r.testId !== testFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.cadetNickname.toLowerCase().includes(q);
      const matchStatic = r.cadetStatic.toLowerCase().includes(q);
      const matchDiscord = r.cadetDiscord.toLowerCase().includes(q);
      const matchTest = r.testTitle.toLowerCase().includes(q);
      if (!matchName && !matchStatic && !matchDiscord && !matchTest) return false;
    }
    return true;
  });

  // KPI calculations
  const totalCount = results.length;
  const pendingCount = results.filter((r) => r.status === 'pending_review').length;
  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const retakeCount = results.filter((r) => r.status === 'retake_allowed').length;

  return (
    <div className="space-y-6">
      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Всього робіт</div>
          <div className="text-xl font-bold text-white tabular-nums mt-1">{totalCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/20 bg-amber-500/5">
          <div className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            На перевірці
          </div>
          <div className="text-xl font-bold text-amber-300 tabular-nums mt-1">{pendingCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/20 bg-emerald-500/5">
          <div className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Зараховано
          </div>
          <div className="text-xl font-bold text-emerald-300 tabular-nums mt-1">{passedCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-red-500/20 bg-red-500/5">
          <div className="text-xs text-red-400 font-medium flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Не зараховано
          </div>
          <div className="text-xl font-bold text-red-300 tabular-nums mt-1">{failedCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-purple-500/20 bg-purple-500/5 col-span-2 sm:col-span-1">
          <div className="text-xs text-purple-400 font-medium flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            Перездача
          </div>
          <div className="text-xl font-bold text-purple-300 tabular-nums mt-1">{retakeCount}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Пошук за нікнеймом, статіком (#14285) або тестом..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Test Selector */}
          <select
            value={testFilter}
            onChange={(e) => setTestFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Всі іспити</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Всі
            </button>
            <button
              onClick={() => setStatusFilter('pending_review')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'pending_review'
                  ? 'bg-amber-400/10 text-amber-300 border border-amber-400/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Перевірка ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('passed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'passed'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Зараховано
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'failed'
                  ? 'bg-red-500/10 text-red-300 border border-red-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Не зараховано
            </button>
          </div>

          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Оновити список"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table Data */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Кадет</th>
                <th className="py-3 px-4">Дисципліна</th>
                <th className="py-3 px-4 text-center">Результат</th>
                <th className="py-3 px-4">Антисписування</th>
                <th className="py-3 px-4">Час здачі</th>
                <th className="py-3 px-4">Статус</th>
                <th className="py-3 px-4 text-right">Дія</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Жодної роботи не знайдено за заданими фільтрами.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const minutes = Math.floor(item.timeSpentSeconds / 60);
                  const seconds = item.timeSpentSeconds % 60;
                  const dateStr = new Date(item.submittedAt).toLocaleString('uk-UA', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const violationsCount = item.antiCheatEvents.length;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => onSelectResult(item.id)}
                    >
                      {/* Cadet */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white group-hover:text-amber-400 transition-colors">
                          {item.cadetNickname}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Статік: {item.cadetStatic} · {item.cadetDiscord ? `@${item.cadetDiscord}` : 'Без Discord'}
                        </div>
                      </td>

                      {/* Test Title */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-200 line-clamp-1">{item.testTitle}</div>
                        <div className="text-[10px] text-slate-400">Інструктор: {item.instructorName}</div>
                      </td>

                      {/* Score */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-bold text-white tabular-nums text-sm">
                          {item.totalScore} / {item.maxTotalScore} б.
                        </div>
                        <div className="text-[10px] text-amber-400 font-mono">
                          {item.percentage}% {item.hasOpenQuestions && '(є відкриті)'}
                        </div>
                      </td>

                      {/* Anti-cheat */}
                      <td className="py-3.5 px-4">
                        {violationsCount === 0 ? (
                          <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Чисто (0)
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            {violationsCount} {violationsCount === 1 ? 'подія' : 'події'}
                          </span>
                        )}
                      </td>

                      {/* Submitted Time */}
                      <td className="py-3.5 px-4 text-slate-400 tabular-nums">
                        <div>{dateStr}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Час: {minutes}хв {seconds}с
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {item.status === 'passed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Зараховано
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="w-3 h-3" />
                            Не зараховано
                          </span>
                        )}
                        {item.status === 'pending_review' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            На перевірці
                          </span>
                        )}
                        {item.status === 'retake_allowed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <RotateCcw className="w-3 h-3" />
                            Дозволено перездачу
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectResult(item.id);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors inline-flex items-center gap-1"
                        >
                          <span>Перевірити</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
