import React, { useEffect } from 'react';
import { Shield, X, CheckCircle2, AlertTriangle, Plus, Trash2 } from 'lucide-react';

/* ───────────── Спільні елементи інтерфейсу ───────────── */

// Знак академії. Щоб підставити власний герб, змініть лише цей компонент.
export const BrandMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div
    style={{ width: size, height: size }}
    className="rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0"
  >
    <Shield style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.25} />
  </div>
);

// Заголовок сторінки: що це за розділ, навіщо він, і головна дія справа
export const PageHeader: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      {description && (
        <p className="mt-1.5 text-sm text-slate-400 max-w-[62ch] leading-relaxed">{description}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

// Розділ налаштувань: зліва назва й пояснення, справа поля
export const SettingsSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="panel p-5 sm:p-6 grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
    <div>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-400 leading-relaxed">{description}</p>}
    </div>
    <div className="min-w-0">{children}</div>
  </section>
);

// Статуси робіт: колір береться з одного місця
export const RESULT_STATUS = {
  passed: { label: 'Зараховано', text: 'text-emerald-400', rail: 'bg-emerald-400', dot: 'bg-emerald-400' },
  failed: { label: 'Не зараховано', text: 'text-red-400', rail: 'bg-red-400', dot: 'bg-red-400' },
  pending_review: { label: 'На перевірці', text: 'text-amber-300', rail: 'bg-amber-400', dot: 'bg-amber-400' },
  retake_allowed: { label: 'Перездача', text: 'text-violet-300', rail: 'bg-violet-400', dot: 'bg-violet-400' },
} as const;

export type ResultStatusKey = keyof typeof RESULT_STATUS;

export const StatusLabel: React.FC<{ status: string }> = ({ status }) => {
  const meta = RESULT_STATUS[status as ResultStatusKey];
  if (!meta) return <span className="text-sm text-slate-400">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-medium ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

// Перемикач-фільтр із лічильниками
export const Segmented: React.FC<{
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
}> = ({ options, value, onChange }) => (
  <div
    role="tablist"
    className="inline-flex max-w-full overflow-x-auto rounded-xl border border-[#1b2740] bg-[#070d1a] p-1 gap-0.5"
  >
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(opt.value)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            active ? 'bg-[#18243d] text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className={`ml-1.5 num text-xs ${active ? 'text-amber-300' : 'text-slate-500'}`}>{opt.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

// Порожній стан: підказує, що робити далі
export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
}> = ({ icon, title, text, action }) => (
  <div className="flex flex-col items-center text-center py-14 px-6">
    <div className="w-11 h-11 rounded-xl bg-[#111b2e] border border-[#27355a] text-slate-400 flex items-center justify-center mb-4">
      {icon}
    </div>
    <div className="text-base font-semibold text-white">{title}</div>
    {text && <p className="mt-1 text-sm text-slate-400 max-w-[42ch] leading-relaxed">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export function pluralUa(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'щойно';
  if (minutes < 60) return `${minutes} хв тому`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн. тому`;
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

// Модальне вікно: закривається Esc і кліком по затемненню
export const Modal: React.FC<{
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ title, description, onClose, children, footer, wide }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`panel w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} shadow-2xl shadow-black/50`}>
        <div className="flex items-start justify-between gap-4 border-b border-[#1b2740] p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>}
          </div>
          <button onClick={onClose} className="btn btn-ghost !p-1.5" aria-label="Закрити">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#1b2740] p-4">{footer}</div>}
      </div>
    </div>
  );
};

// Повідомлення про результат дії
export const Notice: React.FC<{ kind: 'ok' | 'error' | 'warn'; children: React.ReactNode }> = ({ kind, children }) => {
  const style = {
    ok: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
    warn: 'border-amber-400/25 bg-amber-400/[0.06] text-amber-200',
  }[kind];
  const Icon = kind === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm ${style}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
};

// Редактор списку рядків (причини, цілі крафту)
export const ListEditor: React.FC<{
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
}> = ({ values, onChange, placeholder, max = 40 }) => (
  <div className="space-y-2">
    {values.map((v, i) => (
      <div key={i} className="flex gap-2">
        <input
          className="field"
          value={v}
          maxLength={120}
          onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          aria-label={`Пункт ${i + 1}`}
        />
        <button type="button" className="btn btn-ghost !px-2.5" onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label="Видалити">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    ))}
    {values.length < max && (
      <button type="button" className="btn btn-secondary" onClick={() => onChange([...values, ''])}>
        <Plus className="h-4 w-4" />
        {placeholder || 'Додати'}
      </button>
    )}
  </div>
);

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
