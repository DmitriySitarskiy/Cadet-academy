import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  LogIn,
  LogOut,
  Sparkles,
  Key,
  Layers,
  Radio,
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
  const [activeTab, setActiveTab] = useState<'oauth' | 'direct'>('oauth');

  // OAuth states
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Direct login states
  const [discordId, setDiscordId] = useState(currentUser?.discordId || '');
  const [discordUsername, setDiscordUsername] = useState(currentUser?.discordUsername || '');
  const [name, setName] = useState(currentUser?.name || '');
  const [staticId, setStaticId] = useState(currentUser?.staticId || '');
  const [selectedRole, setSelectedRole] = useState<'leader' | 'instructor'>(
    currentUser?.role === 'leader' ? 'leader' : 'instructor'
  );
  const [submittingDirect, setSubmittingDirect] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  // Listen for popup postMessage according to oauth-integration skill
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      
      // Дозволяємо поточний домен (Netlify), а також локальні хости
      const isAllowedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.netlify.app') ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');

      if (!isAllowedOrigin) {
        return;
      }

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
        setOauthError('Спливаюче вікно заблоковано браузером. Будь ласка, дозвольте pop-up для цього сайту.');
      }
    } catch (err: any) {
      setOauthError(err.message || 'Не вдалося ініціювати вхід через Discord');
    } finally {
      setOauthLoading(false);
    }
  };

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discordId.trim()) {
      setDirectError('Вкажіть ваш Discord ID');
      return;
    }

    setSubmittingDirect(true);
    setDirectError(null);
    try {
      const res = await api.directDiscordLogin({
        discordId: discordId.trim(),
        discordUsername: discordUsername.trim() || undefined,
        role: selectedRole,
        name: name.trim() || undefined,
        staticId: staticId.trim() || undefined,
      });

      onUserChanged(res.user);
      onClose();
    } catch (err: any) {
      setDirectError(err.message || 'Помилка авторизації');
    } finally {
      setSubmittingDirect(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await api.logout();
      onUserChanged(res.user);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Помилка виходу');
    }
  };

  const leaderTitle = settings?.roleTitles?.leader || 'Лідер фракції';
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
              <h3 className="text-base font-bold text-white">Авторизація через Discord</h3>
              <p className="text-xs text-slate-400">Вхід за ролями фракційного сервера</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current User Card */}
        {currentUser && (
          <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                {currentUser.discordAvatar ? (
                  <img
                    src={currentUser.discordAvatar}
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  currentUser.name[0]?.toUpperCase() || 'U'
                )}
              </div>
              <div>
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span>{currentUser.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({currentUser.staticId || '#ID'})</span>
                </div>
                <div className="text-[10px] text-amber-400 font-medium">
                  {currentUser.role === 'leader' ? `👑 ${leaderTitle}` : `🎓 ${instructorTitle}`}
                  {currentUser.discordId && ` · @${currentUser.discordId}`}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-colors text-[11px] font-semibold flex items-center gap-1"
              title="Вийти з акаунта"
            >
              <LogOut className="w-3 h-3" />
              <span>Змінити</span>
            </button>
          </div>
        )}

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
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              activeTab === 'direct'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Вхід за Discord ID / Тест
          </button>
        </div>

        {/* Tab 1: OAuth2 Flow */}
        {activeTab === 'oauth' && (
          <div className="p-6 space-y-4">
            <div className="text-xs text-slate-300 leading-relaxed">
              Авторизуйтесь через свій обліковий запис Discord. Система автоматично перевірить ваші ролі на сервері фракції (
              <strong>{settings?.academyName || 'Академія'}</strong>) та надасть доступ відповідно до ваших обов'язків:
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                <span className="text-amber-400 font-bold">👑</span>
                <div>
                  <div className="font-bold text-white">{leaderTitle}</div>
                  <div className="text-[11px] text-slate-400">
                    Повний доступ: керування Discord Webhook, створення тестів, редагування ролей та інструкторів.
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                <span className="text-indigo-400 font-bold">🎓</span>
                <div>
                  <div className="font-bold text-white">{instructorTitle}</div>
                  <div className="text-[11px] text-slate-400">
                    Доступ до видачі одноразових посилань кадетам, перевірки та винесення вердиктів.
                  </div>
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

            {!settings?.discordClientId && (
              <div className="text-[11px] text-slate-500 text-center">
                💡 Якщо Discord Client ID ще не налаштовано лідером, скористайтеся вкладкою <strong>«Вхід за Discord ID / Тест»</strong>.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Direct Discord ID / Simulator */}
        {activeTab === 'direct' && (
          <form onSubmit={handleDirectLogin} className="p-6 space-y-4">
            <div className="text-xs text-slate-300">
              Введіть ваш Discord ID або оберіть роль для миттєвого тестування чи роботи інструктора:
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Discord ID (або нікнейм): <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="напр. 384918274019283741 або koval_leader"
                value={discordId}
                onChange={(e) => setDiscordId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ім'я / Позивний:
                </label>
                <input
                  type="text"
                  placeholder="Олександр Коваль"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Статік (#ID):
                </label>
                <input
                  type="text"
                  placeholder="#1001"
                  value={staticId}
                  onChange={(e) => setStaticId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Роль у системі:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole('leader')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    selectedRole === 'leader'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span>👑</span>
                  <span>{leaderTitle}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('instructor')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    selectedRole === 'instructor'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span>🎓</span>
                  <span>{instructorTitle}</span>
                </button>
              </div>
            </div>

            {directError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {directError}
              </div>
            )}

            <button
              type="submit"
              disabled={submittingDirect}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{submittingDirect ? 'Авторизація...' : 'Підтвердити вхід'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
