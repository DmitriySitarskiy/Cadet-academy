import React, { useState } from 'react';
import { Modal, Notice, ListEditor } from './ui';
import { api } from '../services/api';

export const ReasonsModal: React.FC<{ reasons: string[]; onClose: () => void; onSaved: () => void }> = ({ reasons, onClose, onSaved }) => {
  const [list, setList] = useState<string[]>(reasons);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveReasons(list.map((r) => r.trim()).filter(Boolean));
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Типові причини"
      description="Список для поля «Згідно чого». Якщо потрібної причини немає, кадровик вводить текст або посилання вручну."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Збереження…' : 'Зберегти'}</button>
        </>
      }
    >
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      <ListEditor values={list} onChange={setList} placeholder="Додати причину" />
    </Modal>
  );
};
