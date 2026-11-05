import React, { useState } from 'react';
import { Users, UserPlus, Trash2, X, Shield, Check, AlertCircle } from 'lucide-react';
import { User } from '../types';
import { api } from '../services/api';

interface InstructorAccountsModalProps {
  instructors: User[];
  currentUser: User | null;
  onClose: () => void;
  onRefresh: () => void;
}

export const InstructorAccountsModal: React.FC<InstructorAccountsModalProps> = ({
  instructors,
  currentUser,
  onClose,
  onRefresh,
}) => {
  const isLeader = currentUser?.role === 'leader';
  const [name, setName] = useState('');
  const [role, setRole] = useState<'instructor' | 'leader'>('instructor');
  const [staticId, setStaticId] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await api.addInstructor({
        name: name.trim(),
        role,
        staticId: staticId.trim(),
        discordId: discordId.trim(),
      });
      setName('');
      setStaticId('');
      setDiscordId('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Помилка додавання інструктора');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, instName: string) => {
    if (!confirm(`Ви дійсно бажаєте видалити інструктора ${instName}?`)) return;
    try {
      await api.deleteInstructor(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Помилка видалення');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4">
      <div className="max-w-xl w-full p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">Штат інструкторського корпусу</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instructors List */}
        <div className="overflow-y-auto space-y-2.5 max-h-56 pr-1">
          {instructors.map((u) => (
            <div
              key={u.id}
              className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-bold shrink-0">
                  {u.role === 'leader' ? '⭐' : '🎓'}
                </div>
                <div>
                  <div className="font-semibold text-white">
                    {u.name}
                    {currentUser?.id === u.id && (
                      <span className="text-[10px] text-amber-400 font-mono ml-1.5">(Ви)</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {u.role === 'leader' ? 'Лідер фракції' : 'Інструктор'} · Статік: {u.staticId || '—'} · Discord: {u.discordId || '—'}
                  </div>
                </div>
              </div>

              {isLeader && instructors.length > 1 && u.id !== currentUser?.id && (
                <button
                  onClick={() => handleDelete(u.id, u.name)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                  title="Видалити"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add Instructor Form (Leader only) */}
        {isLeader ? (
          <form onSubmit={handleAdd} className="pt-4 border-t border-slate-800 space-y-3 shrink-0">
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" />
              Призначити нового інструктора
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  ПІБ / Нікнейм <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="напр. Андрій Шевченко"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Роль у системі</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="instructor">Інструктор</option>
                  <option value="leader">Лідер фракції</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Статік ID</label>
                <input
                  type="text"
                  placeholder="#18492"
                  value={staticId}
                  onChange={(e) => setStaticId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Discord ID / Тег</label>
                <input
                  type="text"
                  placeholder="shevchenko_doc"
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Збереження...' : 'Додати інструктора'}
            </button>
          </form>
        ) : (
          <div className="p-3 rounded-xl bg-slate-950 text-xs text-slate-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            Додавання нових інструкторів доступне лише користувачам із роллю «Лідер».
          </div>
        )}
      </div>
    </div>
  );
};
