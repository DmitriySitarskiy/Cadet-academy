import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Send,
  RotateCcw,
  MessageSquare,
  FileText,
  AlertTriangle,
  Award,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { ExamResult } from '../types';
import { api } from '../services/api';

interface ResultReviewModalProps {
  resultId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export const ResultReviewModal: React.FC<ResultReviewModalProps> = ({
  resultId,
  onClose,
  onUpdated,
}) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Open questions manual grades state: { [qid]: { score: number, comment: string } }
  const [openGrades, setOpenGrades] = useState<Record<string, { score: number; comment: string }>>({});
  const [savingGrades, setSavingGrades] = useState(false);

  // Verdict state
  const [decision, setDecision] = useState<'passed' | 'failed' | 'retake_allowed'>('passed');
  const [decisionComment, setDecisionComment] = useState('');
  const [discordThreadId, setDiscordThreadId] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [discordNotice, setDiscordNotice] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getResultDetail(resultId);
      setData(res);
      setDiscordThreadId(res.discordThreadId || '');

      // Pre-fill open grades
      const initialGrades: Record<string, { score: number; comment: string }> = {};
      res.answers.forEach((a: any) => {
        if (a.type === 'open') {
          initialGrades[a.questionId] = {
            score: a.manualScore || 0,
            comment: a.instructorComment || '',
          };
        }
      });
      setOpenGrades(initialGrades);

      if (res.instructorDecision) {
        setDecision(res.instructorDecision.decision);
        setDecisionComment(res.instructorDecision.comment || '');
      } else {
        // Auto default decision based on score
        setDecision(res.percentage >= (res.test?.passingScorePercent || 80) ? 'passed' : 'failed');
      }
    } catch (err: any) {
      setError(err.message || 'Не вдалося завантажити результат');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [resultId]);

  const handleGradeChange = (qid: string, score: number) => {
    setOpenGrades((prev) => ({
      ...prev,
      [qid]: {
        ...prev[qid],
        score,
      },
    }));
  };

  const handleCommentChange = (qid: string, comment: string) => {
    setOpenGrades((prev) => ({
      ...prev,
      [qid]: {
        ...prev[qid],
        comment,
      },
    }));
  };

  const handleSaveOpenGrades = async () => {
    setSavingGrades(true);
    try {
      const gradesPayload = Object.entries(openGrades).map(([qid, val]) => ({
        questionId: qid,
        manualScore: val.score,
        instructorComment: val.comment,
      }));

      const res = await api.gradeOpenQuestions(resultId, gradesPayload);
      setData((prev: any) => ({
        ...prev,
        ...res.result,
      }));
      setDiscordNotice('Оцінки за відкриті запитання збережено!');
      setTimeout(() => setDiscordNotice(null), 3000);
      onUpdated();
    } catch (err: any) {
      alert(err.message || 'Помилка збереження оцінок');
    } finally {
      setSavingGrades(false);
    }
  };

  const handleSubmitDecision = async () => {
    setSubmittingDecision(true);
    try {
      const res = await api.submitDecision(resultId, decision, decisionComment, discordThreadId.trim());
      if (res.discordSent === false && res.discordError) {
        setDiscordNotice(`Вердикт збережено, але виникла помилка в Discord: ${res.discordError}`);
        setTimeout(() => {
          onUpdated();
        }, 3000);
      } else {
        setDiscordNotice('Вердикт винесено та успішно надіслано в Discord гілку кадета!');
        setTimeout(() => {
          onUpdated();
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      alert(err.message || 'Помилка публікації вердикту');
    } finally {
      setSubmittingDecision(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4">
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm text-slate-300">Завантаження картки іспиту...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <XCircle className="w-10 h-10 text-red-400 mx-auto" />
          <div className="text-sm text-white font-medium">{error || 'Результат не знайдено'}</div>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl bg-slate-800 text-xs text-white"
          >
            Закрити
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.floor(data.timeSpentSeconds / 60);
  const seconds = data.timeSpentSeconds % 60;
  const closedAnswers = data.answers.filter((a: any) => a.type !== 'open');
  const openAnswers = data.answers.filter((a: any) => a.type === 'open');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-4xl w-full my-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-slate-950 border-b border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Картка перевірки іспиту
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400 font-mono">ID: {data.id}</span>
            </div>
            <h2 className="text-xl font-bold text-white">{data.testTitle}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 mt-2 font-mono">
              <span>
                Кадет: <strong className="text-white">{data.cadetNickname}</strong> ({data.cadetStatic})
              </span>
              <span>Discord: {data.cadetDiscord ? `<@${data.cadetDiscord}>` : 'не вказано'}</span>
              <span>
                Час: {minutes} хв {seconds} с
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {discordNotice && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{discordNotice}</span>
            </div>
          )}

          {/* Score Summary Box */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-medium">Закриті тести</div>
              <div className="text-lg font-bold text-white tabular-nums mt-0.5">
                {data.autoScore} / {data.maxAutoScore} б.
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-medium">Відкриті кейси</div>
              <div className="text-lg font-bold text-amber-400 tabular-nums mt-0.5">
                {data.manualScore} / {data.maxManualScore} б.
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-medium">Загальний бал</div>
              <div className="text-lg font-bold text-emerald-400 tabular-nums mt-0.5">
                {data.totalScore} / {data.maxTotalScore} б.
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-medium">Відсоток</div>
              <div className="text-lg font-bold text-white tabular-nums mt-0.5">
                {data.percentage}% (Поріг: {data.test?.passingScorePercent || 80}%)
              </div>
            </div>
          </div>

          {/* Anti-cheat audit box */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                <ShieldAlert className="w-4 h-4" />
                Протокол антисписування
              </span>
              <span className="text-xs text-slate-400">
                Зафіксовано подій: <strong>{data.antiCheatEvents.length}</strong>
              </span>
            </div>

            {data.antiCheatEvents.length === 0 ? (
              <div className="text-xs text-emerald-400 flex items-center gap-1.5 pt-1">
                <CheckCircle2 className="w-4 h-4" />
                Порушень регламенту не виявлено. Кадет не залишав вкладку та складав іспит чесно.
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {data.antiCheatEvents.map((event: any, i: number) => {
                  const evTime = new Date(event.timestamp).toLocaleTimeString('uk-UA');
                  return (
                    <div
                      key={i}
                      className="text-xs p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 text-red-300 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <span>{event.details}</span>
                      </div>
                      <span className="font-mono text-[10px] text-red-400 shrink-0">{evTime}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 1: Closed Questions Breakdown */}
          {closedAnswers.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  Автоматично перевірені тести ({closedAnswers.length} питань)
                </h3>
                <span className="text-xs text-slate-400">
                  {closedAnswers.filter((a: any) => a.isCorrect).length} з {closedAnswers.length} правильно
                </span>
              </div>

              <div className="space-y-3">
                {closedAnswers.map((ans: any, idx: number) => {
                  const isCorrect = ans.isCorrect;
                  return (
                    <div
                      key={ans.questionId}
                      className={`p-4 rounded-xl border text-xs space-y-3 transition-colors ${isCorrect
                          ? 'bg-slate-950/60 border-emerald-500/30'
                          : 'bg-slate-950/60 border-red-500/30'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-white text-sm">
                          {idx + 1}. {ans.title}
                        </div>
                        <div className="shrink-0">
                          {ans.autoScore > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              +{ans.autoScore} б. {isCorrect ? '(Правильно)' : '(Частково)'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                              0 б. (Помилка)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Options breakdown */}
                      {ans.options && (
                        <div className="space-y-1.5 pl-2 border-l-2 border-slate-800">
                          {ans.options.map((optText: string, oIdx: number) => {
                            const isSelected =
                              ans.type === 'single'
                                ? ans.selectedOption === oIdx
                                : (ans.selectedOptions || []).includes(oIdx);

                            const isTargetCorrect =
                              ans.type === 'single'
                                ? ans.correctOption === oIdx
                                : (ans.correctOptions || []).includes(oIdx);

                            let style = 'text-slate-400';
                            if (isSelected && isTargetCorrect) {
                              style = 'text-emerald-300 font-semibold';
                            } else if (isSelected && !isTargetCorrect) {
                              style = 'text-red-300 font-semibold line-through';
                            } else if (!isSelected && isTargetCorrect) {
                              style = 'text-emerald-400/90 underline';
                            }

                            return (
                              <div key={oIdx} className={`flex items-start gap-2 ${style}`}>
                                <span className="font-mono text-[10px]">
                                  {isSelected ? '👉' : '—'}
                                </span>
                                <span>{optText}</span>
                                {isTargetCorrect && (
                                  <span className="text-[10px] text-emerald-400 font-mono ml-auto">
                                    [Правильна відповідь]
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {ans.explanation && (
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 italic">
                          💡 Пояснення регламенту: {ans.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Open Situational Cases (Ручна перевірка) */}
          {openAnswers.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Відкриті ситуаційні кейси (Оцінює інструктор)
                </h3>
                <span className="text-xs text-slate-400">
                  Потребує виставлення балів за повноту дій
                </span>
              </div>

              <div className="space-y-4">
                {openAnswers.map((ans: any, idx: number) => {
                  const currentGrade = openGrades[ans.questionId] || {
                    score: ans.manualScore || 0,
                    comment: ans.instructorComment || '',
                  };

                  return (
                    <div
                      key={ans.questionId}
                      className="p-5 rounded-xl bg-slate-950 border border-amber-500/20 space-y-4"
                    >
                      <div>
                        <div className="text-xs font-bold text-white mb-1">
                          Кейс #{idx + 1}: {ans.title}
                        </div>
                        {ans.description && (
                          <div className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                            <strong>Ситуація:</strong> {ans.description}
                          </div>
                        )}
                      </div>

                      {/* Cadet Written Response */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          Відповідь кадета:
                        </label>
                        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                          {ans.textAnswer || '— Кадет залишив це поле порожнім —'}
                        </div>
                      </div>

                      {ans.explanation && (
                        <div className="text-[11px] text-slate-400 italic">
                          📌 Рекомендація інструктору: {ans.explanation}
                        </div>
                      )}

                      {/* Instructor Scoring Controls */}
                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                        <div>
                          <label className="block text-[11px] font-semibold text-amber-400 mb-1">
                            Оцінка за кейс (макс. {ans.maxPoints} б.):
                          </label>
                          <select
                            value={currentGrade.score}
                            onChange={(e) =>
                              handleGradeChange(ans.questionId, Number(e.target.value))
                            }
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-bold"
                          >
                            {Array.from({ length: ans.maxPoints + 1 }).map((_, pt) => (
                              <option key={pt} value={pt}>
                                {pt} {pt === 1 ? 'бал' : 'бали'} із {ans.maxPoints}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Коментар інструктора до цього кейсу:
                          </label>
                          <input
                            type="text"
                            placeholder="напр. Добре викликав 10-32, але забув вказати кобуру"
                            value={currentGrade.comment}
                            onChange={(e) => handleCommentChange(ans.questionId, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleSaveOpenGrades}
                  disabled={savingGrades}
                  className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Award className="w-4 h-4" />
                  {savingGrades ? 'Збереження...' : 'Зберегти оцінки відкритих кейсів'}
                </button>
              </div>
            </div>
          )}

          {/* Section 3: Final Instructor Verdict (Зараховано / Не зараховано / Перездача) */}
          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4 pt-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              Остаточний вердикт та публікація в Discord
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Оберіть рішення інструктора:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setDecision('passed')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${decision === 'passed'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Зараховано
                </button>

                <button
                  type="button"
                  onClick={() => setDecision('failed')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${decision === 'failed'
                      ? 'bg-red-500/20 border-red-500 text-red-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                >
                  <XCircle className="w-4 h-4" />
                  Не зараховано
                </button>

                <button
                  type="button"
                  onClick={() => setDecision('retake_allowed')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${decision === 'retake_allowed'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Дозволити перездачу
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  Гілка у Discord Forum (куди надсилати вердикт):
                </label>
                {discordThreadId ? (
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Прив'язано до гілки кадета
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-400 font-medium">
                    Вкажіть ID або посилання на гілку
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder="напр. 1303847582910293847 або https://discord.com/channels/.../..."
                value={discordThreadId}
                onChange={(e) => setDiscordThreadId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-amber-300 font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
              <div className="text-[10px] text-slate-500 mt-1">
                💡 Вердикт надійде відповіддю безпосередньо в цю гілку. Якщо поле порожнє, клікніть правою кнопкою на створену гілку кадета в Discord ➔ «Копіювати посилання» або «Копіювати ID» і вставте сюди.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Коментар інструктора (буде надіслано кадету в Discord гілку):
              </label>
              <textarea
                rows={3}
                placeholder="Вкажіть сильні та слабкі сторони, над чим попрацювати або причину перездачі..."
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400">
                Рішення миттєво опублікується в Discord Forum-канал інструкторів із тегом кадета.
              </span>

              <button
                type="button"
                onClick={handleSubmitDecision}
                disabled={submittingDecision}
                className="py-2.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" />
                {submittingDecision ? 'Надсилання...' : 'Опублікувати вердикт у Discord'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
