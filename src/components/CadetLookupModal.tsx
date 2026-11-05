import React, { useState } from 'react';
import { Search, UserCheck, CheckCircle2, XCircle, Clock, RotateCcw, X, History, ExternalLink } from 'lucide-react';
import { ExamResult } from '../types';
import { api } from '../services/api';

interface CadetLookupModalProps {
  onClose: () => void;
  onSelectResult: (resultId: string) => void;
}

export const CadetLookupModal: React.FC<CadetLookupModalProps> = ({
  onClose,
  onSelectResult,
}) => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<ExamResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const results = await api.searchCadetHistory(query.trim());
      setHistory(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4">
      <div className="max-w-2xl w-full p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">
              Пошук особової справи та історії іспитів кадета
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Введіть нікнейм, статік (#12904) або Discord ID..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors shrink-0"
          >
            {loading ? 'Пошук...' : 'Знайти'}
          </button>
        </form>

        {/* Results List */}
        <div className="overflow-y-auto flex-1 space-y-3 pr-1 text-xs">
          {!searched && (
            <div className="text-center py-12 text-slate-500 text-xs">
              Введіть статік або нікнейм кадета для перевірки попередніх спроб, результатів та права на перездачу.
            </div>
          )}

          {searched && history.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-xs">
              Жодного запису не знайдено для "{query}". Можливо, кадет ще не складав іспити.
            </div>
          )}

          {history.map((item) => {
            const isPassed = item.status === 'passed';
            const isFailed = item.status === 'failed';
            const isPending = item.status === 'pending_review';
            const isRetake = item.status === 'retake_allowed';

            return (
              <div
                key={item.id}
                onClick={() => {
                  onSelectResult(item.id);
                  onClose();
                }}
                className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer space-y-2 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-white text-sm group-hover:text-amber-400 transition-colors">
                      {item.testTitle}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Кадет: {item.cadetNickname} ({item.cadetStatic}) · Інструктор: {item.instructorName}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {isPassed && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Зараховано
                      </span>
                    )}
                    {isFailed && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                        Не зараховано
                      </span>
                    )}
                    {isPending && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        На перевірці
                      </span>
                    )}
                    {isRetake && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        Дозволено перездачу
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span className="tabular-nums">
                    Результат: <strong className="text-white">{item.totalScore}/{item.maxTotalScore} б. ({item.percentage}%)</strong>
                  </span>
                  <span>
                    Дата: {new Date(item.submittedAt).toLocaleDateString('uk-UA')}
                  </span>
                </div>

                {item.instructorDecision?.comment && (
                  <div className="text-[11px] text-slate-300 bg-slate-900 p-2 rounded border border-slate-800/80 italic">
                    «{item.instructorDecision.comment}»
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
