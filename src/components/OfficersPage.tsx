import React, { useEffect, useMemo, useState } from 'react';
import { Search, Users, Pencil } from 'lucide-react';
import { PageHeader, EmptyState, Notice, Modal, pluralUa } from './ui';
import { api } from '../services/api';
import { rankLabel, RANKS } from '../ranks';
import { Officer } from '../types';

export const OfficersPage: React.FC = () => {
  const [officers, setOfficers] = useState<Officer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Officer | null>(null);

  const load = () => api.getOfficers().then(setOfficers).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (officers || []).filter((o) => !q || `${o.name} ${o.staticId} ${o.department} ${o.discordId}`.toLowerCase().includes(q));
  }, [officers, query]);

  return (
    <div>
      <PageHeader
        title="Особовий склад"
        description="База офіцерів. Записи створюються при першому вході людини на сайт або при прийнятті. Звільнені видаляються автоматично."
      />
      {error && <div className="mb-5"><Notice kind="error">{error}</Notice></div>}
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input className="field !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук за ім'ям, статіком, відділом" />
      </div>
      <div className="panel divide-y divide-[#142038]">
        {officers && list.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="Нікого не знайдено" text="Офіцери з'являться тут після першого входу або прийняття." />
        ) : (
          list.map((o) => (
            <div key={o.discordId} className="grid gap-1 p-4 sm:grid-cols-[13rem_minmax(0,1fr)_auto_2.5rem] sm:items-center sm:gap-4">
              <div className="text-sm text-slate-300">{rankLabel(o.rank)}</div>
              <div className="min-w-0 truncate text-sm text-white">
                {o.department ? <span className="text-slate-400">{o.department} | </span> : null}
                {o.name} <span className="font-mono text-slate-500">{o.staticId || 'без статіка'}</span>
              </div>
              <div className="text-xs text-slate-500">
                <span className="font-mono">{o.discordId}</span>
                {!o.confirmed && <span className="ml-2 text-amber-300">профіль не підтверджено</span>}
              </div>
              <button className="btn btn-ghost !p-2" onClick={() => setEditing(o)} aria-label="Редагувати" title="Редагувати картку">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
      {editing && <EditOfficerModal officer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {officers && <p className="hint mt-3">{officers.length} {pluralUa(officers.length, 'офіцер', 'офіцери', 'офіцерів')} у базі</p>}
    </div>
  );
};

const EditOfficerModal: React.FC<{ officer: Officer; onClose: () => void; onSaved: () => void }> = ({ officer, onClose, onSaved }) => {
  const [name, setName] = useState(officer.name);
  const [staticId, setStaticId] = useState(officer.staticId);
  const [department, setDepartment] = useState(officer.department);
  const [rank, setRank] = useState<number | ''>(officer.rank ?? '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateOfficer(officer.discordId, { name, staticId, department, rank: rank === '' ? null : rank, note });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Редагування картки офіцера"
      description="Пряма правка даних, наприклад ранг. Запис потрапить у журнал як «Корекція», у Discord він не надсилається. Для звичайних кадрових рішень використовуйте кадровий аудит."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Збереження…' : 'Зберегти'}</button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className="label" htmlFor="e-name">Ім'я та прізвище (або позивний)</label>
          <input id="e-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="e-static">Статік</label>
            <input id="e-static" className="field font-mono" inputMode="numeric" value={staticId} onChange={(e) => setStaticId(e.target.value.replace(/\D/g, '').slice(0, 8))} />
          </div>
          <div>
            <label className="label" htmlFor="e-dept">Відділ</label>
            <input id="e-dept" className="field" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={40} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="e-rank">Ранг</label>
          <select id="e-rank" className="field" value={rank} onChange={(e) => setRank(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Не вказано</option>
            {RANKS.map((r) => <option key={r.n} value={r.n}>{rankLabel(r.n)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-note">Примітка до журналу (необов'язково)</label>
          <input id="e-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </div>
      </div>
    </Modal>
  );
};
