import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2, Send, X, Package } from 'lucide-react';
import { PageHeader, Notice, EmptyState } from './ui';
import { api } from '../services/api';
import { PortalConfig, User } from '../types';

const OTHER = '__other__';
const SLOTS = [
  { key: 'before', title: 'До крафту', hint: 'Інвентар перед крафтом' },
  { key: 'tablet', title: 'Планшет з історією', hint: 'Історія крафту на планшеті' },
  { key: 'after', title: 'Після крафту', hint: 'Інвентар після крафту' },
] as const;
type ShotKey = (typeof SLOTS)[number]['key'];

// Стискаємо скріншот у браузері: менший трафік і швидша відправка
async function toJpeg(file: File, maxSide = 1920, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

interface Line { key: number; itemId: string; qty: number }
let lineSeq = 1;

interface Props {
  config: PortalConfig;
  currentUser: User | null;
  onOpenProfile: () => void;
}

export const CraftReportPage: React.FC<Props> = ({ config, currentUser, onOpenProfile }) => {
  const [lines, setLines] = useState<Line[]>([{ key: lineSeq++, itemId: '', qty: 1 }]);
  const [purposeSel, setPurposeSel] = useState('');
  const [purposeText, setPurposeText] = useState('');
  const [shots, setShots] = useState<Partial<Record<ShotKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const catalog = config.catalog.filter((i) => i.active);
  const total = lines.reduce((s, l) => s + (catalog.find((i) => i.id === l.itemId)?.cost || 0) * (l.qty || 0), 0);
  const purpose = purposeSel === OTHER ? purposeText.trim() : purposeSel;
  const linesOk = lines.length > 0 && lines.every((l) => l.itemId && Number.isInteger(l.qty) && l.qty >= 1);
  const valid = linesOk && purpose.length >= 2 && SLOTS.every((s) => shots[s.key]);

  const setShot = async (key: ShotKey, file: File | undefined | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const data = await toJpeg(file);
      setShots((s) => ({ ...s, [key]: data }));
    } catch {
      setNotice({ kind: 'error', text: 'Не вдалося прочитати зображення.' });
    }
  };

  // Ctrl+V заповнює перший вільний слот
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      const free = SLOTS.find((s) => !shotsRef.current[s.key]);
      if (free) {
        e.preventDefault();
        setShot(free.key, file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const submit = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.submitCraft({
        lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
        purpose,
        shots,
      });
      setNotice({ kind: 'ok', text: `Звіт надіслано в Discord. Матеріалів: ${res.totalCost}.` });
      setLines([{ key: lineSeq++, itemId: '', qty: 1 }]);
      setShots({});
      setPurposeSel('');
      setPurposeText('');
    } catch (e: any) {
      setNotice({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div>
      <PageHeader title="Звіт крафту" description="Оберіть, що ви скрафтили, додайте три скріншоти. Ваші дані підставляються автоматично." />
      {notice && <div className="mb-5"><Notice kind={notice.kind}>{notice.text}</Notice></div>}

      {catalog.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<Package className="h-5 w-5" />} title="Каталог крафту порожній" text="МТС ще не додало позиції. Зверніться до відповідального за склад." />
        </div>
      ) : (
        <div className="space-y-5">
          <section className="panel p-5 sm:p-6">
            <div className="mb-4 text-sm text-slate-400">
              Крафтить: <span className="font-medium text-slate-100">{currentUser?.name}</span>{' '}
              <button className="text-amber-300 underline-offset-2 hover:underline" onClick={onOpenProfile}>перевірити профіль</button>
            </div>
            <div className="label">Що крафтите</div>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="flex gap-2">
                  <select className="field" value={l.itemId} onChange={(e) => update(l.key, { itemId: e.target.value })} aria-label="Позиція">
                    <option value="">Оберіть позицію</option>
                    {catalog.map((i) => (
                      <option key={i.id} value={i.id} disabled={lines.some((x) => x.key !== l.key && x.itemId === i.id)}>
                        {i.name} ({i.cost} мат.)
                      </option>
                    ))}
                  </select>
                  <input
                    className="field !w-24 shrink-0 num" type="number" min={1} max={9999} value={l.qty} aria-label="Кількість"
                    onChange={(e) => update(l.key, { qty: Math.floor(Number(e.target.value)) })}
                  />
                  <button className="btn btn-ghost !px-2.5" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Прибрати рядок">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button className="btn btn-secondary" disabled={lines.length >= catalog.length} onClick={() => setLines((ls) => [...ls, { key: lineSeq++, itemId: '', qty: 1 }])}>
                <Plus className="h-4 w-4" />
                Додати позицію
              </button>
              <div className="text-sm text-slate-400">Потрібно матеріалів: <span className="num text-xl font-semibold text-amber-300">{total}</span></div>
            </div>

            <div className="mt-6 max-w-xl">
              <label className="label" htmlFor="c-purpose">Мета, для чого</label>
              <select id="c-purpose" className="field" value={purposeSel} onChange={(e) => setPurposeSel(e.target.value)}>
                <option value="">Оберіть мету</option>
                {config.purposes.map((p) => <option key={p} value={p}>{p}</option>)}
                <option value={OTHER}>Інше…</option>
              </select>
              {purposeSel === OTHER && <input className="field mt-2" value={purposeText} onChange={(e) => setPurposeText(e.target.value)} maxLength={200} placeholder="Опишіть мету" />}
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="mb-1 text-base font-semibold text-white">Скріншоти</div>
            <p className="mb-4 text-sm text-slate-400">Натисніть на слот, перетягніть файл або просто натисніть Ctrl+V: скріншот потрапить у перший вільний слот.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {SLOTS.map((s, i) => (
                <Slot key={s.key} n={i + 1} title={s.title} hint={s.hint} data={shots[s.key]} onFile={(f) => setShot(s.key, f)} onClear={() => setShots((x) => ({ ...x, [s.key]: undefined }))} />
              ))}
            </div>
          </section>

          <div className="flex justify-end">
            <button className="btn btn-primary !px-5 !py-2.5" disabled={!valid || busy} onClick={submit}>
              <Send className="h-4 w-4" />
              {busy ? 'Надсилання…' : 'Надіслати звіт'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Slot: React.FC<{ n: number; title: string; hint: string; data?: string; onFile: (f: File | undefined) => void; onClear: () => void }> = ({ n, title, hint, data, onFile, onClear }) => {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-slate-200">{n}. {title}</div>
      <div
        role="button" tabIndex={0}
        onClick={() => !data && input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !data && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
        className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-dashed text-center transition-colors ${over ? 'border-amber-400 bg-amber-400/5' : 'border-[#27355a] bg-[#070d1a] hover:border-[#34457a]'} ${data ? '' : 'cursor-pointer'}`}
      >
        {data ? (
          <>
            <img src={data} alt={title} className="h-full w-full object-cover" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }} className="absolute right-2 top-2 rounded-lg bg-slate-950/80 p-1.5 text-slate-200 hover:text-white" aria-label="Прибрати скріншот">
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="px-3 text-slate-500">
            <ImagePlus className="mx-auto mb-1.5 h-6 w-6" />
            <div className="text-xs">{hint}</div>
          </div>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
};
