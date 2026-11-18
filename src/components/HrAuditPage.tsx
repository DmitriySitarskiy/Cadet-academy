import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Search, Settings2, Send, RefreshCw } from 'lucide-react';
import { PageHeader, Segmented, Modal, Notice, EmptyState, formatDateTime } from './ui';
import { ReasonsModal } from './ReasonsModal';
import { api } from '../services/api';
import { rankLabel } from '../ranks';
import { Officer, HrAudit, HrAuditType, PortalConfig, User } from '../types';

const TYPES: { value: HrAuditType; label: string; cls: string }[] = [
  { value: 'hire', label: 'Прийняття', cls: 'text-emerald-400' },
  { value: 'promote', label: 'Підвищення', cls: 'text-sky-400' },
  { value: 'demote', label: 'Пониження', cls: 'text-amber-400' },
  { value: 'dismiss', label: 'Звільнення', cls: 'text-red-400' },
  { value: 'correction', label: 'Виправлення', cls: 'text-violet-300' },
];
const OTHER = '__other__';

interface Props {
  config: PortalConfig;
  currentUser: User | null;
  onConfigChanged: () => void;
  onOpenProfile: () => void;
}

export const HrAuditPage: React.FC<Props> = ({ config, currentUser, onConfigChanged, onOpenProfile }) => {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [audits, setAudits] = useState<HrAudit[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [type, setType] = useState<HrAuditType>('hire');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Officer | null>(null);
  const [discordId, setDiscordId] = useState('');
  const [newDiscordId, setNewDiscordId] = useState('');
  const [name, setName] = useState('');
  const [staticId, setStaticId] = useState('');
  const [department, setDepartment] = useState('');
  const [rankTo, setRankTo] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [showReasons, setShowReasons] = useState(false);

  const load = async () => {
    try {
      const [o, a] = await Promise.all([api.getOfficers(), api.getAudits()]);
      setOfficers(o);
      setAudits(a);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const basis = reason === OTHER ? custom.trim() : reason;
  const isHire = type === 'hire';
  const isDismiss = type === 'dismiss';
  const isCorrection = type === 'correction';

  const resetForm = () => {
    setSelected(null); setQuery(''); setDiscordId(''); setNewDiscordId(''); setName(''); setStaticId(''); setDepartment('');
    setRankTo(''); setReason(''); setCustom('');
  };
  const changeType = (t: HrAuditType) => {
    setType(t);
    resetForm();
    setNotice(null);
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return officers.filter((o) => `${o.name} ${o.staticId} ${o.department} ${o.discordId}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query, officers]);

  const rankOptions = config.ranks.filter((r) => {
    if (!selected || selected.rank === null) return true;
    if (type === 'promote') return r.n > selected.rank;
    if (type === 'demote') return r.n < selected.rank;
    return true;
  });

  const pick = (o: Officer) => {
    setSelected(o);
    if (isCorrection) {
      setNewDiscordId(o.discordId); setName(o.name); setStaticId(o.staticId); setDepartment(o.department); setRankTo(o.rank ?? '');
    } else setRankTo('');
  };
  const changes = useMemo(() => {
    if (!isCorrection || !selected) return [] as { field: string; from: string; to: string }[];
    const rl = (n: number | '' | null) => (n === '' || n === null ? '' : rankLabel(n));
    const all = [
      { field: 'Discord ID', from: selected.discordId, to: newDiscordId },
      { field: "Ім'я", from: selected.name, to: name.trim() },
      { field: 'Статік', from: selected.staticId, to: staticId },
      { field: 'Відділ', from: selected.department, to: department.trim() },
      { field: 'Ранг', from: rl(selected.rank), to: rl(rankTo) },
    ];
    return all.filter((c) => c.from !== c.to);
  }, [isCorrection, selected, name, staticId, department, rankTo]);

  const officerOk = isHire
    ? /^\d{17,20}$/.test(discordId) && name.trim().length >= 2 && /^\d{1,8}$/.test(staticId)
    : isCorrection
      ? Boolean(selected) && /^\d{17,20}$/.test(newDiscordId) && name.trim().length >= 2 && /^\d{1,8}$/.test(staticId)
      : Boolean(selected);
  const valid = officerOk && (isDismiss || isCorrection || rankTo !== '') && basis.length >= 2 && (!isCorrection || changes.length > 0);

  const submit = async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await api.createAudit({
        type, discordId: isHire ? discordId : selected!.discordId, newDiscordId: isCorrection ? newDiscordId : undefined, name, staticId, department,
        rankTo: isDismiss ? undefined : rankTo, basis,
      });
      setNotice(
        res.discordSent
          ? { kind: 'ok', text: 'Кадровий аудит збережено й надіслано в Discord.' }
          : { kind: 'warn', text: `Рішення збережено, але в Discord не надіслано: ${res.discordError}. Повторіть відправку в списку нижче.` }
      );
      setConfirming(false);
      resetForm();
      load();
    } catch (e: any) {
      setConfirming(false);
      setNotice({ kind: 'error', text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const repost = async (id: string) => {
    try {
      const r = await api.repostAudit(id);
      setNotice(r.success ? { kind: 'ok', text: 'Повторно надіслано в Discord.' } : { kind: 'error', text: r.discordError || 'Не вдалося надіслати.' });
      load();
    } catch (e: any) {
      setNotice({ kind: 'error', text: e.message });
    }
  };

  const personName = isHire || isCorrection ? name : selected?.name;
  const typeMeta = TYPES.find((t) => t.value === type)!;

  return (
    <div>
      <PageHeader
        title="Кадровий аудит"
        description="Оформлення прийняття, підвищення, пониження, звільнення та виправлення даних. Рішення потрапляє в журнал, оновлює базу офіцерів і надсилається в Discord."
        actions={
          <button className="btn btn-secondary" onClick={() => setShowReasons(true)}>
            <Settings2 className="h-4 w-4" />
            Типові причини
          </button>
        }
      />

      {loadError && <div className="mb-5"><Notice kind="error">{loadError}</Notice></div>}
      {notice && <div className="mb-5"><Notice kind={notice.kind}>{notice.text}</Notice></div>}

      <section className="panel space-y-6 p-5 sm:p-6">
        <div>
          <div className="label">Тип рішення</div>
          <Segmented options={TYPES.map((t) => ({ value: t.value, label: t.label }))} value={type} onChange={(v) => changeType(v as HrAuditType)} />
        </div>

        {/* Офіцер */}
        {isHire ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="h-id">Discord ID офіцера</label>
              <input id="h-id" className="field font-mono" inputMode="numeric" value={discordId} onChange={(e) => setDiscordId(e.target.value.replace(/\D/g, '').slice(0, 20))} placeholder="17–20 цифр" />
              <p className="hint">Discord: Параметри → Додатково → Режим розробника, далі ПКМ по користувачу → «Копіювати ID».</p>
            </div>
            <div>
              <label className="label" htmlFor="h-name">Ім'я та прізвище (або позивний)</label>
              <input id="h-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="h-static">Статік</label>
                <input id="h-static" className="field font-mono" inputMode="numeric" value={staticId} onChange={(e) => setStaticId(e.target.value.replace(/\D/g, '').slice(0, 8))} />
              </div>
              <div>
                <label className="label" htmlFor="h-dept">Відділ</label>
                <input id="h-dept" className="field" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={40} />
              </div>
            </div>
            <p className="hint sm:col-span-2 !mt-0">Коли офіцер сам зайде на сайт, він зможе виправити ім'я та статік у профілі.</p>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="o-search">Офіцер</label>
            {selected ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#27355a] bg-[#0e1730] p-3.5">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{selected.department ? `${selected.department} | ` : ''}{selected.name} <span className="font-mono text-slate-400">{selected.staticId}</span></div>
                  <div className="mt-0.5 text-sm text-slate-400">Поточний ранг: {rankLabel(selected.rank)}</div>
                </div>
                <button className="btn btn-ghost" onClick={() => { setSelected(null); setRankTo(''); }}>Змінити</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input id="o-search" className="field !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ім'я, статік, відділ або Discord ID" autoComplete="off" />
                {query.trim() && (
                  <ul className="mt-2 overflow-hidden rounded-xl border border-[#1b2740] bg-[#070d1a]">
                    {matches.length === 0 && <li className="p-3 text-sm text-slate-500">Нікого не знайдено. Нового співробітника оформлюйте через «Прийняття».</li>}
                    {matches.map((o) => (
                      <li key={o.discordId}>
                        <button className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-white/[0.04]" onClick={() => pick(o)}>
                          <span className="truncate text-slate-200">{o.department ? `${o.department} | ` : ''}{o.name} <span className="font-mono text-slate-500">{o.staticId}</span></span>
                          <span className="shrink-0 text-xs text-slate-400">{rankLabel(o.rank)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {isCorrection && selected && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="c-id">Discord ID</label>
              <input id="c-id" className="field font-mono" inputMode="numeric" value={newDiscordId} onChange={(e) => setNewDiscordId(e.target.value.replace(/\D/g, '').slice(0, 20))} />
              <p className="hint">Якщо при прийнятті вказали не той ID, виправте тут: картка й історія перейдуть на новий ID. Змінений ID має належати іншій людині, ніж уже наявні в базі.</p>
            </div>
            <div>
              <label className="label" htmlFor="c-name">Ім'я та прізвище (або позивний)</label>
              <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="c-static">Статік</label>
                <input id="c-static" className="field font-mono" inputMode="numeric" value={staticId} onChange={(e) => setStaticId(e.target.value.replace(/\D/g, '').slice(0, 8))} />
              </div>
              <div>
                <label className="label" htmlFor="c-dept">Відділ</label>
                <input id="c-dept" className="field" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={40} />
              </div>
            </div>
          </div>
        )}

        {/* Ранг */}
        {!isDismiss && (
          <div className="max-w-sm">
            <label className="label" htmlFor="h-rank">{isHire ? 'Ранг при прийнятті' : isCorrection ? 'Ранг' : 'Новий ранг'}</label>
            <select id="h-rank" className="field" value={rankTo} onChange={(e) => setRankTo(e.target.value ? Number(e.target.value) : '')} disabled={!isHire && !selected}>
              <option value="">{isCorrection ? 'Не вказано' : 'Оберіть ранг'}</option>
              {rankOptions.map((r) => <option key={r.n} value={r.n}>{rankLabel(r.n)}</option>)}
            </select>
          </div>
        )}

        {/* Підстава */}
        <div className="max-w-xl">
          <label className="label" htmlFor="h-basis">Згідно чого</label>
          <select id="h-basis" className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Оберіть причину</option>
            {config.reasons.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value={OTHER}>Інше (текст або посилання)…</option>
          </select>
          {reason === OTHER && (
            <textarea className="field mt-2" rows={2} value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={500} placeholder="Опишіть підставу або вставте посилання на повідомлення в Discord" />
          )}
        </div>

        {/* Хто заповнює */}
        <div className="flex flex-col gap-3 border-t border-[#1b2740] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-400">
            Заповнює: <span className="font-medium text-slate-200">{currentUser?.name}</span>{' '}
            <button className="text-amber-300 underline-offset-2 hover:underline" onClick={onOpenProfile}>перевірити профіль</button>
          </div>
          <button className="btn btn-primary" disabled={!valid} onClick={() => setConfirming(true)}>
            <Send className="h-4 w-4" />
            Перевірити й надіслати
          </button>
        </div>
      </section>

      {/* Журнал */}
      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Останні рішення</h2>
        <button className="btn btn-ghost" onClick={load}><RefreshCw className="h-4 w-4" />Оновити</button>
      </div>
      <div className="panel divide-y divide-[#142038]">
        {audits.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="Рішень ще немає" text="Після першого оформлення воно з'явиться тут." />
        ) : (
          audits.map((a) => {
            const meta = TYPES.find((t) => t.value === a.type)!;
            return (
              <div key={a.id} className="grid gap-1 p-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <div className="text-xs text-slate-500">{formatDateTime(a.createdAt)}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-100">
                    <span className={`font-semibold ${meta.cls}`}>{meta.label}</span> · {a.officer.name} <span className="font-mono text-slate-500">{a.officer.staticId}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-400">
                    {a.type === 'promote' || a.type === 'demote' || a.type === 'correction' ? `${rankLabel(a.rankFrom)} → ${rankLabel(a.rankTo)}` : rankLabel(a.type === 'dismiss' ? a.rankFrom : a.rankTo)} · {a.basis} · заповнив {a.filer.name}
                  </div>
                </div>
                <div className="text-xs">
                  {a.local ? (
                    <span className="text-slate-500">Лише журнал</span>
                  ) : a.discordPosted ? (
                    <span className="text-emerald-400">Надіслано</span>
                  ) : (
                    <button className="btn btn-secondary !py-1 !text-xs" onClick={() => repost(a.id)} title={a.discordError}>Надіслати в Discord</button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {confirming && (
        <Modal
          title="Підтвердіть рішення"
          description="Після відправки запис потрапить у журнал і в Discord."
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>Назад</button>
              <button className="btn btn-primary" disabled={submitting} onClick={submit}>{submitting ? 'Надсилання…' : 'Підтвердити'}</button>
            </>
          }
        >
          <dl className="space-y-3 text-sm">
            <Row k="Тип"><span className={`font-semibold ${typeMeta.cls}`}>{typeMeta.label}</span></Row>
            <Row k="Офіцер">{isCorrection ? `${selected?.name} ${selected?.staticId}` : `${personName} ${isHire ? staticId : selected?.staticId}`}</Row>
            {isCorrection && changes.map((c) => <Row key={c.field} k={c.field}>{c.from || '—'} → {c.to || '—'}</Row>)}
            {!isDismiss && !isCorrection && <Row k="Ранг">{selected && !isHire ? `${rankLabel(selected.rank)} → ` : ''}{rankLabel(Number(rankTo))}</Row>}
            {isDismiss && <Row k="Ранг на момент звільнення">{rankLabel(selected?.rank)}</Row>}
            <Row k="Згідно чого">{basis}</Row>
            {isDismiss && <Notice kind="warn">Офіцера буде видалено з бази. Запис про звільнення залишиться в журналі.</Notice>}
          </dl>
        </Modal>
      )}

      {showReasons && <ReasonsModal reasons={config.reasons} onClose={() => setShowReasons(false)} onSaved={onConfigChanged} />}
    </div>
  );
};

const Row: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
    <dt className="text-slate-500">{k}</dt>
    <dd className="min-w-0 break-words text-slate-100">{children}</dd>
  </div>
);
