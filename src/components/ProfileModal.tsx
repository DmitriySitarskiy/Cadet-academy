import React, { useEffect, useState } from 'react';
import { Modal, Notice } from './ui';
import { api } from '../services/api';
import { Officer, User } from '../types';
import { rankLabel } from '../ranks';

export const ProfileModal: React.FC<{ onClose: () => void; onSaved: (user: User, officer: Officer) => void }> = ({ onClose, onSaved }) => {
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [linked, setLinked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [staticId, setStaticId] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getProfile()
      .then(({ officer, discordLinked }) => {
        setLinked(discordLinked);
        setOfficer(officer);
        setName(officer?.name || '');
        setStaticId(officer?.staticId || '');
        setDepartment(officer?.department || '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveProfile({ name, staticId, department });
      onSaved(res.user, res.officer);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Мій профіль"
      description="Ці дані підставляються у кадрові аудити та звіти складу. Перевірте їх один раз."
      onClose={onClose}
      footer={
        linked && (
          <>
            <button className="btn btn-ghost" onClick={onClose} type="button">Скасувати</button>
            <button className="btn btn-primary" form="profile-form" type="submit" disabled={saving || loading}>
              {saving ? 'Збереження…' : 'Зберегти'}
            </button>
          </>
        )
      }
    >
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Завантаження…</div>
      ) : !linked ? (
        <Notice kind="warn">Профіль доступний лише після входу через Discord. Ви увійшли як куратор.</Notice>
      ) : (
        <form id="profile-form" onSubmit={save} className="space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <div>
            <label className="label" htmlFor="pf-name">Ім'я та прізвище (або позивний для ДБ)</label>
            <input id="pf-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pf-static">Статік</label>
              <input id="pf-static" className="field font-mono" inputMode="numeric" value={staticId} onChange={(e) => setStaticId(e.target.value.replace(/\D/g, '').slice(0, 8))} required />
            </div>
            <div>
              <label className="label" htmlFor="pf-dept">Відділ</label>
              <input id="pf-dept" className="field" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={40} placeholder="D.Sheriff" />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-[#1b2740] bg-[#070d1a] p-3.5 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Discord ID</dt>
              <dd className="mt-0.5 font-mono text-slate-300">{officer?.discordId || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Ранг</dt>
              <dd className="mt-0.5 text-slate-300">{rankLabel(officer?.rank)}</dd>
            </div>
          </dl>
          <p className="hint">Ранг змінює лише відділ кадрів через кадровий аудит.</p>
        </form>
      )}
    </Modal>
  );
};
