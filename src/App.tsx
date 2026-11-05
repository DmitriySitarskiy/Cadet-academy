/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ResultsTable } from './components/ResultsTable';
import { InstructorPanel } from './components/InstructorPanel';
import { LeaderTestsAdmin } from './components/LeaderTestsAdmin';
import { DiscordWebhookSettings } from './components/DiscordWebhookSettings';
import { ResultReviewModal } from './components/ResultReviewModal';
import { CadetLookupModal } from './components/CadetLookupModal';
import { InstructorAccountsModal } from './components/InstructorAccountsModal';
import { ExamTaker } from './components/ExamTaker';
import { RoleManager } from './components/RoleManager';
import { DiscordAuthModal } from './components/DiscordAuthModal';
import { User, AppSettings, TestConfig, ExamResult } from './types';
import { api } from './services/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tests, setTests] = useState<TestConfig[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);

  const [currentTab, setCurrentTab] = useState<string>('results');
  const [loading, setLoading] = useState<boolean>(true);

  // Active Modals & Views
  const [cadetExamToken, setCadetExamToken] = useState<string | null>(null);
  const [reviewResultId, setReviewResultId] = useState<string | null>(null);
  const [showCadetLookup, setShowCadetLookup] = useState<boolean>(false);
  const [showInstructorsModal, setShowInstructorsModal] = useState<boolean>(false);
  const [showDiscordAuth, setShowDiscordAuth] = useState<boolean>(false);

  // Check URL hash / query on initial load or change
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
      const [sessionData, testsData, resultsData] = await Promise.all([
        api.getSession(),
        api.getTests(),
        api.getResults(),
      ]);

      setCurrentUser(sessionData.user);
      setAllUsers(sessionData.allUsers);
      setSettings(sessionData.settings);
      setTests(testsData);
      setResults(resultsData);
    } catch (e) {
      console.error('Error loading initial data', e);
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
    localStorage.removeItem('cadet_current_user_id');
    setCurrentUser(null);
    setShowDiscordAuth(true);
  };

  const handleSwitchUser = async (userId: string) => {
    try {
      const res = await api.switchUser(userId);
      setCurrentUser(res.user);
    } catch (e) {
      console.error(e);
    }
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

  const handleSelectTab = (tab: string) => {
    if (tab === 'cadets') {
      setShowCadetLookup(true);
    } else {
      setCurrentTab(tab);
    }
  };

  // If Cadet Mode is active, render isolated ExamTaker view
  if (cadetExamToken) {
    return <ExamTaker token={cadetExamToken} onExit={handleExitCadetExam} />;
  }

  const isStaff = currentUser && (currentUser.role === 'leader' || currentUser.role === 'instructor');
  
  if (!isStaff && !loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <span className="text-3xl">🛡️</span>
          </div>

          <div>
            <h1 className="text-xl font-bold text-white">
              {settings?.academyName || 'Академія Кадетів'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {settings?.factionTag || 'Службовий портал викладацького корпусу'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-400 text-left space-y-2">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <span>🔒</span> Закрита службова зона
            </div>
            <p className="leading-relaxed">
              Доступ до кабінету дозволено виключно <strong>Інструкторам Академії</strong> та <strong>Шерифу / Куратору</strong>.
            </p>
            <p className="text-[11px] text-slate-500">
              Кадети складають іспити за персональними посиланнями від інструкторів. Власний кабінет для кадетів не передбачено регламентом.
            </p>
          </div>

          <button
            onClick={() => setShowDiscordAuth(true)}
            className="w-full py-3 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#5865F2]/20 transition-all cursor-pointer"
          >
            <span>Вхід для Інструкторів та Шерифа</span>
          </button>
        </div>

        <DiscordAuthModal
          isOpen={showDiscordAuth}
          onClose={() => setShowDiscordAuth(false)}
          currentUser={currentUser}
          settings={settings}
          onUserChanged={(u) => {
            localStorage.setItem('cadet_current_user_id', u.id);
            setCurrentUser(u);
            loadAllData();
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      <Header
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        currentUser={currentUser}
        allUsers={allUsers}
        onSwitchUser={handleSwitchUser}
        settings={settings}
        onOpenInstructorsModal={() => setShowInstructorsModal(true)}
        onOpenDiscordAuth={() => setShowDiscordAuth(true)}
        onLogout={handleLogout}
      />

      {/* Adaptive Mobile/Tablet Tab Bar */}
      <div className="lg:hidden bg-slate-900/90 border-b border-slate-800 px-3 py-2 overflow-x-auto sticky top-16 z-30">
        <div className="flex items-center gap-1.5 min-w-max text-xs">
          <button
            onClick={() => setCurrentTab('results')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              currentTab === 'results' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Результати
          </button>
          <button
            onClick={() => setCurrentTab('generator')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              currentTab === 'generator' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Видати посилання
          </button>
          <button
            onClick={() => setCurrentTab('tests')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              currentTab === 'tests' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Банк тестів
          </button>
          <button
            onClick={() => setCurrentTab('discord')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              currentTab === 'discord' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Discord Webhook
          </button>
          <button
            onClick={() => setCurrentTab('roles')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              currentTab === 'roles' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Ролі та Доступ
          </button>
          <button
            onClick={() => setShowCadetLookup(true)}
            className="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Історія кадета
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 min-w-0 overflow-x-hidden">
        {loading && (
          <div className="py-24 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-xs text-slate-400 font-medium">Завантаження платформи тестування...</div>
          </div>
        )}

        {!loading && (
          <>
            {currentTab === 'results' && (
              <ResultsTable
                results={results}
                tests={tests}
                onSelectResult={(id) => setReviewResultId(id)}
                onRefresh={loadAllData}
              />
            )}

            {currentTab === 'generator' && (
              <InstructorPanel
                tests={tests}
                onOpenExamAsCadet={handleOpenExamAsCadet}
              />
            )}

            {currentTab === 'tests' && (
              <LeaderTestsAdmin
                tests={tests}
                currentUser={currentUser}
                onRefreshTests={loadAllData}
              />
            )}

            {currentTab === 'discord' && (
              <DiscordWebhookSettings
                settings={settings}
                currentUser={currentUser}
                onRefreshSettings={loadAllData}
              />
            )}

            {currentTab === 'roles' && (
              <RoleManager
                settings={settings}
                currentUser={currentUser}
                onRefreshSettings={loadAllData}
              />
            )}
          </>
        )}
      </main>

      {/* Review Modal for Instructors */}
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

      {/* Cadet History Search Modal */}
      {showCadetLookup && (
        <CadetLookupModal
          onClose={() => setShowCadetLookup(false)}
          onSelectResult={(id) => setReviewResultId(id)}
        />
      )}

      {/* Instructor Accounts Modal */}
      {showInstructorsModal && (
        <InstructorAccountsModal
          instructors={allUsers}
          currentUser={currentUser}
          onClose={() => setShowInstructorsModal(false)}
          onRefresh={loadAllData}
        />
      )}

      {/* Discord Role Authentication Modal */}
      <DiscordAuthModal
        isOpen={showDiscordAuth}
        onClose={() => setShowDiscordAuth(false)}
        currentUser={currentUser}
        settings={settings}
        onUserChanged={(u) => {
          localStorage.setItem('cadet_current_user_id', u.id);
          setCurrentUser(u);
          loadAllData();
        }}
      />
    </div>
  );
}
