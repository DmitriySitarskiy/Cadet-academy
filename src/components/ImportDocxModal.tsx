import React, { useMemo, useState } from 'react';
import { FileUp, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Modal, Notice } from './ui';
import { api } from '../services/api';
import { TestConfig, Question, QuestionType } from '../types';

interface Item {
  key: number;
  title: string;
  type: QuestionType;
  options: string[];
  correct: number[];
  points: number;
}

const NEW_TEST = '__new__';
let seq = 1;

function problemOf(it: Item): string | null {
  if (!it.title.trim()) return 'Порожній текст питання';
  if (it.type === 'open') return null;
  const opts = it.options.map((o) => o.trim());
  if (opts.length < 2 || opts.some((o) => !o)) return 'Потрібно щонайменше два непорожні варіанти';
  if (it.type === 'single' && it.correct.length !== 1) return 'Оберіть правильну відповідь';
  if (it.type === 'multiple' && it.correct.length < 1) return 'Оберіть правильні відповіді';
  return null;
}

export const ImportDocxModal: React.FC<{
  tests: TestConfig[];
  defaultTestId?: string;
  onClose: () => void;
  onDone: () => void;
}> = ({ tests, defaultTestId, onClose, onDone }) => {
  const [target, setTarget] = useState<string>(tests.length ? defaultTestId || tests[0].id : NEW_TEST);
  const [newTitle, setNewTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const problems = useMemo(() => (items || []).map(problemOf), [items]);
  const problemCount = problems.filter(Boolean).length;

  const readFile = async () => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) return setError('Потрібен файл Word у форматі .docx (не .doc).');
    if (file.size > 5 * 1024 * 1024) return setError('Файл завеликий (макс. 5 МБ).');
    setBusy(true);
    setError(null);
    try {
      const res = await api.parseDocx(file);
      setWarnings(res.warnings);
      setItems(
        res.questions.map((q) => {
          const open = q.options.length === 0;
          const type: QuestionType = open ? 'open' : q.detectedCorrect.length > 1 ? 'multiple' : 'single';
          return { key: seq++, title: q.title, type, options: q.options, correct: q.detectedCorrect, points: 1 };
        })
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const patch = (key: number, p: Partial<Item>) => setItems((xs) => xs!.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const setType = (it: Item, type: QuestionType) => {
    let options = it.options;
    let correct = it.correct;
    if (type !== 'open' && options.length < 2) options = [...options, ...Array(2 - options.length).fill('')];
    if (type === 'single' && correct.length > 1) correct = [correct[0]];
    patch(it.key, { type, options, correct });
  };

  const toggleCorrect = (it: Item, idx: number) => {
    if (it.type === 'single') return patch(it.key, { correct: [idx] });
    patch(it.key, { correct: it.correct.includes(idx) ? it.correct.filter((c) => c !== idx) : [...it.correct, idx] });
  };

  const removeOption = (it: Item, idx: number) =>
    patch(it.key, {
      options: it.options.filter((_, i) => i !== idx),
      correct: it.correct.filter((c) => c !== idx).map((c) => (c > idx ? c - 1 : c)),
    });

  const save = async () => {
    if (!items) return;
    setBusy(true);
    setError(null);
    try {
      const stamp = Date.now();
      const existing = tests.find((t) => t.id === target);
      const category = existing?.category || 'Загальне';
      const qs: Question[] = items.map((it, i) => {
        const base = {
          id: `q_${stamp}_${i}_${Math.random().toString(36).slice(2, 5)}`,
          type: it.type,
          title: it.title.trim(),
          category,
          description: '',
          maxPoints: Math.max(1, Math.min(10, Math.round(it.points) || 1)),
          explanation: '',
        };
        if (it.type === 'open') return base;
        const options = it.options.map((o) => o.trim());
        return it.type === 'single'
          ? { ...base, options, correctOption: it.correct[0] }
          : { ...base, options, correctOptions: [...it.correct].sort((a, b) => a - b) };
      });

      if (existing) {
        await api.saveTest({ ...existing, questions: [...existing.questions, ...qs] });
      } else {
        await api.saveTest({
          id: `new_${stamp}`,
          title: newTitle.trim(),
          description: '',
          category,
          timeLimitMinutes: 15,
          passingScorePercent: 80,
          randomQuestionCount: Math.min(qs.length, 10) || 5,
          maxAttempts: 2,
          cooldownHours: 24,
          isActive: true,
          questions: qs,
        });
      }
      onDone();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  /* ───── Крок 1: вибір файлу ───── */
  if (!items) {
    return (
      <Modal
        wide
        title="Імпорт питань з Word"
        description="Завантажте файл .docx з питаннями. Правильні відповіді ви оберете на наступному кроці."
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
            <button className="btn btn-primary" onClick={readFile} disabled={!file || busy}>
              <FileUp className="h-4 w-4" />
              {busy ? 'Читання…' : 'Прочитати файл'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {error && <Notice kind="error">{error}</Notice>}
          <div className="rounded-xl border border-[#1b2740] bg-[#070d1a] p-4 text-sm leading-relaxed text-slate-300">
            <div className="mb-2 font-medium text-white">Як оформити документ</div>
            <pre className="whitespace-pre-wrap font-sans text-slate-300">{`1. Текст питання

1.1. Перший варіант
1.2. Другий варіант
1.3. Третій варіант

2. Наступне питання
2.1. Варіант
2.2. Варіант`}</pre>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-400">
              <li>Підійде й автоматична нумерація списком Word: питання на першому рівні, варіанти на другому.</li>
              <li>Питання без варіантів стане відкритим (його перевіряє інструктор).</li>
              <li>Якщо правильну відповідь виділити жирним, на наступному кроці вона вже буде обрана. Не обов'язково.</li>
            </ul>
          </div>

          <div>
            <label className="label" htmlFor="imp-file">Файл Word (.docx)</label>
            <input
              id="imp-file"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="field !p-2 file:mr-3 file:rounded-lg file:border-0 file:bg-[#18243d] file:px-3 file:py-1.5 file:text-slate-200"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="imp-target">Куди додати</label>
              <select id="imp-target" className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.questions.length} пит.)</option>)}
                <option value={NEW_TEST}>Створити новий іспит…</option>
              </select>
            </div>
            {target === NEW_TEST && (
              <div>
                <label className="label" htmlFor="imp-new">Назва нового іспиту</label>
                <input id="imp-new" className="field" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={100} />
              </div>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  /* ───── Крок 2: підтвердження та вибір правильних відповідей ───── */
  const visible = items.map((it, i) => ({ it, i })).filter(({ i }) => !onlyProblems || problems[i]);
  const canSave = items.length > 0 && problemCount === 0 && (target !== NEW_TEST || newTitle.trim().length > 0);

  return (
    <Modal
      wide
      title="Перевірте питання"
      description="Позначте правильні відповіді. Питання можна виправити або видалити. Після підтвердження вони потраплять у тест."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => setItems(null)} disabled={busy}>Назад</button>
          <button className="btn btn-primary" onClick={save} disabled={!canSave || busy}>
            {busy ? 'Збереження…' : `Додати ${items.length} питань`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        {warnings.length > 0 && (
          <Notice kind="warn">
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </Notice>
        )}
        {target === NEW_TEST && newTitle.trim().length === 0 && (
          <Notice kind="warn">Вкажіть назву нового іспиту (крок «Назад»).</Notice>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-slate-300">
            Питань: <span className="num font-semibold text-white">{items.length}</span>
            {' · '}
            потребують уваги: <span className={`num font-semibold ${problemCount ? 'text-amber-300' : 'text-emerald-400'}`}>{problemCount}</span>
          </div>
          <label className="flex items-center gap-2 text-slate-400">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
            лише що потребує уваги
          </label>
        </div>

        <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
          {visible.map(({ it, i }) => (
            <div key={it.key} className={`rounded-xl border p-4 ${problems[i] ? 'border-amber-400/40 bg-amber-400/[0.03]' : 'border-[#1b2740] bg-[#070d1a]'}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">Питання {i + 1}</div>
                <div className="flex items-center gap-2">
                  <select className="field !w-auto !py-1 text-xs" value={it.type} onChange={(e) => setType(it, e.target.value as QuestionType)} aria-label="Тип питання">
                    <option value="single">Одна правильна</option>
                    <option value="multiple">Кілька правильних</option>
                    <option value="open">Відкрите</option>
                  </select>
                  <button className="btn btn-ghost !p-1.5" onClick={() => setItems((xs) => xs!.filter((x) => x.key !== it.key))} aria-label="Видалити питання">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <textarea className="field" rows={2} value={it.title} onChange={(e) => patch(it.key, { title: e.target.value })} aria-label="Текст питання" />

              {it.type !== 'open' && (
                <div className="mt-3 space-y-2">
                  {it.options.map((o, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type={it.type === 'single' ? 'radio' : 'checkbox'}
                        name={`correct-${it.key}`}
                        checked={it.correct.includes(idx)}
                        onChange={() => toggleCorrect(it, idx)}
                        className="h-4 w-4 shrink-0 accent-emerald-500"
                        aria-label={`Варіант ${idx + 1} правильний`}
                      />
                      <input
                        className={`field !py-1.5 ${it.correct.includes(idx) ? '!border-emerald-500/50' : ''}`}
                        value={o}
                        onChange={(e) => patch(it.key, { options: it.options.map((x, j) => (j === idx ? e.target.value : x)) })}
                        aria-label={`Варіант ${idx + 1}`}
                      />
                      <button className="btn btn-ghost !p-1.5" onClick={() => removeOption(it, idx)} disabled={it.options.length <= 2} aria-label="Видалити варіант">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button className="btn btn-ghost !py-1 text-xs" onClick={() => patch(it.key, { options: [...it.options, ''] })} disabled={it.options.length >= 8}>
                    <Plus className="h-3.5 w-3.5" />
                    Додати варіант
                  </button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {problems[i] ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {problems[i]}
                  </div>
                ) : <span />}
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Балів
                  <input type="number" min={1} max={10} className="field !w-16 !py-1 num" value={it.points} onChange={(e) => patch(it.key, { points: Number(e.target.value) })} />
                </label>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="py-8 text-center text-sm text-slate-500">Питань не залишилось. Натисніть «Назад» і виберіть інший файл.</div>}
        </div>
      </div>
    </Modal>
  );
};
