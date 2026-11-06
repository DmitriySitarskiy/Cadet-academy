/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { SignInScreen } from './components/SignInScreen';
import { ResultsTable } from './components/ResultsTable';
import { InstructorPanel } from './components/InstructorPanel';
import { LeaderTestsAdmin } from './components/LeaderTestsAdmin';
import { DiscordWebhookSettings } from './components/DiscordWebhookSettings';
import { ResultReviewModal } from './components/ResultReviewModal';
import { CadetLookupModal } from './components/CadetLookupModal';
import { InstructorAccountsModal } from './components/InstructorAccountsModal';
import { ExamTaker } from './components/ExamTaker';
import { RoleManager } from './components/RoleManager';
import { BrandMark } from './components/ui';
import { User, AppSettings, TestConfig, ExamResult } from './types';
import { api } from './services/api';

const PAGE_TITLES: Record<string, string> = {
  results: 'Результати',
  generator: 'Видати посилання',
  tests: 'Банк тестів',
  discord: 'Discord-вебхук',
  roles: 'Ролі та доступ',
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tests, setTests] = useState<TestConfig[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);

  const [currentTab, setCurrentTab] = useState<string>('results');
  const [loading, setLoading] = useState<boolean>(true);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  const [globalAuthError, setGlobalAuthError] = useState<string | null>(null);

  // Активні модальні вікна та режими
  const [cadetExamToken, setCadetExamToken] = useState<string | null>(null);
  const [reviewResultId, setReviewResultId] = useState<string | null>(null);
  const [showCadetLookup, setShowCadetLookup] = useState<boolean>(false);
  const [showInstructorsModal, setShowInstructorsModal] = useState<boolean>(false);

  // Токен іспиту або результат у хеші / параметрах адреси
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash || '';
      const params = new URLSearchParams(window.location.search);
      const tokenFromQuery = params.get('token');

      if (tokenFromQuery) {
        setCadetExamToken(tokenFromQuery);
        return;
      }

      if (hash.startsWith('#exam-')) {
        const token = hash.replace('#exam-', '');
        if (token) {
          setCadetExamToken(token);
          return;
        }
      }

      if (hash.startsWith('#result-')) {
        const resId = hash.replace('#result-', '');
        if (resId) {
          setReviewResultId(resId);
          return;
        }
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      // 1) Спершу сесія: вона публічна й повертає користувача (за cookie) та налаштування без секретів
      const sessionData = await api.getSession();
      const user = sessionData?.user || null;
      setCurrentUser(user);
      setAllUsers(sessionData?.allUsers || []);
      setSettings(sessionData?.settings || null);

      // 2) Тести та результати — лише для авторизованого персоналу (інакше сервер відповість 401/403)
      const isStaffUser = user && (user.role === 'leader' || user.role === 'instructor');
      if (isStaffUser) {
        const [testsData, resultsData] = await Promise.all([
          api.getTests().catch((e) => {
            console.error(e);
            return [] as TestConfig[];
          }),
          api.getResults(),
        ]);
        setTests(testsData || []);
        setResults(resultsData || []);
      } else {
        setTests([]);
        setResults([]);
      }
    } catch (e) {
      console.error('Error loading initial data', e);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      console.error(e);
    }
    setCurrentUser(null);
    setTests([]);
    setResults([]);
    setCurrentTab('results');
  };

  const handleOpenExamAsCadet = (token: string) => {
    window.location.hash = `exam-${token}`;
    setCadetExamToken(token);
  };

  const handleExitCadetExam = () => {
    window.location.hash = '';
    setCadetExamToken(null);
    loadAllData();
    setCurrentTab('results');
  };

  const handleUserChanged = (u: User) => {
    setGlobalAuthError(null);
    setCurrentUser(u);
    loadAllData();
  };

  // Режим кадета: окремий екран складання іспиту
  if (cadetExamToken) {
    return <ExamTaker token={cadetExamToken} onExit={handleExitCadetExam} />;
  }

  const isStaff = Boolean(currentUser && (currentUser.role === 'leader' || currentUser.role === 'instructor'));
  const isLeader = currentUser?.role === 'leader';

  // Поки сесія завантажується
  if (loading && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060b16]">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          Завантаження…
        </div>
      </div>
    );
  }

  // Екран входу
  if (!isStaff) {
    return (
      <SignInScreen
        settings={settings}
        error={globalAuthError}
        onUserChanged={handleUserChanged}
        onAuthError={setGlobalAuthError}
      />
    );
  }

  // Адмін-розділи доступні лише керівнику
  const tab = !isLeader && (currentTab === 'discord' || currentTab === 'roles') ? 'results' : currentTab;
  const pendingCount = results.filter((r) => r.status === 'pending_review').length;

  return (
    <div className="min-h-screen bg-[#060b16] text-slate-100 lg:flex">
      <Sidebar
        currentTab={tab}
        onSelectTab={setCurrentTab}
        currentUser={currentUser}
        settings={settings}
        pendingCount={pendingCount}
        onOpenCadetLookup={() => setShowCadetLookup(true)}
        onOpenInstructors={() => setShowInstructorsModal(true)}
        onLogout={handleLogout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <div className="min-w-0 flex-1">
        {/* Верхня смуга для телефонів і планшетів */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#1b2740] bg-[#080f1d]/95 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setMenuOpen(true)} className="btn btn-ghost !p-2" aria-label="Відкрити меню">
            <Menu className="h-5 w-5" />
          </button>
          <BrandMark size={28} />
          <span className="truncate text-sm font-semibold text-white">{PAGE_TITLES[tab] || 'Кабінет'}</span>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              Оновлення даних…
            </div>
          ) : (
            <>
              {tab === 'results' && (
                <ResultsTable
                  results={results}
                  tests={tests}
                  onSelectResult={(id) => setReviewResultId(id)}
                  onRefresh={loadAllData}
                />
              )}

              {tab === 'generator' && <InstructorPanel tests={tests} onOpenExamAsCadet={handleOpenExamAsCadet} />}

              {tab === 'tests' && (
                <LeaderTestsAdmin tests={tests} currentUser={currentUser} onRefreshTests={loadAllData} />
              )}

              {tab === 'discord' && (
                <DiscordWebhookSettings settings={settings} currentUser={currentUser} onRefreshSettings={loadAllData} />
              )}

              {tab === 'roles' && (
                <RoleManager settings={settings} currentUser={currentUser} onRefreshSettings={loadAllData} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Перевірка роботи інструктором */}
      {reviewResultId && (
        <ResultReviewModal
          resultId={reviewResultId}
          onClose={() => {
            setReviewResultId(null);
            if (window.location.hash.startsWith('#result-')) {
              window.location.hash = '';
            }
          }}
          onUpdated={loadAllData}
        />
      )}

      {/* Історія кадета */}
      {showCadetLookup && (
        <CadetLookupModal onClose={() => setShowCadetLookup(false)} onSelectResult={(id) => setReviewResultId(id)} />
      )}

      {/* Інструктори */}
      {showInstructorsModal && (
        <InstructorAccountsModal
          instructors={allUsers}
          currentUser={currentUser}
          onClose={() => setShowInstructorsModal(false)}
          onRefresh={loadAllData}
        />
      )}

    </div>
  );
}
