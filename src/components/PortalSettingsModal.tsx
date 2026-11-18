import React, { useState } from 'react';
import { Modal, Notice } from './ui';
import { api } from '../services/api';
import { AppSettings } from '../types';

export const PortalSettingsModal: React.FC<{ settings: AppSettings | null; onClose: () => void; onSaved: () => void }> = ({ settings, onClose, onSaved }) => {
  const [officerRole, setOfficerRole] = useState(settings?.discordOfficerRoleId || '');
  const [hrRole, setHrRole] = useState(settings?.discordHrRoleId || '');
  const [hrHook, setHrHook] = useState(settings?.discordHrWebhookUrl || '');
  const [craftHook, setCraftHook] = useState(settings?.discordCraftWebhookUrl || '');
  const [thread, setThread] = useState(Boolean(settings?.discordCraftUseThread));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.savePortalSettings({
        discordOfficerRoleId: officerRole, discordHrRoleId: hrRole, discordMtsRoleId: '',
        discordHrWebhookUrl: hrHook, discordCraftWebhookUrl: craftHook, discordCraftUseThread: thread,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  const idField = (id: string, label: string, value: string, set: (v: string) => void, hint: string) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="field font-mono" inputMode="numeric" value={value} onChange={(e) => set(e.target.value.trim())} placeholder="120485928192837482" />
      <p className="hint">{hint}</p>
    </div>
  );

  return (
    <Modal
      wide
      title="Портал: ролі та вебхуки"
      description="Кого пускати в кабінет за ролями Discord і куди надсилати кадрові аудити та звіти крафту."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Збереження…' : 'Зберегти'}</button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          {idField('r-off', 'Роль офіцера', officerRole, setOfficerRole, 'Доступ до звіту крафту.')}
          {idField('r-hr', 'Роль кадровика', hrRole, setHrRole, 'Кадровий аудит і особовий склад.')}
        </div>
        <p className="hint !mt-0">Роль МТС (повний доступ, включно з каталогом крафту та журналом звітів) і роль інструктора налаштовуються у формі на сторінці нижче. Ролі діють після наступного входу людини.</p>
        <div className="space-y-4 border-t border-[#1b2740] pt-5">
          <div>
            <label className="label" htmlFor="hook-hr">Вебхук кадрового аудиту</label>
            <input id="hook-hr" className="field font-mono" value={hrHook} onChange={(e) => setHrHook(e.target.value)} placeholder="https://discord.com/api/webhooks/..." autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="hook-craft">Вебхук звітів крафту</label>
            <input id="hook-craft" className="field font-mono" value={craftHook} onChange={(e) => setCraftHook(e.target.value)} placeholder="https://discord.com/api/webhooks/..." autoComplete="off" />
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-300">
            <input type="checkbox" className="mt-1" checked={thread} onChange={(e) => setThread(e.target.checked)} />
            <span>
              Створювати гілку на кожен звіт
              <span className="hint block">Працює лише якщо вебхук прив'язаний до форум-каналу. У звичайному текстовому каналі вебхук не вміє створювати гілки, тому залиште вимкненим: звіт прийде одним повідомленням із трьома скріншотами.</span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
};
