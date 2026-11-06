import React, { useState, useEffect, useRef } from 'react';
import { LogIn, KeyRound, AlertTriangle } from 'lucide-react';
import { AppSettings, User } from '../types';
import { api } from '../services/api';
import { BrandMark } from './ui';
import { DEPARTMENT_NAME, ACADEMY_NAME, MOTTO_LATIN, MOTTO_UA } from '../brand';

interface SignInScreenProps {
  settings: AppSettings | null;
  error: string | null;
  onUserChanged: (user: User) => void;
  onAuthError: (msg: string | null) => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ settings, error, onUserChanged, onAuthError }) => {
  const [oauthLoading, setOauthLoading] = useState(false);
  const [showCurator, setShowCurator] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const cbRef = useRef({ onUserChanged, onAuthError });
  cbRef.current = { onUserChanged, onAuthError };

  useEffect(() => {
    const handle = (data: any) => {
      if (data?.type === 'OAUTH_AUTH_SUCCESS' && data.user) {
        setLocalError(null);
        cbRef.current.onUserChanged(data.user);
      } else if (data?.type === 'OAUTH_AUTH_ERROR') {
        cbRef.current.onAuthError(data.error || 'У вас немає ролі Інструктора або Шерифа на сервері фракції.');
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      handle(e.data);
    };
    window.addEventListener('message', onMessage);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('cadet_auth');
      channel.onmessage = (e) => handle(e.data);
    } catch {
      /* BroadcastChannel недоступний */
    }
    return () => {
      window.removeEventListener('message', onMessage);
      channel?.close();
    };
  }, []);

  const startOAuth = async () => {
    setOauthLoading(true);
    setLocalError(null);
    onAuthError(null);
    try {
      const { url } = await api.getDiscordAuthUrl();
      const w = window.open(url, 'discord_oauth_popup', 'width=600,height=750,menubar=no,toolbar=no');
      if (!w) setLocalError('Спливаюче вікно заблоковано браузером. Дозвольте pop-up для цього сайту.');
    } catch (err: any) {
      setLocalError(err.message || 'Не вдалося розпочати вхід через Discord');
    } finally {
      setOauthLoading(false);
    }
  };

  const submitCurator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) {
      setLocalError('Введіть логін і пароль');
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    onAuthError(null);
    try {
      const res = await api.backupLogin({ login: login.trim(), password: password.trim() });
      onUserChanged(res.user);
    } catch (err: any) {
      setLocalError(err.message || 'Помилка авторизації');
    } finally {
      setSubmitting(false);
    }
  };

  const shownError = localError || error;

  return (
  <div className="min-h-screen bg-[#060b16] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    {/* Ліва частина: хто ми */}
    <div className="relative flex flex-col justify-between overflow-hidden border-b border-[#1b2740] px-6 py-8 sm:px-12 sm:py-12 lg:border-b-0 lg:border-r">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-amber-400/[0.07] blur-3xl"
      />
      <div className="relative flex items-center gap-3">
        <BrandMark size={44} />
        <div className="text-base font-semibold leading-tight text-white">{DEPARTMENT_NAME}</div>
      </div>

      <div className="relative my-14 lg:my-0">
        <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
          {settings?.academyName || ACADEMY_NAME}
        </h1>
        <p className="mt-5 font-serif text-3xl italic leading-tight text-amber-200/90">{MOTTO_LATIN}</p>
        <p className="mt-1.5 text-sm text-slate-500">{MOTTO_UA}</p>

        <p className="mt-12 max-w-[44ch] border-t border-[#1b2740] pt-6 text-base leading-relaxed text-slate-400">
          Кабінет інструкторів: видавайте одноразові посилання, перевіряйте роботи й виносьте вердикти. Результат
          одразу потрапляє у вашу гілку в Discord.
        </p>
      </div>

      <p className="relative hidden text-sm text-slate-500 lg:block">
        Кадети складають іспит за персональним посиланням від інструктора. Входити їм не потрібно.
      </p>
    </div>

    {/* Права частина: вхід */}
    <div className="flex items-center justify-center px-6 py-12 sm:px-12">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Вхід для персоналу</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Потрібна роль інструктора або керівника на Discord-сервері фракції.
        </p>

        {shownError && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <div className="font-semibold text-red-200">Не вдалося увійти</div>
              <div className="mt-1 leading-relaxed text-red-300/90">{shownError}</div>
            </div>
          </div>
        )}

        <button
          onClick={startOAuth}
          disabled={oauthLoading}
          className="btn mt-8 w-full !bg-[#5865F2] !py-3 text-white hover:!bg-[#4752c4]"
        >
          <LogIn className="h-4 w-4" />
          {oauthLoading ? 'Відкриваємо Discord…' : 'Увійти через Discord'}
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-600">
          <span className="h-px flex-1 bg-[#1b2740]" />
          або
          <span className="h-px flex-1 bg-[#1b2740]" />
        </div>

        {!showCurator ? (
          <>
            <button onClick={() => setShowCurator(true)} className="btn btn-secondary w-full">
              <KeyRound className="h-4 w-4 text-amber-400" />
              Вхід для куратора
            </button>
            <p className="hint mt-3 text-center">Куратор входить за логіном і паролем, якщо Discord недоступний.</p>
          </>
        ) : (
          <form onSubmit={submitCurator} className="space-y-3">
            <div>
              <label className="label" htmlFor="cur-login">Логін</label>
              <input id="cur-login" className="field" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="cur-pass">Пароль</label>
              <input id="cur-pass" type="password" className="field" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={submitting} className="btn btn-secondary w-full">
              <KeyRound className="h-4 w-4 text-amber-400" />
              {submitting ? 'Перевірка…' : 'Увійти як куратор'}
            </button>
          </form>
        )}
      </div>
    </div>
  </div>
);
};
