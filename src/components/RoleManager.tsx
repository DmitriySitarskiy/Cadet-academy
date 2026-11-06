import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Users,
  Lock,
  CheckCircle2,
  AlertTriangle,
  History,
  Copy,
  ExternalLink,
  Save,
  Radio,
  FileText,
  Sparkles,
} from 'lucide-react';
import { AppSettings, User, RoleAuditLogEntry } from '../types';
import { api } from '../services/api';
import { RoleConfirmModal } from './RoleConfirmModal';

interface RoleManagerProps {
  settings: AppSettings | null;
  currentUser: User | null;
  onRefreshSettings: () => void;
}

export const RoleManager: React.FC<RoleManagerProps> = ({
  settings,
  currentUser,
  onRefreshSettings,
}) => {
  // Form state
  const [leaderTitle, setLeaderTitle] = useState('');
  const [instructorTitle, setInstructorTitle] = useState('');
  const [cadetTitle, setCadetTitle] = useState('');

  const [discordGuildId, setDiscordGuildId] = useState('');
  const [discordLeaderRoleId, setDiscordLeaderRoleId] = useState('');
  const [discordInstructorRoleId, setDiscordInstructorRoleId] = useState('');
  const [discordClientId, setDiscordClientId] = useState('');
  const [discordClientSecret, setDiscordClientSecret] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passSubmitting, setPassSubmitting] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPass || !newPass) return;
    setPassSubmitting(true);
    setPassError(null);
    setPassSuccess(null);
    try {
      const res = await api.changeCuratorPassword({ currentPassword: currentPass, newPassword: newPass });
      setPassSuccess(res.message);
      setCurrentPass('');
      setNewPass('');
      setTimeout(() => setPassSuccess(null), 4000);
    } catch (err: any) {
      setPassError(err.message || 'Помилка зміни пароля');
    } finally {
      setPassSubmitting(false);
    }
  };

  // Confirmation Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setLeaderTitle(settings.roleTitles?.leader || 'Шеф Департаменту / Лідер');
      setInstructorTitle(settings.roleTitles?.instructor || 'Інструктор Академії');
      setCadetTitle(settings.roleTitles?.cadet || 'Кадет Академії');
      setDiscordGuildId(settings.discordGuildId || '');
      setDiscordLeaderRoleId(settings.discordLeaderRoleId || '');
      setDiscordInstructorRoleId(settings.discordInstructorRoleId || '');
      setDiscordClientId(settings.discordClientId || '');
      // Секрет сервер ніколи не віддає — поле лишається порожнім (порожнє = «не змінювати»)
      setDiscordClientSecret('');
    }
  }, [settings]);

  const redirectUri = `${window.location.origin}/auth/callback`;

  const handleCopyRedirect = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setShowConfirmModal(true);
  };

  const handleConfirmSave = async (confirmationCode: string, reason: string) => {
    await api.updateRoleSettings({
      roleTitles: {
        leader: leaderTitle.trim(),
        instructor: instructorTitle.trim(),
        cadet: cadetTitle.trim(),
      },
      discordGuildId: discordGuildId.trim(),
      discordLeaderRoleId: discordLeaderRoleId.trim(),
      discordInstructorRoleId: discordInstructorRoleId.trim(),
      discordClientId: discordClientId.trim(),
      discordClientSecret: discordClientSecret.trim(),
      confirmationCode,
      reason,
    });

    setDiscordClientSecret('');
    setSuccessNotice('Структуру ролей та прив’язку Discord успішно збережено!');
    setTimeout(() => setSuccessNotice(null), 4000);
    onRefreshSettings();
  };

  const isLeader = currentUser?.role === 'leader';

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Центр Безпеки та Ролей
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400 font-mono">2-Step Confirmation</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">
              Налаштування посад та авторизації Discord
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Задайте назви посад для вашої фракції (Шеф, Інструктор, Кадет), прив'яжіть Discord Role ID
              для автоматичного входу, та налаштуйте права доступу.
            </p>
          </div>
        </div>

        {!isLeader && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold flex items-center gap-2 shrink-0">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Режим перегляду (доступно тільки Лідеру)</span>
          </div>
        )}
      </div>

      {successNotice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      <form onSubmit={handleOpenConfirm} className="space-y-6">
        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* 1. Leader Role */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span>👑</span>
                  <span>Роль: Лідер фракції</span>
                </span>
                <span className="text-[10px] font-mono bg-amber-400/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/20">
                  Full Admin
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Відображувана назва посади:
                </label>
                <input
                  type="text"
                  value={leaderTitle}
                  onChange={(e) => setLeaderTitle(e.target.value)}
                  disabled={!isLeader}
                  placeholder="напр. Шеф Поліції / Генерал"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-60"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Discord Role ID (для авто-входу):
                </label>
                <input
                  type="text"
                  value={discordLeaderRoleId}
                  onChange={(e) => setDiscordLeaderRoleId(e.target.value)}
                  disabled={!isLeader}
                  placeholder="напр. 120485928192837482"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-300 font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-60"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Учасники з цією роллю в Discord отримають повні права Лідера.
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-semibold text-slate-300">Повноваження:</div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Зміна та тестування Discord Webhook</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Створення та видалення тестів</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Керування інструкторами та ролями</span>
              </div>
            </div>
          </div>

          {/* 2. Instructor Role */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-indigo-500/30 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <span>🎓</span>
                  <span>Роль: Інструктор</span>
                </span>
                <span className="text-[10px] font-mono bg-indigo-400/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">
                  Examiner
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Відображувана назва посади:
                </label>
                <input
                  type="text"
                  value={instructorTitle}
                  onChange={(e) => setInstructorTitle(e.target.value)}
                  disabled={!isLeader}
                  placeholder="напр. Старший Інструктор PA"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Discord Role ID (для авто-входу):
                </label>
                <input
                  type="text"
                  value={discordInstructorRoleId}
                  onChange={(e) => setDiscordInstructorRoleId(e.target.value)}
                  disabled={!isLeader}
                  placeholder="напр. 120485928192837483"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-indigo-300 font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Учасники з цією роллю отримають доступ екзаменатора.
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-semibold text-slate-300">Повноваження:</div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Генерація одноразових посилань</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Перевірка іспитів та вердикти</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Lock className="w-3.5 h-3.5 text-amber-500/80" />
                <span>Webhook та системні конфігурації заблоковані</span>
              </div>
            </div>
          </div>

          {/* 3. Cadet Role */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>🔰</span>
                  <span>Роль: Кадет</span>
                </span>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                  Student
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Відображувана назва:
                </label>
                <input
                  type="text"
                  value={cadetTitle}
                  onChange={(e) => setCadetTitle(e.target.value)}
                  disabled={!isLeader}
                  placeholder="напр. Кадет Академії / Курсант"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-60"
                  required
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                Кадети проходять тестування у захищеному режимі (повноекранний замок, заборона копіювання, таймер).
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-semibold text-slate-300">Повноваження:</div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Проходження призначених іспитів</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Lock className="w-3.5 h-3.5 text-amber-500/80" />
                <span>Немає доступу до панелі інструкторів</span>
              </div>
            </div>
          </div>
        </div>

        {/* Discord Server & OAuth Configuration */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">
                Параметри Discord Сервера та OAuth2 додатку
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">Guild Integration</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Discord Server (Guild) ID:
              </label>
              <input
                type="text"
                value={discordGuildId}
                onChange={(e) => setDiscordGuildId(e.target.value)}
                disabled={!isLeader}
                placeholder="напр. 109283746581928374"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-60"
              />
              <div className="text-[10px] text-slate-500 mt-1">
                Клік правою кнопкою на сервер у Discord ➔ «Копіювати ID сервера»
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Discord Client ID:
              </label>
              <input
                type="text"
                value={discordClientId}
                onChange={(e) => setDiscordClientId(e.target.value)}
                disabled={!isLeader}
                placeholder="напр. 132485918273645281"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-60"
              />
              <div className="text-[10px] text-slate-500 mt-1">
                З Discord Developer Portal
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Discord Client Secret:
              </label>
              <input
                type="password"
                value={discordClientSecret}
                onChange={(e) => setDiscordClientSecret(e.target.value)}
                disabled={!isLeader}
                placeholder={settings?.discordClientSecretSet ? '•••••••• збережено (залиште порожнім, щоб не змінювати)' : 'Вставте Client Secret'}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-60"
              />
              <div className="text-[10px] text-slate-500 mt-1">
                Зберігається суворо на сервері. Надійніше — змінна середовища DISCORD_CLIENT_SECRET на хостингу.
              </div>
            </div>
          </div>

          {/* Exact Redirect URI info for Discord Portal */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-300">
                Обов'язковий Redirect URI для Discord Developer Portal:
              </span>
              <div className="text-[11px] font-mono text-indigo-300 select-all">{redirectUri}</div>
            </div>

            <button
              type="button"
              onClick={handleCopyRedirect}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 shrink-0 transition-colors"
            >
              {copiedRedirect ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Скопійовано!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Скопіювати URI</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Submit Action (Leader only) */}
        {isLeader && (
          <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
            <div className="text-xs text-slate-300">
              💡 Збереження відкриє діалог <strong>2-етапного підтвердження безпеки</strong> з перевіркою відмінностей (Diff) та введенням коду.
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>Зберегти зміни ролей (із підтвердженням)</span>
            </button>
          </div>
        )}
      </form>

            {/* Блок зміни пароля Куратора */}
      {isLeader && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Безпека: Зміна пароля Куратора</h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">Curator Access</span>
          </div>
          <p className="text-xs text-slate-400">
            Використовуйте цей розділ для зміни пароля Куратора (наприклад, під час зміни лідерів).
          </p>
          <form onSubmit={handleUpdatePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Поточний пароль:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Новий пароль:</label>
              <input
                type="password"
                required
                placeholder="Мінімум 4 символи"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={passSubmitting}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
            >
              {passSubmitting ? "Збереження..." : "Оновити пароль"}
            </button>
          </form>
          {passSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
              ✅ {passSuccess}
            </div>
          )}
          {passError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-semibold">
              ❌ {passError}
            </div>
          )}
        </div>
      )}

      {/* Role Audit History Log */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Журнал безпеки: Історія перейменування ролей</h3>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Audit Log</span>
        </div>

        {(!settings?.roleAuditLogs || settings.roleAuditLogs.length === 0) ? (
          <div className="p-6 rounded-xl bg-slate-950 text-center text-xs text-slate-500">
            Змін ролей ще не зафіксовано.
          </div>
        ) : (
          <div className="space-y-2">
            {settings.roleAuditLogs.slice(0, 5).map((log: RoleAuditLogEntry) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-2">
                    <span className="text-amber-400">🛡️ {log.actorName}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-[11px] text-slate-400">{log.reason || 'Оновлення ролей'}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Було: <span className="line-through">{log.oldTitle}</span> ➔ Стало: <span className="text-white font-bold">{log.newTitle}</span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 font-mono shrink-0">
                  {new Date(log.timestamp).toLocaleDateString('uk-UA')} {new Date(log.timestamp).toLocaleTimeString('uk-UA')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Safeguard Modal */}
      <RoleConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        diffData={{
          leaderTitle: {
            old: settings?.roleTitles?.leader || 'Шеф Департаменту / Лідер',
            next: leaderTitle.trim(),
          },
          instructorTitle: {
            old: settings?.roleTitles?.instructor || 'Інструктор Академії',
            next: instructorTitle.trim(),
          },
          cadetTitle: {
            old: settings?.roleTitles?.cadet || 'Кадет Академії',
            next: cadetTitle.trim(),
          },
          discordGuildId: {
            old: settings?.discordGuildId || '',
            next: discordGuildId.trim(),
          },
          leaderRoleId: {
            old: settings?.discordLeaderRoleId || '',
            next: discordLeaderRoleId.trim(),
          },
          instructorRoleId: {
            old: settings?.discordInstructorRoleId || '',
            next: discordInstructorRoleId.trim(),
          },
        }}
      />
    </div>
  );
};
