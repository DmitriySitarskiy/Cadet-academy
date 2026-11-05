import React, { useState } from 'react';
import {
  Shield,
  Users,
  FileText,
  Send,
  Radio,
  History,
  ChevronDown,
  Check,
  Key,
  Lock,
  LogIn,
  LogOut,
} from 'lucide-react';
import { User, AppSettings } from '../types';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  currentUser: User | null;
  allUsers: User[];
  onSwitchUser: (userId: string) => void;
  settings: AppSettings | null;
  onOpenInstructorsModal: () => void;
  onOpenDiscordAuth: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  allUsers,
  onSwitchUser,
  settings,
  onOpenInstructorsModal,
  onOpenDiscordAuth,
  onLogout,
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const isLeader = currentUser?.role === 'leader';
  const roleTitle = currentUser?.role === 'leader'
    ? (settings?.roleTitles?.leader || 'Шеф / Лідер')
    : (settings?.roleTitles?.instructor || 'Інструктор Академії');

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 sm:gap-6 h-16 min-w-0">
          {/* Zone 1: Wordmark & Shield */}
          <div className="flex items-center gap-2.5 shrink-0 min-w-0 max-w-[200px] sm:max-w-[280px]">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0 truncate">
              <span className="text-sm sm:text-base font-bold tracking-tight text-white block leading-tight truncate">
                {settings?.academyName || 'Академія Кадетів'}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-400 block truncate">
                {settings?.factionTag || 'Система іспитів та сертифікації'}
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation Links (Adaptive) */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-xs xl:text-sm font-medium">
            <button
              onClick={() => onSelectTab('results')}
              className={`whitespace-nowrap transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${
                currentTab === 'results' ? 'text-amber-400 bg-amber-400/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Результати</span>
            </button>

            <button
              onClick={() => onSelectTab('generator')}
              className={`whitespace-nowrap transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${
                currentTab === 'generator' ? 'text-amber-400 bg-amber-400/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              <span>Видати посилання</span>
            </button>

            <button
              onClick={() => onSelectTab('tests')}
              className={`whitespace-nowrap transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${
                currentTab === 'tests' ? 'text-amber-400 bg-amber-400/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>Банк тестів</span>
            </button>

            <button
              onClick={() => onSelectTab('discord')}
              className={`whitespace-nowrap transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${
                currentTab === 'discord' ? 'text-amber-400 bg-amber-400/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span>Discord Webhook</span>
              {!isLeader && <Lock className="w-3 h-3 text-amber-500/80 shrink-0" />}
            </button>

            {/* Roles & Security Center (Visible to Leader) */}
            <button
              onClick={() => onSelectTab('roles')}
              className={`whitespace-nowrap transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${
                currentTab === 'roles' ? 'text-amber-400 bg-amber-400/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Key className="w-3.5 h-3.5 shrink-0" />
              <span>Ролі та Доступ</span>
            </button>

            <button
              onClick={() => onSelectTab('cadets')}
              className={`whitespace-nowrap transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${
                currentTab === 'cadets' ? 'text-amber-400 bg-amber-400/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span>Історія</span>
            </button>
          </nav>

          {/* Zone 3: Active User Switcher & Discord Auth Action */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Discord Auth Quick Button */}
            <button
              onClick={onOpenDiscordAuth}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/30 text-xs text-[#5865F2] hover:text-white transition-all font-medium"
              title="Авторизація через Discord / Ролька"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Discord Вхід</span>
            </button>

            {/* User Profile dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-200 transition-colors"
                title="Перемкнути роль / акаунт"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${isLeader ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <div className="text-left min-w-0">
                  <div className="font-semibold text-white truncate max-w-[85px] sm:max-w-[130px]">
                    {currentUser?.name || 'Інструктор'}
                  </div>
                  <div className="text-[9px] text-amber-400 uppercase tracking-wider font-mono truncate max-w-[110px]">
                    {roleTitle}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800/80">
                    Зміна активного інструктора
                  </div>
                  {allUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        onSwitchUser(u.id);
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800/80 text-slate-200 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-white">{u.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {u.role === 'leader' ? '⭐ Лідер' : '🎓 Інструктор'} · {u.staticId || 'Без статіка'}
                        </div>
                      </div>
                      {currentUser?.id === u.id && <Check className="w-4 h-4 text-amber-400" />}
                    </button>
                  ))}

                  <div className="pt-2 mt-1 border-t border-slate-800/80 px-2">
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onOpenInstructorsModal();
                      }}
                      className="w-full text-center py-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium rounded-lg hover:bg-amber-500/10 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Керування штатом інструкторів
                    </button>
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full text-center py-1.5 text-xs text-red-400 hover:text-red-300 font-medium rounded-lg hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Вийти з акаунта
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => onSelectTab('generator')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shadow-sm shadow-amber-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              Видати іспит
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
