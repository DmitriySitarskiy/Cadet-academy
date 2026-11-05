import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Maximize2,
  Lock,
  Send,
  ArrowRight,
  Info
} from 'lucide-react';
import { AntiCheatEvent } from '../types';
import { api } from '../services/api';

interface ExamTakerProps {
  token: string;
  onExit: () => void;
}

interface QuestionClient {
  id: string;
  type: 'single' | 'multiple' | 'open';
  title: string;
  description?: string;
  category: string;
  options?: string[];
  maxPoints: number;
}

interface ExamData {
  token: string;
  testTitle: string;
  testDescription: string;
  timeLimitMinutes: number;
  passingScorePercent: number;
  cadetNickname: string;
  cadetStatic: string;
  cadetDiscord: string;
  startedAt: string;
  serverNow: string;
  questions: QuestionClient[];
}

export const ExamTaker: React.FC<ExamTakerProps> = ({ token, onExit }) => {
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Flow states: 'confirm' | 'taking' | 'completed'
  const [flowState, setFlowState] = useState<'confirm' | 'taking' | 'completed'>('confirm');

  // Answers state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Record<
      string,
      { selectedOption?: number; selectedOptions?: number[]; textAnswer?: string }
    >
  >({});

  // Anti-cheat state
  const [antiCheatEvents, setAntiCheatEvents] = useState<AntiCheatEvent[]>([]);
  const [lastWarning, setLastWarning] = useState<string | null>(null);
  const [warningTimeout, setWarningTimeout] = useState<any>(null);

  // Timer state
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);

  // Keep ref for auto-submit when timer expires
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const antiCheatRef = useRef(antiCheatEvents);
  antiCheatRef.current = antiCheatEvents;
  const startTimeRef = useRef<number>(Date.now());

  // Record an anti-cheat event
  const logAntiCheat = useCallback((type: AntiCheatEvent['type'], details: string) => {
    const newEvent: AntiCheatEvent = {
      type,
      timestamp: new Date().toISOString(),
      details,
    };
    setAntiCheatEvents((prev) => [...prev, newEvent]);

    // Show warning banner
    let warnMsg = '⚠️ Зафіксовано порушення регламенту тестування!';
    if (type === 'tab_switch' || type === 'blur') {
      warnMsg = '⚠️ Зафіксовано вихід зі вкладки або згортання браузера! Подія записана у протокол для інструктора.';
    } else if (type === 'fullscreen_exit') {
      warnMsg = '⚠️ Зафіксовано вихід із повноекранного режиму!';
    } else if (type === 'copy_paste') {
      warnMsg = '⚠️ Спроба копіювання або вставки тексту заборонена і записана в протокол!';
    }

    setLastWarning(warnMsg);
    if (warningTimeout) clearTimeout(warningTimeout);
    const t = setTimeout(() => setLastWarning(null), 5000);
    setWarningTimeout(t);
  }, [warningTimeout]);

  // Load exam
  useEffect(() => {
    const fetchExam = async () => {
      try {
        setLoading(true);
        const data = await api.getExamByToken(token);
        setExamData(data);
        const durationSec = data.timeLimitMinutes * 60;
        setTimeLeftSeconds(durationSec);
      } catch (err: any) {
        setError(err.message || 'Не вдалося завантажити іспит');
      } finally {
        setLoading(false);
      }
    };
    fetchExam();
  }, [token]);

  // Anti-cheat event listeners while taking exam
  useEffect(() => {
    if (flowState !== 'taking') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logAntiCheat('tab_switch', 'Перемикання на іншу вкладку браузера');
      }
    };

    const handleWindowBlur = () => {
      logAntiCheat('blur', 'Втрата фокусу вікна (можливе використання сторонніх програм)');
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logAntiCheat('fullscreen_exit', 'Вихід з повноекранного режиму під час тесту');
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logAntiCheat('copy_paste', 'Спроба копіювання тексту питання в буфер');
    };

    const handlePaste = (e: ClipboardEvent) => {
      // Allow paste in open answer only if not suspicious, or log it
      logAntiCheat('copy_paste', 'Вставка тексту з буфера обміну');
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logAntiCheat('devtools', 'Спроба виклику контекстного меню (ПКМ)');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [flowState, logAntiCheat]);

  // Countdown timer
  useEffect(() => {
    if (flowState !== 'taking') return;

    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto submit
          handleFinalSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [flowState]);

  // Enter Fullscreen and start
  const handleStartExam = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {
      // Ignore fullscreen denial in some restricted iframes
    }
    startTimeRef.current = Date.now();
    setFlowState('taking');
  };

  // Answer handler
  const handleSelectSingleOption = (qid: string, optionIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [qid]: {
        ...prev[qid],
        selectedOption: optionIndex,
      },
    }));
  };

  const handleToggleMultipleOption = (qid: string, optionIndex: number) => {
    const current = answers[qid]?.selectedOptions || [];
    const next = current.includes(optionIndex)
      ? current.filter((i) => i !== optionIndex)
      : [...current, optionIndex];

    setAnswers((prev) => ({
      ...prev,
      [qid]: {
        ...prev[qid],
        selectedOptions: next,
      },
    }));
  };

  const handleOpenTextChange = (qid: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qid]: {
        ...prev[qid],
        textAnswer: text,
      },
    }));
  };

  // Next question
  const handleNext = () => {
    if (!examData) return;
    if (currentIndex < examData.questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      handleFinalSubmit(false);
    }
  };

  // Final Submit
  const handleFinalSubmit = async (isAutoTimeout = false) => {
    if (submitting) return;
    setSubmitting(true);

    if (isAutoTimeout) {
      logAntiCheat('blur', 'Час тестування вичерпано. Робота збережена автоматично.');
    }

    try {
      const timeSpentSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

      const formattedAnswers = Object.entries(answersRef.current).map(([qid, val]) => ({
        questionId: qid,
        selectedOption: val.selectedOption,
        selectedOptions: val.selectedOptions,
        textAnswer: val.textAnswer,
      }));

      // Ensure all questions are present
      examData?.questions.forEach((q) => {
        if (!formattedAnswers.find((a) => a.questionId === q.id)) {
          formattedAnswers.push({
            questionId: q.id,
            selectedOption: undefined,
            selectedOptions: undefined,
            textAnswer: '',
          });
        }
      });

      const res = await api.submitExam(token, {
        answers: formattedAnswers,
        antiCheatEvents: antiCheatRef.current,
        timeSpentSeconds,
      });

      setSubmissionResult(res);
      setFlowState('completed');

      // Exit fullscreen if active
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Помилка надсилання відповідей');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-medium text-slate-300">Завантаження безпечного сеансу іспиту...</div>
        </div>
      </div>
    );
  }

  if (error || !examData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Доступ заборонено або вичерпано</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error || 'Посилання недійсне, прострочене або тест уже було складено раніше.'}
          </p>
          <button
            onClick={onExit}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
          >
            Повернутися до Академії
          </button>
        </div>
      </div>
    );
  }

  // ==================== SCREEN 1: CONFIRMATION ====================
  if (flowState === 'confirm') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-800">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <span className="text-xs text-amber-400 font-semibold uppercase tracking-wider block">
                Академія Кадетів • Офіційний екзаменаційний бланк
              </span>
              <h1 className="text-xl font-bold text-white">{examData.testTitle}</h1>
            </div>
          </div>

          {/* Cadet Credentials Confirmation */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Підтвердження особи кадета
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <span className="text-[11px] text-slate-500 block">Нікнейм</span>
                <span className="text-sm font-bold text-white">{examData.cadetNickname}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Статік (ID)</span>
                <span className="text-sm font-bold text-amber-400 font-mono">{examData.cadetStatic}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Discord</span>
                <span className="text-sm font-mono text-slate-300">
                  {examData.cadetDiscord ? `@${examData.cadetDiscord}` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Exam Specs */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800">
              <Clock className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <div className="text-base font-bold text-white tabular-nums">{examData.timeLimitMinutes} хв</div>
              <div className="text-[10px] text-slate-400">Час на іспит</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800">
              <HelpCircle className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-base font-bold text-white tabular-nums">{examData.questions.length}</div>
              <div className="text-[10px] text-slate-400">Кількість питань</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-base font-bold text-white tabular-nums">{examData.passingScorePercent}%</div>
              <div className="text-[10px] text-slate-400">Прохідний бал</div>
            </div>
          </div>

          {/* Anti-cheat & Security Rules */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
            <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Правила проходження та система антисписування
            </div>
            <ul className="text-xs text-amber-200/90 space-y-1.5 list-disc list-inside">
              <li>
                <strong>Питання показуються по одному</strong>, повернення до попередніх питань неможливе.
              </li>
              <li>
                <strong>Контроль фокусу:</strong> вихід зі вкладки або згортання браузера фіксується у протоколі.
              </li>
              <li>
                <strong>Повноекранний режим:</strong> іспит проводиться у повноекранному режимі. Вихід фіксується.
              </li>
              <li>
                <strong>Одноразове посилання:</strong> повторний вхід або оновлення сторінки призведе до анулювання спроби.
              </li>
            </ul>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={onExit}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
            >
              Скасувати
            </button>
            <button
              onClick={handleStartExam}
              className="w-full sm:flex-1 py-3 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              <Maximize2 className="w-4 h-4" />
              Підтверджую дані — Розпочати іспит
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== SCREEN 3: COMPLETED ====================
  if (flowState === 'completed' && submissionResult) {
    const isSuccess = submissionResult.status === 'passed';
    const isPending = submissionResult.status === 'pending_review';

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-xl w-full p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-center space-y-6">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${
              isSuccess
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : isPending
                ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 className="w-10 h-10" />
            ) : isPending ? (
              <Clock className="w-10 h-10" />
            ) : (
              <XCircle className="w-10 h-10" />
            )}
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
              {examData.testTitle}
            </span>
            <h1 className="text-2xl font-bold text-white">
              {isSuccess
                ? 'Іспит успішно складено!'
                : isPending
                ? 'Роботу відправлено на перевірку інструкторам'
                : 'Іспит не складено'}
            </h1>
          </div>

          <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 grid grid-cols-2 gap-4 text-left">
            <div>
              <span className="text-xs text-slate-500 block">Кадет:</span>
              <span className="text-sm font-semibold text-white">
                {examData.cadetNickname} ({examData.cadetStatic})
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Автоматичні бали:</span>
              <span className="text-sm font-bold text-amber-400 tabular-nums">
                {submissionResult.autoScore} / {submissionResult.maxAutoScore} б. ({submissionResult.percentage}%)
              </span>
            </div>
            <div className="col-span-2 pt-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-500 block">Статус у системі:</span>
              <span
                className={`text-sm font-bold ${
                  isSuccess ? 'text-emerald-400' : isPending ? 'text-blue-400' : 'text-red-400'
                }`}
              >
                {isSuccess
                  ? 'Зараховано (Автоматично)'
                  : isPending
                  ? 'Очікує ручної перевірки відкритих ситуаційних кейсів інструктором'
                  : 'Не зараховано (Нижче прохідного балу)'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-xs text-slate-400 text-left space-y-2">
            <div className="flex items-center gap-2 font-medium text-slate-300">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              Що відбувається далі?
            </div>
            <p>
              1. Повний звіт з розшифровкою відповідей автоматично надіслано в Forum-канал інструкторів у Discord.
            </p>
            <p>
              2. Інструктор перевірить ваші відповіді на ситуаційні кейси та винесе остаточний вердикт: «Зараховано», «Не зараховано» або «Дозволити перездачу».
            </p>
            <p>
              3. Сповіщення надійде у вашу Discord-гілку.
            </p>
          </div>

          <button
            onClick={onExit}
            className="w-full py-3 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors"
          >
            Повернутися на головну
          </button>
        </div>
      </div>
    );
  }

  // ==================== SCREEN 2: TAKING THE EXAM ====================
  const currentQ = examData.questions[currentIndex];
  const totalQuestions = examData.questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const minutes = Math.floor(timeLeftSeconds / 60);
  const seconds = timeLeftSeconds % 60;
  const isTimeCritical = timeLeftSeconds < 120; // Under 2 mins

  const currentAnswer = answers[currentQ.id] || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      {/* Warning Toast if Anti-Cheat Triggered */}
      {lastWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full px-4 animate-in slide-in-from-top-4 duration-300">
          <div className="p-3.5 rounded-xl bg-red-500/90 text-white text-xs font-semibold shadow-2xl flex items-center gap-3 backdrop-blur border border-red-400/50">
            <AlertTriangle className="w-5 h-5 shrink-0 animate-bounce" />
            <div>{lastWarning}</div>
          </div>
        </div>
      )}

      {/* Top HUD */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 px-4 sm:px-8 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-md">
                {examData.testTitle}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                Кадет: {examData.cadetNickname} ({examData.cadetStatic})
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Anti-cheat active badge */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              <Lock className="w-3 h-3" />
              Античит активний
            </div>

            {/* Timer HUD */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border tabular-nums font-mono font-bold text-sm ${
                isTimeCritical
                  ? 'bg-red-500/10 border-red-500/40 text-red-400 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-amber-400'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Line */}
      <div className="w-full bg-slate-900 h-1.5">
        <div
          className="bg-amber-400 h-1.5 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Main Question Viewport */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Question Index & Category */}
          <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-3">
            <span className="font-semibold text-amber-400 tracking-wide uppercase">
              {currentQ.category || 'Загальне запитання'}
            </span>
            <span className="font-mono">
              Питання <strong className="text-white">{currentIndex + 1}</strong> з {totalQuestions}
            </span>
          </div>

          {/* Question Title & Prompt */}
          <div className="space-y-2">
            <h2 className="text-lg sm:text-xl font-bold text-white leading-relaxed">
              {currentQ.title}
            </h2>
            {currentQ.description && (
              <p className="text-sm text-slate-300 leading-relaxed p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
                {currentQ.description}
              </p>
            )}
          </div>

          {/* Question Type Hint */}
          <div className="text-[11px] text-slate-500 italic">
            {currentQ.type === 'single' && 'Оберіть одну правильну відповідь:'}
            {currentQ.type === 'multiple' && 'Оберіть усі правильні відповіді (може бути кілька):'}
            {currentQ.type === 'open' && 'Розгорнута відповідь (оцінюється інструктором вручну):'}
          </div>

          {/* Options: Single Choice */}
          {currentQ.type === 'single' && currentQ.options && (
            <div className="space-y-3">
              {currentQ.options.map((optText, optIdx) => {
                const isSelected = currentAnswer.selectedOption === optIdx;
                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectSingleOption(currentQ.id, optIdx)}
                    className={`w-full text-left p-4 rounded-xl border text-sm transition-all flex items-start gap-3.5 ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 text-white font-medium shadow-sm shadow-amber-500/10'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-600'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-slate-950" />}
                    </div>
                    <span className="leading-snug">{optText}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Options: Multiple Choice */}
          {currentQ.type === 'multiple' && currentQ.options && (
            <div className="space-y-3">
              {currentQ.options.map((optText, optIdx) => {
                const isChecked = (currentAnswer.selectedOptions || []).includes(optIdx);
                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleToggleMultipleOption(currentQ.id, optIdx)}
                    className={`w-full text-left p-4 rounded-xl border text-sm transition-all flex items-start gap-3.5 ${
                      isChecked
                        ? 'bg-amber-500/10 border-amber-500 text-white font-medium shadow-sm shadow-amber-500/10'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                        isChecked ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-600'
                      }`}
                    >
                      {isChecked && <CheckCircle2 className="w-4 h-4 text-slate-950 stroke-[3]" />}
                    </div>
                    <span className="leading-snug">{optText}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Options: Open Situational Case */}
          {currentQ.type === 'open' && (
            <div className="space-y-2">
              <textarea
                rows={6}
                value={currentAnswer.textAnswer || ''}
                onChange={(e) => handleOpenTextChange(currentQ.id, e.target.value)}
                placeholder="Опишіть ваші покрокові дії, команди в гучномовець, радіодоповіді та застосування відповідної стадії сили..."
                className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors resize-y leading-relaxed"
              />
              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>Символів: {(currentAnswer.textAnswer || '').length}</span>
                <span>Макс. балів за кейс: {currentQ.maxPoints}</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Control: Strictly Forward Only! */}
        <div className="pt-8 border-t border-slate-800/80 flex items-center justify-between gap-4 mt-8">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            Повернення назад заборонено регламентом
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleNext}
            className="py-3 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 disabled:opacity-50"
          >
            {isLastQuestion ? (
              <>
                <Send className="w-4 h-4" />
                {submitting ? 'Надсилання...' : 'Завершити іспит'}
              </>
            ) : (
              <>
                <span>Наступне питання</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
};
