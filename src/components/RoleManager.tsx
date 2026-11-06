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
import { PageHeader, SettingsSection } from './ui';

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
    <div>
      <PageHeader
        title="Ролі та доступ"
        description="Хто може входити в кабінет і як називаються посади. Вхід через Discord працює за роллю на вашому сервері."
      />

      {!isLeader && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-4 text-sm text-amber-200">
          <Lock className="h-4 w-4 shrink-0 text-amber-400" />
          Тільки керівник може змінювати ці налаштування. Ви бачите їх лише для перегляду.
        </div>
      )}

      {successNotice && (
        <div
          role="status"
          className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successNotice}
        </div>
      )}

      <form onSubmit={handleOpenConfirm} className="space-y-5">
        <SettingsSection
          title="Посади"
          description="Назви, які бачать інструктори в кабінеті. Role ID потрібен, щоб Discord сам визначав, кого пускати."
        >
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="leader-title" className="label">
                  Керівник
                </label>
                <input
                  id="leader-title"
                  type="text"
                  required
                  value={leaderTitle}
                  onChange={(e) => setLeaderTitle(e.target.value)}
                  disabled={!isLeader}
                  placeholder="Шериф"
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="leader-role" className="label">
                  Discord Role ID керівника
                </label>
                <input
                  id="leader-role"
                  type="text"
                  inputMode="numeric"
                  value={discordLeaderRoleId}
                  onChange={(e) => setDiscordLeaderRoleId(e.target.value)}
                  disabled={!isLeader}
                  placeholder="120485928192837482"
                  className="field font-mono"
                />
              </div>
              <p className="hint !mt-0 sm:col-span-2">
                Повний доступ: тести, інструктори, вебхук і ці налаштування.
              </p>
            </div>

            <div className="grid gap-4 border-t border-[#142038] pt-6 sm:grid-cols-2">
              <div>
                <label htmlFor="instructor-title" className="label">
                  Інструктор
                </label>
                <input
                  id="instructor-title"
                  type="text"
                  required
                  value={instructorTitle}
                  onChange={(e) => setInstructorTitle(e.target.value)}
                  disabled={!isLeader}
                  placeholder="Інструктор"
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="instructor-role" className="label">
                  Discord Role ID інструктора
                </label>
                <input
                  id="instructor-role"
                  type="text"
                  inputMode="numeric"
                  value={discordInstructorRoleId}
                  onChange={(e) => setDiscordInstructorRoleId(e.target.value)}
                  disabled={!isLeader}
                  placeholder="120485928192837483"
                  className="field font-mono"
                />
              </div>
              <p className="hint !mt-0 sm:col-span-2">
                Видає посилання, перевіряє роботи, виносить вердикти. Вебхук і налаштування йому недоступні.
              </p>
            </div>

            <div className="grid gap-4 border-t border-[#142038] pt-6 sm:grid-cols-2">
              <div>
                <label htmlFor="cadet-title" className="label">
                  Кадет
                </label>
                <input
                  id="cadet-title"
                  type="text"
                  required
                  value={cadetTitle}
                  onChange={(e) => setCadetTitle(e.target.value)}
                  disabled={!isLeader}
                  placeholder="Кадет академії"
                  className="field"
                />
              </div>
              <p className="hint sm:!mt-7">
                Кадети не входять у кабінет. Вони складають іспит за посиланням від інструктора, тому Role ID для них не
                потрібен.
              </p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Підключення до Discord"
          description="Дані вашого сервера та додатка з Discord Developer Portal. Вони потрібні для входу через Discord."
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="guild-id" className="label">
                  ID сервера (Guild ID)
                </label>
                <input
                  id="guild-id"
                  type="text"
                  inputMode="numeric"
                  value={discordGuildId}
                  onChange={(e) => setDiscordGuildId(e.target.value)}
                  disabled={!isLeader}
                  placeholder="109283746581928374"
                  className="field font-mono"
                />
                <p className="hint">Правою кнопкою на сервер у Discord, далі «Копіювати ID сервера».</p>
              </div>
              <div>
                <label htmlFor="client-id" className="label">
                  Client ID
                </label>
                <input
                  id="client-id"
                  type="text"
                  inputMode="numeric"
                  value={discordClientId}
                  onChange={(e) => setDiscordClientId(e.target.value)}
                  disabled={!isLeader}
                  placeholder="132485918273645281"
                  className="field font-mono"
                />
                <p className="hint">Developer Portal, розділ OAuth2.</p>
              </div>
            </div>

            <div>
              <label htmlFor="client-secret" className="label">
                Client Secret
              </label>
              <input
                id="client-secret"
                type="password"
                autoComplete="new-password"
                value={discordClientSecret}
                onChange={(e) => setDiscordClientSecret(e.target.value)}
                disabled={!isLeader}
                placeholder={
                  settings?.discordClientSecretSet ? 'Збережено. Залиште порожнім, щоб не змінювати' : 'Вставте Client Secret'
                }
                className="field font-mono"
              />
              <p className="hint">
                Сервер ніколи не показує збережений секрет. Надійніше задати його змінною DISCORD_CLIENT_SECRET на
                хостингу.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-[#1b2740] bg-[#070d1a] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200">Redirect URI для Developer Portal</div>
                <div className="mt-1 select-all break-all font-mono text-xs text-amber-300">{redirectUri}</div>
              </div>
              <button type="button" onClick={handleCopyRedirect} className="btn btn-secondary shrink-0">
                {copiedRedirect ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Скопійовано
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Копіювати
                  </>
                )}
              </button>
            </div>
          </div>
        </SettingsSection>

        {isLeader && (
          <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-[#27355a] bg-[#0b1322]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
              Перед збереженням ви побачите, що саме зміниться, і підтвердите дію.
            </p>
            <button type="submit" className="btn btn-primary">
              <Save className="h-4 w-4" />
              Зберегти зміни
            </button>
          </div>
        )}
      </form>

      {isLeader && (
        <div className="mt-5">
          <SettingsSection
            title="Пароль куратора"
            description="Для резервного входу, коли Discord недоступний. Змініть його, якщо змінився склад керівництва."
          >
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cur-pass" className="label">
                    Поточний пароль
                  </label>
                  <input
                    id="cur-pass"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="field font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="new-pass" className="label">
                    Новий пароль
                  </label>
                  <input
                    id="new-pass"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Щонайменше 8 символів"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="field font-mono"
                  />
                </div>
              </div>

              {passSuccess && (
                <div role="status" className="flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {passSuccess}
                </div>
              )}
              {passError && (
                <div role="alert" className="flex items-center gap-2 text-sm text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                  {passError}
                </div>
              )}

              <button type="submit" disabled={passSubmitting} className="btn btn-secondary">
                {passSubmitting ? 'Збереження…' : 'Змінити пароль'}
              </button>
            </form>
          </SettingsSection>
        </div>
      )}

      <div className="mt-5">
        <SettingsSection title="Журнал змін" description="Останні зміни посад і ролей: хто, коли та навіщо.">
          {!settings?.roleAuditLogs || settings.roleAuditLogs.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">Змін ще не було.</p>
          ) : (
            <ul className="-my-3 divide-y divide-[#142038]">
              {settings.roleAuditLogs.slice(0, 6).map((log: RoleAuditLogEntry) => (
                <li key={log.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium text-white">{log.actorName}</span>
                    <span className="text-slate-400">
                      {' '}
                      змінив посаду «<span className="text-slate-500 line-through">{log.oldTitle}</span>» на «
                      <span className="text-slate-200">{log.newTitle}</span>»
                    </span>
                    {log.reason && <div className="mt-0.5 text-xs text-slate-500">Причина: {log.reason}</div>}
                  </div>
                  <time className="num shrink-0 text-xs text-slate-500" dateTime={log.timestamp}>
                    {new Date(log.timestamp).toLocaleString('uk-UA', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>
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
