import React, { useState } from 'react';
import { Shield, Users, FileText, Send, Radio, History, ChevronDown, Check } from 'lucide-react';
import { User, AppSettings } from '../types';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  currentUser: User | null;
  allUsers: User[];
  onSwitchUser: (userId: string) => void;
  settings: AppSettings | null;
  onOpenInstructorsModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  allUsers,
  onSwitchUser,
  settings,
  onOpenInstructorsModal,
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Wordmark & Shield */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white block leading-tight whitespace-nowrap">
                {settings?.academyName || 'Академія Кадетів'}
              </span>
              <span className="text-xs text-slate-400 block whitespace-nowrap">
                {settings?.factionTag || 'Система іспитів та сертифікації'}
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => onSelectTab('results')}
              className={`whitespace-nowrap transition-colors flex items-center gap-2 py-1 ${
                currentTab === 'results' ? 'text-amber-400 border-b-2 border-amber-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              Журнал результатів
            </button>

            <button
              onClick={() => onSelectTab('generator')}
              className={`whitespace-nowrap transition-colors flex items-center gap-2 py-1 ${
                currentTab === 'generator' ? 'text-amber-400 border-b-2 border-amber-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Send className="w-4 h-4" />
              Видати посилання
            </button>

            <button
              onClick={() => onSelectTab('tests')}
              className={`whitespace-nowrap transition-colors flex items-center gap-2 py-1 ${
                currentTab === 'tests' ? 'text-amber-400 border-b-2 border-amber-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-4 h-4" />
              Банк тестів
            </button>

            <button
              onClick={() => onSelectTab('discord')}
              className={`whitespace-nowrap transition-colors flex items-center gap-2 py-1 ${
                currentTab === 'discord' ? 'text-amber-400 border-b-2 border-amber-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-4 h-4" />
              Discord Webhook
            </button>

            <button
              onClick={() => onSelectTab('cadets')}
              className={`whitespace-nowrap transition-colors flex items-center gap-2 py-1 ${
                currentTab === 'cadets' ? 'text-amber-400 border-b-2 border-amber-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              Історія кадетів
            </button>
          </nav>

          {/* Zone 3: Active User Switcher & Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-200 transition-colors"
                title="Перемкнути роль / акаунт"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="text-left">
                  <div className="font-semibold text-white truncate max-w-[120px]">
                    {currentUser?.name || 'Інструктор'}
                  </div>
                  <div className="text-[10px] text-amber-400 uppercase tracking-wider font-mono">
                    {currentUser?.role === 'leader' ? 'Лідер фракції' : 'Інструктор'}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
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
