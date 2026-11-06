import React from 'react';
import { FileText, Send, History, BookOpen, Radio, Key, Users, LogOut, X } from 'lucide-react';
import { User, AppSettings } from '../types';
import { BrandMark } from './ui';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  currentUser: User | null;
  settings: AppSettings | null;
  pendingCount: number;
  onOpenCadetLookup: () => void;
  onOpenInstructors: () => void;
  onLogout: () => void;
  open: boolean; // мобільне меню
  onClose: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, badge, onClick }) => (
  <button
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`relative w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'bg-white/[0.05] text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]'
    }`}
  >
    {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-amber-400" />}
    <span className={`shrink-0 ${active ? 'text-amber-400' : ''}`}>{icon}</span>
    <span className="flex-1 text-left truncate">{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className="num min-w-[1.4rem] rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-xs font-bold text-slate-950">
        {badge}
      </span>
    )}
  </button>
);

const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 pb-1.5 pt-5 text-xs font-medium text-slate-500">{children}</div>
);

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  settings,
  pendingCount,
  onOpenCadetLookup,
  onOpenInstructors,
  onLogout,
  open,
  onClose,
}) => {
  const isLeader = currentUser?.role === 'leader';
  const roleTitle = isLeader
    ? settings?.roleTitles?.leader || 'Лідер'
    : settings?.roleTitles?.instructor || 'Інструктор';

  // Після вибору пункту мобільне меню закривається
  const go = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const tab = (id: string) => go(() => onSelectTab(id));

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[#1b2740] bg-[#080f1d] transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:shrink-0 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Головне меню"
      >
        {/* Назва академії */}
        <div className="flex items-center gap-3 px-4 h-[4.5rem] border-b border-[#1b2740]">
          <BrandMark size={38} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.95rem] font-semibold leading-tight text-white">
              {settings?.academyName || 'Академія кадетів'}
            </div>
            <div className="truncate text-xs text-slate-500 mt-0.5">{settings?.factionTag || 'Кабінет інструкторів'}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost !p-1.5 lg:hidden" aria-label="Закрити меню">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Навігація */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <GroupTitle>Іспити</GroupTitle>
          <div className="space-y-0.5">
            <NavItem
              icon={<FileText className="w-[1.1rem] h-[1.1rem]" />}
              label="Результати"
              badge={pendingCount}
              active={currentTab === 'results'}
              onClick={tab('results')}
            />
            <NavItem
              icon={<Send className="w-[1.1rem] h-[1.1rem]" />}
              label="Видати посилання"
              active={currentTab === 'generator'}
              onClick={tab('generator')}
            />
            <NavItem
              icon={<History className="w-[1.1rem] h-[1.1rem]" />}
              label="Історія кадета"
              onClick={go(onOpenCadetLookup)}
            />
          </div>

          <GroupTitle>Матеріали</GroupTitle>
          <div className="space-y-0.5">
            <NavItem
              icon={<BookOpen className="w-[1.1rem] h-[1.1rem]" />}
              label="Банк тестів"
              active={currentTab === 'tests'}
              onClick={tab('tests')}
            />
          </div>

          {isLeader && (
            <>
              <GroupTitle>Адміністрування</GroupTitle>
              <div className="space-y-0.5">
                <NavItem
                  icon={<Radio className="w-[1.1rem] h-[1.1rem]" />}
                  label="Discord-вебхук"
                  active={currentTab === 'discord'}
                  onClick={tab('discord')}
                />
                <NavItem
                  icon={<Key className="w-[1.1rem] h-[1.1rem]" />}
                  label="Ролі та доступ"
                  active={currentTab === 'roles'}
                  onClick={tab('roles')}
                />
                <NavItem
                  icon={<Users className="w-[1.1rem] h-[1.1rem]" />}
                  label="Інструктори"
                  onClick={go(onOpenInstructors)}
                />
              </div>
            </>
          )}
        </nav>

        {/* Поточний користувач */}
        <div className="border-t border-[#1b2740] p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            {currentUser?.discordAvatar ? (
              <img src={currentUser.discordAvatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#18243d] text-sm font-semibold text-amber-300">
                {(currentUser?.name || '?').trim().charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{currentUser?.name}</div>
              <div className="truncate text-xs text-slate-500">{roleTitle}</div>
            </div>
            <button
              onClick={go(onLogout)}
              className="btn btn-ghost !p-2"
              title="Вийти з акаунта"
              aria-label="Вийти з акаунта"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
