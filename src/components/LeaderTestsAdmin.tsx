import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Clock,
  Award,
  RefreshCw,
  HelpCircle,
  ShieldAlert,
  Save,
  X,
  FileQuestion,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { TestConfig, Question, QuestionType, User } from '../types';
import { api } from '../services/api';
import { PageHeader, EmptyState } from './ui';

interface LeaderTestsAdminProps {
  tests: TestConfig[];
  currentUser: User | null;
  onRefreshTests: () => void;
}

export const LeaderTestsAdmin: React.FC<LeaderTestsAdminProps> = ({
  tests,
  currentUser,
  onRefreshTests,
}) => {
  const canManageTests = currentUser?.role === 'leader' || currentUser?.role === 'instructor';
  
  const [editingTest, setEditingTest] = useState<Partial<TestConfig> | null>(null);
  const [selectedTestForBank, setSelectedTestForBank] = useState<TestConfig | null>(null);

  // Question editing state
  const [editingQuestion, setEditingQuestion] = useState<{
    testId: string;
    question: Partial<Question>;
    isNew: boolean;
  } | null>(null);

  const [saving, setSaving] = useState(false);

  // Open modal to create a test
  const handleCreateTest = () => {
    setEditingTest({
      id: `new_${Date.now()}`,
      title: '',
      description: '',
      category: 'Загальне',
      timeLimitMinutes: 15,
      passingScorePercent: 80,
      randomQuestionCount: 5,
      maxAttempts: 2,
      cooldownHours: 24,
      isActive: true,
      questions: [],
    });
  };

  const handleSaveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTest || !editingTest.title) return;

    setSaving(true);
    try {
      await api.saveTest(editingTest);
      setEditingTest(null);
      onRefreshTests();
    } catch (err: any) {
      alert(err.message || 'Помилка збереження тесту');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTest = async (testId: string, testTitle: string) => {
    if (!confirm(`Ви дійсно бажаєте видалити іспит "${testTitle}"?`)) return;
    try {
      await api.deleteTest(testId);
      if (selectedTestForBank?.id === testId) setSelectedTestForBank(null);
      onRefreshTests();
    } catch (err: any) {
      alert(err.message || 'Помилка видалення');
    }
  };

  // ================= QUESTIONS MANAGEMENT =================
  const handleOpenAddQuestion = (test: TestConfig) => {
    setEditingQuestion({
      testId: test.id,
      isNew: true,
      question: {
        id: `q_${Date.now()}`,
        type: 'single',
        title: '',
        category: test.category,
        description: '',
        options: ['', '', '', ''],
        correctOption: 0,
        correctOptions: [0],
        maxPoints: 1,
        explanation: '',
      },
    });
  };

  const handleEditQuestion = (test: TestConfig, q: Question) => {
    setEditingQuestion({
      testId: test.id,
      isNew: false,
      question: { ...q, options: q.options ? [...q.options] : [] },
    });
  };

  const handleDeleteQuestion = async (test: TestConfig, qid: string) => {
    if (!confirm('Видалити це питання з банку?')) return;
    const updatedQuestions = test.questions.filter((q) => q.id !== qid);
    const updatedTest = { ...test, questions: updatedQuestions };

    try {
      await api.saveTest(updatedTest);
      onRefreshTests();
      if (selectedTestForBank?.id === test.id) {
        setSelectedTestForBank(updatedTest);
      }
    } catch (err: any) {
      alert(err.message || 'Помилка видалення питання');
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !editingQuestion.question.title) return;

    const currentTest = tests.find((t) => t.id === editingQuestion.testId);
    if (!currentTest) return;

    const q = editingQuestion.question as Question;
    let questionsList = [...currentTest.questions];

    if (editingQuestion.isNew) {
      questionsList.push(q);
    } else {
      questionsList = questionsList.map((item) => (item.id === q.id ? q : item));
    }

    const updatedTest = { ...currentTest, questions: questionsList };

    setSaving(true);
    try {
      await api.saveTest(updatedTest);
      setEditingQuestion(null);
      onRefreshTests();
      if (selectedTestForBank?.id === currentTest.id) {
        setSelectedTestForBank(updatedTest);
      }
    } catch (err: any) {
      alert(err.message || 'Помилка збереження питання');
    } finally {
      setSaving(false);
    }
  };

  // Поточний іспит береться зі свіжого списку, тому зміни одразу видно
  const activeTest =
    tests.find((t) => t.id === selectedTestForBank?.id) || selectedTestForBank || tests[0] || null;

  return (
    <div>
      <PageHeader
        title="Банк тестів"
        description="Іспити, їхні правила та питання, з яких система складає білет для кожного кадета."
        actions={
          canManageTests ? (
            <button onClick={handleCreateTest} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              Новий іспит
            </button>
          ) : undefined
        }
      />

      {tests.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<FileQuestion className="h-5 w-5" />}
            title="Іспитів ще немає"
            text="Створіть перший іспит, а потім додайте до нього питання."
            action={
              canManageTests ? (
                <button onClick={handleCreateTest} className="btn btn-primary">
                  <Plus className="h-4 w-4" />
                  Новий іспит
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          {/* Список іспитів */}
          <nav aria-label="Іспити" className="panel overflow-hidden lg:sticky lg:top-6">
            <ul className="divide-y divide-[#142038]">
              {tests.map((test) => {
                const isActive = activeTest?.id === test.id;
                return (
                  <li key={test.id}>
                    <button
                      onClick={() => setSelectedTestForBank(test)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`relative w-full px-5 py-4 text-left transition-colors ${
                        isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {isActive && <span className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r bg-amber-400" />}
                      <div className={`truncate text-sm font-semibold ${isActive ? 'text-white' : 'text-slate-200'}`}>
                        {test.title}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">{test.category}</div>
                      <div className="num mt-2 text-xs text-slate-400">
                        {test.timeLimitMinutes} хв · від {test.passingScorePercent}% · {test.randomQuestionCount} з{' '}
                        {test.questions.length}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Деталі вибраного іспиту */}
          {activeTest && (
            <div className="min-w-0 space-y-5">
              <section className="panel p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight text-white">{activeTest.title}</h2>
                    <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-slate-400">
                      {activeTest.description || 'Опису немає.'}
                    </p>
                  </div>
                  {canManageTests && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => setEditingTest(activeTest)} className="btn btn-secondary">
                        <Edit2 className="h-4 w-4" />
                        Налаштування
                      </button>
                      <button
                        onClick={() => handleDeleteTest(activeTest.id, activeTest.title)}
                        className="btn btn-ghost !p-2.5 hover:!text-red-400"
                        title="Видалити іспит"
                        aria-label="Видалити іспит"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[#142038] pt-5 sm:grid-cols-5">
                  <div>
                    <dt className="text-xs text-slate-500">Час</dt>
                    <dd className="num mt-1 text-sm font-semibold text-white">{activeTest.timeLimitMinutes} хв</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Прохідний бал</dt>
                    <dd className="num mt-1 text-sm font-semibold text-white">{activeTest.passingScorePercent}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Білет</dt>
                    <dd className="num mt-1 text-sm font-semibold text-white">
                      {activeTest.randomQuestionCount} з {activeTest.questions.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Спроби</dt>
                    <dd className="num mt-1 text-sm font-semibold text-white">{activeTest.maxAttempts}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Пауза між спробами</dt>
                    <dd className="num mt-1 text-sm font-semibold text-white">{activeTest.cooldownHours} год</dd>
                  </div>
                </dl>
              </section>

              {/* Питання */}
              <section className="panel">
                <div className="flex items-center justify-between gap-4 border-b border-[#142038] px-5 py-4 sm:px-6">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Питання <span className="num ml-1 text-slate-500">{activeTest.questions.length}</span>
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-400">
                      Кадет отримує {activeTest.randomQuestionCount} випадкових.
                    </p>
                  </div>
                  {canManageTests && (
                    <button onClick={() => handleOpenAddQuestion(activeTest)} className="btn btn-secondary">
                      <Plus className="h-4 w-4" />
                      Додати питання
                    </button>
                  )}
                </div>

                {activeTest.questions.length === 0 ? (
                  <EmptyState
                    icon={<HelpCircle className="h-5 w-5" />}
                    title="У банку немає питань"
                    text="Додайте хоча б стільки питань, скільки має бути в білеті."
                  />
                ) : (
                  <ol className="divide-y divide-[#142038]">
                    {activeTest.questions.map((q, idx) => (
                      <li key={q.id} className="group px-5 py-4 sm:px-6">
                        <div className="flex items-start gap-4">
                          <span className="num w-6 shrink-0 pt-0.5 text-sm text-slate-600">{idx + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-relaxed text-white">{q.title}</div>
                            {q.description && (
                              <div className="mt-1 text-sm leading-relaxed text-slate-400">{q.description}</div>
                            )}

                            {q.options && q.options.length > 0 && (
                              <ul className="mt-3 space-y-1.5">
                                {q.options.map((opt, oIdx) => {
                                  const isCorrect =
                                    q.type === 'single'
                                      ? q.correctOption === oIdx
                                      : (q.correctOptions || []).includes(oIdx);
                                  return (
                                    <li
                                      key={oIdx}
                                      className={`flex items-start gap-2.5 text-sm ${
                                        isCorrect ? 'text-emerald-300' : 'text-slate-400'
                                      }`}
                                    >
                                      {isCorrect ? (
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                      ) : (
                                        <span className="mx-[0.3rem] mt-[0.4rem] h-2 w-2 shrink-0 rounded-full border border-slate-600" />
                                      )}
                                      <span>{opt}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}

                            {q.explanation && (
                              <div className="mt-3 text-xs leading-relaxed text-slate-500">
                                Підказка інструктору: {q.explanation}
                              </div>
                            )}

                            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                              <span>
                                {q.type === 'single'
                                  ? 'Одна відповідь'
                                  : q.type === 'multiple'
                                  ? 'Кілька відповідей'
                                  : 'Відкрите питання'}
                              </span>
                              <span className="num">{q.maxPoints} б.</span>
                            </div>
                          </div>

                          {canManageTests && (
                            <div className="flex shrink-0 items-center gap-1 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                              <button
                                onClick={() => handleEditQuestion(activeTest, q)}
                                className="btn btn-ghost !p-2"
                                title="Редагувати питання"
                                aria-label="Редагувати питання"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(activeTest, q.id)}
                                className="btn btn-ghost !p-2 hover:!text-red-400"
                                title="Видалити питання"
                                aria-label="Видалити питання"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Create/Edit Test */}
      {editingTest && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTest}
            className="max-w-xl w-full p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingTest.id?.startsWith('new_') ? 'Створення нового іспиту' : 'Редагування іспиту'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTest(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="label">
                Назва іспиту <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                required
                value={editingTest.title || ''}
                onChange={(e) => setEditingTest({ ...editingTest, title: e.target.value })}
                className="field"
                placeholder="напр. Теорія: Процесуальний кодекс"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Категорія</label>
                <input
                  type="text"
                  value={editingTest.category || ''}
                  onChange={(e) => setEditingTest({ ...editingTest, category: e.target.value })}
                  className="field"
                  placeholder="Законодавство / Тактика"
                />
              </div>

              <div>
                <label className="label">
                  Ліміт часу (хвилини)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={editingTest.timeLimitMinutes || 15}
                  onChange={(e) =>
                    setEditingTest({ ...editingTest, timeLimitMinutes: Number(e.target.value) })
                  }
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label">Опис / Регламент</label>
              <textarea
                rows={2}
                value={editingTest.description || ''}
                onChange={(e) => setEditingTest({ ...editingTest, description: e.target.value })}
                className="field"
                placeholder="Короткий зміст або опис для кадета"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">
                  Прохідний бал (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editingTest.passingScorePercent || 80}
                  onChange={(e) =>
                    setEditingTest({ ...editingTest, passingScorePercent: Number(e.target.value) })
                  }
                  className="field"
                />
              </div>

              <div>
                <label className="label">
                  Питань у білеті
                </label>
                <input
                  type="number"
                  min={1}
                  value={editingTest.randomQuestionCount || 5}
                  onChange={(e) =>
                    setEditingTest({ ...editingTest, randomQuestionCount: Number(e.target.value) })
                  }
                  className="field"
                />
              </div>

              <div>
                <label className="label">
                  Ліміт спроб
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editingTest.maxAttempts || 2}
                  onChange={(e) =>
                    setEditingTest({ ...editingTest, maxAttempts: Number(e.target.value) })
                  }
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label">
                Пауза між перездачами (годин)
              </label>
              <input
                type="number"
                min={0}
                max={168}
                value={editingTest.cooldownHours || 24}
                onChange={(e) =>
                  setEditingTest({ ...editingTest, cooldownHours: Number(e.target.value) })
                }
                className="field"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Якщо кадет завалив іспит, система не дозволить згенерувати посилання раніше вказаного часу.
              </span>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingTest(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs"
              >
                {saving ? 'Збереження...' : 'Зберегти іспит'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Create/Edit Question */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveQuestion}
            className="max-w-2xl w-full my-8 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingQuestion.isNew ? 'Додати питання до банку' : 'Редагувати питання'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="label">
                Тип питання <span className="text-amber-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditingQuestion({
                      ...editingQuestion,
                      question: { ...editingQuestion.question, type: 'single' },
                    })
                  }
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold ${
                    editingQuestion.question.type === 'single'
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Одиночний вибір
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditingQuestion({
                      ...editingQuestion,
                      question: { ...editingQuestion.question, type: 'multiple' },
                    })
                  }
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold ${
                    editingQuestion.question.type === 'multiple'
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Множинний вибір
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditingQuestion({
                      ...editingQuestion,
                      question: { ...editingQuestion.question, type: 'open' },
                    })
                  }
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold ${
                    editingQuestion.question.type === 'open'
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Відкритий кейс
                </button>
              </div>
            </div>

            <div>
              <label className="label">
                Текст питання <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                required
                value={editingQuestion.question.title || ''}
                onChange={(e) =>
                  setEditingQuestion({
                    ...editingQuestion,
                    question: { ...editingQuestion.question, title: e.target.value },
                  })
                }
                className="field"
                placeholder="напр. Що означає тен-код 10-4?"
              />
            </div>

            <div>
              <label className="label">
                Додатковий опис / Фабула ситуації (опціонально)
              </label>
              <textarea
                rows={2}
                value={editingQuestion.question.description || ''}
                onChange={(e) =>
                  setEditingQuestion({
                    ...editingQuestion,
                    question: { ...editingQuestion.question, description: e.target.value },
                  })
                }
                className="field"
                placeholder="Для відкритих кейсів: детальний опис обставин інциденту..."
              />
            </div>

            {/* If Single or Multiple: Edit Options */}
            {editingQuestion.question.type !== 'open' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Варіанти відповідей (позначте правильні):
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const opts = editingQuestion.question.options || [];
                      setEditingQuestion({
                        ...editingQuestion,
                        question: { ...editingQuestion.question, options: [...opts, ''] },
                      });
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                  >
                    + Додати варіант
                  </button>
                </div>

                <div className="space-y-2">
                  {(editingQuestion.question.options || []).map((opt, oIdx) => {
                    const isSingle = editingQuestion.question.type === 'single';
                    const isCorrect = isSingle
                      ? editingQuestion.question.correctOption === oIdx
                      : (editingQuestion.question.correctOptions || []).includes(oIdx);

                    return (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type={isSingle ? 'radio' : 'checkbox'}
                          name="correctOptionRadio"
                          checked={isCorrect}
                          onChange={() => {
                            if (isSingle) {
                              setEditingQuestion({
                                ...editingQuestion,
                                question: { ...editingQuestion.question, correctOption: oIdx },
                              });
                            } else {
                              const curr = editingQuestion.question.correctOptions || [];
                              const next = curr.includes(oIdx)
                                ? curr.filter((i) => i !== oIdx)
                                : [...curr, oIdx];
                              setEditingQuestion({
                                ...editingQuestion,
                                question: { ...editingQuestion.question, correctOptions: next },
                              });
                            }
                          }}
                          className="w-4 h-4 accent-amber-400 shrink-0"
                          title="Позначити як правильну відповідь"
                        />
                        <input
                          type="text"
                          required
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...(editingQuestion.question.options || [])];
                            newOpts[oIdx] = e.target.value;
                            setEditingQuestion({
                              ...editingQuestion,
                              question: { ...editingQuestion.question, options: newOpts },
                            });
                          }}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                          placeholder={`Варіант ${oIdx + 1}`}
                        />
                        {(editingQuestion.question.options || []).length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newOpts = (editingQuestion.question.options || []).filter(
                                (_, idx) => idx !== oIdx
                              );
                              setEditingQuestion({
                                ...editingQuestion,
                                question: { ...editingQuestion.question, options: newOpts },
                              });
                            }}
                            className="p-1 text-slate-500 hover:text-red-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="label">
                  Максимальні бали за відповідь
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editingQuestion.question.maxPoints || 1}
                  onChange={(e) =>
                    setEditingQuestion({
                      ...editingQuestion,
                      question: { ...editingQuestion.question, maxPoints: Number(e.target.value) },
                    })
                  }
                  className="field"
                />
              </div>

              <div>
                <label className="label">Категорія</label>
                <input
                  type="text"
                  value={editingQuestion.question.category || ''}
                  onChange={(e) =>
                    setEditingQuestion({
                      ...editingQuestion,
                      question: { ...editingQuestion.question, category: e.target.value },
                    })
                  }
                  className="field"
                  placeholder="напр. Тен-коди"
                />
              </div>
            </div>

            <div>
              <label className="label">
                Пояснення / Критерії для інструктора
              </label>
              <textarea
                rows={2}
                value={editingQuestion.question.explanation || ''}
                onChange={(e) =>
                  setEditingQuestion({
                    ...editingQuestion,
                    question: { ...editingQuestion.question, explanation: e.target.value },
                  })
                }
                className="field"
                placeholder="Посилання на статтю закону або критерії оцінювання відкритого кейсу"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs"
              >
                {saving ? 'Збереження...' : 'Зберегти питання'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
