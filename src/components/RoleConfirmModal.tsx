import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  X,
  Lock,
  ArrowRight,
  Clock,
} from 'lucide-react';

interface RoleConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmationCode: string, reason: string) => Promise<void>;
  diffData: {
    leaderTitle: { old: string; next: string };
    instructorTitle: { old: string; next: string };
    cadetTitle: { old: string; next: string };
    discordGuildId: { old: string; next: string };
    leaderRoleId: { old: string; next: string };
    instructorRoleId: { old: string; next: string };
  };
}

export const RoleConfirmModal: React.FC<RoleConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  diffData,
}) => {
  const [confirmationInput, setConfirmationInput] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3-second safety cooldown timer to prevent accidental double-clicks
  const [cooldownRemaining, setCooldownRemaining] = useState(3);

  useEffect(() => {
    if (!isOpen) {
      setConfirmationInput('');
      setReason('');
      setError(null);
      setCooldownRemaining(3);
      return;
    }

    setCooldownRemaining(3);
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const hasLeaderTitleChange = diffData.leaderTitle.old !== diffData.leaderTitle.next;
  const hasInstructorTitleChange = diffData.instructorTitle.old !== diffData.instructorTitle.next;
  const hasCadetTitleChange = diffData.cadetTitle.old !== diffData.cadetTitle.next;
  const hasLeaderRoleChange = diffData.leaderRoleId.old !== diffData.leaderRoleId.next;
  const hasInstructorRoleChange = diffData.instructorRoleId.old !== diffData.instructorRoleId.next;
  const hasGuildChange = diffData.discordGuildId.old !== diffData.discordGuildId.next;

  const isCodeValid =
    confirmationInput.trim().toUpperCase() === 'ПІДТВЕРДЖУЮ' ||
    confirmationInput.trim() === '7777';

  const canSubmit = isCodeValid && cooldownRemaining === 0 && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(confirmationInput.trim(), reason.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Помилка підтвердження зміни ролей');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-2xl w-full my-8 bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border-b border-amber-500/20 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Захищений режим
                </span>
                <span className="text-xs text-slate-400 font-mono">2-Step Safety Lock</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Підтвердження зміни структури ролей фракції
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-slate-200 overflow-y-auto max-h-[75vh]">
          {/* Warning Banner */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1.5">
            <div className="font-bold flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Увага: Перейменування ролей змінює повноваження та Discord-авторизацію</span>
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              Зміна назви або Discord Role ID змінить відображення посад на всьому порталі та правила
              авторизації через Discord. Будь ласка, уважно перевірте відмінності перед застосуванням.
            </p>
          </div>

          {/* Diff Viewer */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Порівняння змін (Diff Review):
            </div>

            <div className="space-y-2 text-xs">
              {/* Leader Title */}
              <div
                className={`p-3 rounded-xl border ${
                  hasLeaderTitleChange
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>👑 Посада Лідера (leader):</span>
                  {hasLeaderTitleChange && (
                    <span className="text-[10px] text-amber-400 font-mono uppercase">Змінюється</span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="line-through text-slate-400">{diffData.leaderTitle.old}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-bold text-white">{diffData.leaderTitle.next}</span>
                </div>
              </div>

              {/* Instructor Title */}
              <div
                className={`p-3 rounded-xl border ${
                  hasInstructorTitleChange
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>🎓 Посада Інструктора (instructor):</span>
                  {hasInstructorTitleChange && (
                    <span className="text-[10px] text-amber-400 font-mono uppercase">Змінюється</span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="line-through text-slate-400">{diffData.instructorTitle.old}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-bold text-white">{diffData.instructorTitle.next}</span>
                </div>
              </div>

              {/* Cadet Title */}
              <div
                className={`p-3 rounded-xl border ${
                  hasCadetTitleChange
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>🔰 Посада Кадета (cadet):</span>
                  {hasCadetTitleChange && (
                    <span className="text-[10px] text-amber-400 font-mono uppercase">Змінюється</span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="line-through text-slate-400">{diffData.cadetTitle.old}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-bold text-white">{diffData.cadetTitle.next}</span>
                </div>
              </div>

              {/* Discord Role IDs */}
              {(hasLeaderRoleChange || hasInstructorRoleChange || hasGuildChange) && (
                <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/30 space-y-1.5 font-mono text-[11px]">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <span>Прив'язка Discord Ролей:</span>
                  </div>
                  {hasLeaderRoleChange && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">ID ролі Лідера:</span>
                      <span className="line-through text-slate-500">{diffData.leaderRoleId.old || 'не вказано'}</span>
                      <ArrowRight className="w-3 h-3 text-indigo-400" />
                      <span className="text-indigo-300 font-bold">{diffData.leaderRoleId.next || 'скинуто'}</span>
                    </div>
                  )}
                  {hasInstructorRoleChange && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">ID ролі Інструктора:</span>
                      <span className="line-through text-slate-500">{diffData.instructorRoleId.old || 'не вказано'}</span>
                      <ArrowRight className="w-3 h-3 text-indigo-400" />
                      <span className="text-indigo-300 font-bold">{diffData.instructorRoleId.next || 'скинуто'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label className="label">
              Причина перейменування / коментар аудиту (опціонально):
            </label>
            <input
              type="text"
              placeholder="напр. Реорганізація Академії Нацполіції, наказ №42"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="field"
            />
          </div>

          {/* Type to Confirm Section */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Введіть підтвердження:</span>
                </label>
                <span className="text-[10px] text-amber-400 font-mono">
                  Надрукуйте <strong>ПІДТВЕРДЖУЮ</strong>
                </span>
              </div>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder='Введіть "ПІДТВЕРДЖУЮ"'
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-amber-300 focus:outline-none focus:border-amber-500 placeholder-slate-600"
                autoFocus
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            {cooldownRemaining > 0 ? (
              <span className="text-amber-400 font-mono flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                Ознайомлення: {cooldownRemaining}с
              </span>
            ) : isCodeValid ? (
              <span className="text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Код вірний, готово
              </span>
            ) : (
              <span>Введіть "ПІДТВЕРДЖУЮ" для розблокування</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Скасувати
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canSubmit}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg ${
                canSubmit
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-500/20 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Застосування...'
                  : cooldownRemaining > 0
                  ? `Зачекайте (${cooldownRemaining}с)`
                  : 'Підтвердити та застосувати'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
