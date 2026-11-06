import React from 'react';
import { LogIn, KeyRound, AlertTriangle } from 'lucide-react';
import { AppSettings } from '../types';
import { BrandMark } from './ui';
import { DEPARTMENT_NAME, ACADEMY_NAME, MOTTO_LATIN, MOTTO_UA } from '../brand';

interface SignInScreenProps {
  settings: AppSettings | null;
  error: string | null;
  onSignIn: (tab: 'oauth' | 'backup') => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ settings, error, onSignIn }) => (
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

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <div className="font-semibold text-red-200">Не вдалося увійти</div>
              <div className="mt-1 leading-relaxed text-red-300/90">{error}</div>
            </div>
          </div>
        )}

        <button
          onClick={() => onSignIn('oauth')}
          className="btn mt-8 w-full !bg-[#5865F2] !py-3 text-white hover:!bg-[#4752c4]"
        >
          <LogIn className="h-4 w-4" />
          Увійти через Discord
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-600">
          <span className="h-px flex-1 bg-[#1b2740]" />
          або
          <span className="h-px flex-1 bg-[#1b2740]" />
        </div>

        <button onClick={() => onSignIn('backup')} className="btn btn-secondary w-full">
          <KeyRound className="h-4 w-4 text-amber-400" />
          Вхід для куратора
        </button>
        <p className="hint mt-3 text-center">Куратор входить за логіном і паролем, якщо Discord недоступний.</p>
      </div>
    </div>
  </div>
);
