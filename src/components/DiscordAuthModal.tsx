import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  LogIn,
  Key,
} from 'lucide-react';
import { User, AppSettings } from '../types';
import { api } from '../services/api';

interface DiscordAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  settings: AppSettings | null;
  onUserChanged: (user: User) => void;
}

export const DiscordAuthModal: React.FC<DiscordAuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  settings,
  onUserChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'oauth' | 'backup'>('oauth');

  // OAuth states
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Backup login states (Sheriff credentials)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [submittingBackup, setSubmittingBackup] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      const isAllowedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.netlify.app') ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');

      if (!isAllowedOrigin) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const authedUser = event.data.user;
        if (authedUser) {
          onUserChanged(authedUser);
          onClose();
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onUserChanged, onClose]);

  if (!isOpen) return null;

  const handleStartOAuth = async () => {
    setOauthLoading(true);
    setOauthError(null);
    try {
      const { url } = await api.getDiscordAuthUrl();
      const authWindow = window.open(
        url,
        'discord_oauth_popup',
        'width=600,height=750,menubar=no,toolbar=no'
      );
      if (!authWindow) {
        setOauthError('Спливаюче вікно заблоковано браузером. Будь ласка, дозвольте pop-up для сайту.');
      }
    } catch (err: any) {
      setOauthError(err.message || 'Не вдалося ініціювати вхід через Discord');
    } finally {
      setOauthLoading(false);
    }
  };

  const handleBackupLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setBackupError('Введіть логін та пароль');
      return;
    }

    setSubmittingBackup(true);
    setBackupError(null);
    try {
      const res = await api.backupLogin({
        login: loginUsername.trim(),
        password: loginPassword.trim(),
      });

      onUserChanged(res.user);
      onClose();
    } catch (err: any) {
      setBackupError(err.message || 'Помилка авторизації');
    } finally {
      setSubmittingBackup(false);
    }
  };

  const leaderTitle = settings?.roleTitles?.leader || 'Шеф Департаменту / Лідер';
  const instructorTitle = settings?.roleTitles?.instructor || 'Інструктор Академії';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Авторизація в системі</h3>
              <p className="text-xs text-slate-400">Вхід за ролями фракції або резервний доступ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('oauth')}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              activeTab === 'oauth'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Вхід через Discord OAuth
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              activeTab === 'backup'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Вхід для Куратора
          </button>
        </div>

        {/* Tab 1: OAuth2 Flow */}
        {activeTab === 'oauth' && (
          <div className="p-6 space-y-4">
            <div className="text-xs text-slate-300 leading-relaxed">
              Авторизуйтесь через Discord для автоматичної перевірки ваших ролей на сервері фракції:
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                <span className="text-amber-400 font-bold">👑</span>
                <div>
                  <div className="font-bold text-white">{leaderTitle}</div>
                  <div className="text-[11px] text-slate-400">Повний доступ: керування ролями, тестами та Discord Webhook.</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                <span className="text-indigo-400 font-bold">🎓</span>
                <div>
                  <div className="font-bold text-white">{instructorTitle}</div>
                  <div className="text-[11px] text-slate-400">Видача одноразових посилань кадетам та винесення вердиктів.</div>
                </div>
              </div>
            </div>

            {oauthError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {oauthError}
              </div>
            )}

            <button
              type="button"
              onClick={handleStartOAuth}
              disabled={oauthLoading}
              className="w-full py-3 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#5865F2]/20 transition-all disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{oauthLoading ? 'Відкриття вікна...' : 'Увійти з Discord'}</span>
            </button>
          </div>
        )}

        {/* Tab 2: Backup Login for Sheriff */}
        {activeTab === 'backup' && (
          <form onSubmit={handleBackupLogin} className="p-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 leading-relaxed">
              🔒 <strong>Вхід Куратора фракції:</strong> службовий доступ для конфігурації системи та зміни параметрів.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Логін Шерифа:
              </label>
              <input
                type="text"
                placeholder="Введіть логін..."
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Захисний пароль / PIN:
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {backupError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium">
                {backupError}
              </div>
            )}

            <button
              type="submit"
              disabled={submittingBackup}
              className="w-full py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              <span>{submittingBackup ? 'Перевірка...' : 'Увійти як Шериф'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
