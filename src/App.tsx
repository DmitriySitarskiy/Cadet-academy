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
    </div>
  );
}
