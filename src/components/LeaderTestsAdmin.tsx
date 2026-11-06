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

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
            <Lock className="w-3.5 h-3.5" />
            Керування навчальною програмою
          </div>
          <h1 className="text-xl font-bold text-white">
            Банк іспитів, регламенти та питання
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Викладацький режим: створення іспитів, наповнення банку запитань, налаштування часу та критеріїв оцінювання.
          </p>
        </div>

        {canManageTests && (
          <button
            onClick={handleCreateTest}
            className="py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0 shadow-sm shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            Створити новий іспит
          </button>
        )}
      </div>

      {/* Tests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tests.map((test) => (
          <div
            key={test.id}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  {test.category}
                </span>

                <div className="flex items-center gap-1">
                  {canManageTests && (
                    <>
                      <button
                        onClick={() => setEditingTest(test)}
                        className="p-1 text-slate-400 hover:text-white transition-colors"
                        title="Змінити налаштування"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTest(test.id, test.title)}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                        title="Видалити іспит"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-white line-clamp-1">{test.title}</h3>
                <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                  {test.description || 'Немає опису'}
                </p>
              </div>

              {/* Specs */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 grid grid-cols-2 gap-2 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">Час на іспит</span>
                  <span className="font-bold text-white tabular-nums">{test.timeLimitMinutes} хв</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Прохідний бал</span>
                  <span className="font-bold text-emerald-400 tabular-nums">
                    {test.passingScorePercent}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Вибірка з банку</span>
                  <span className="font-bold text-amber-400 tabular-nums">
                    {test.randomQuestionCount} з {test.questions.length}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Спроби / Пауза</span>
                  <span className="font-bold text-slate-300 tabular-nums">
                    {test.maxAttempts} сп. / {test.cooldownHours} год
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedTestForBank(test)}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700/60"
            >
              <FileQuestion className="w-3.5 h-3.5 text-amber-400" />
              Банк питань ({test.questions.length})
            </button>
          </div>
        ))}
      </div>

      {/* Selected Test Question Bank Section */}
      {selectedTestForBank && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider">
                Банк питань для:
              </div>
              <h2 className="text-xl font-bold text-white">{selectedTestForBank.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Кадету випадковим чином дістаються <strong>{selectedTestForBank.randomQuestionCount}</strong> питань з доступних {selectedTestForBank.questions.length}.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {canManageTests && (
                <button
                  onClick={() => handleOpenAddQuestion(selectedTestForBank)}
                  className="py-2 px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Додати питання до банку
                </button>
              )}
              <button
                onClick={() => setSelectedTestForBank(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {selectedTestForBank.questions.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Банк питань порожній. Додайте перше питання.
              </div>
            ) : (
              selectedTestForBank.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-colors space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-amber-400 shrink-0 font-mono">#{idx + 1}</span>
                      <div>
                        <div className="font-semibold text-white text-sm">{q.title}</div>
                        {q.description && (
                          <div className="text-slate-400 mt-0.5 text-xs italic">{q.description}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                        {q.type === 'single'
                          ? 'Одиночний вибір'
                          : q.type === 'multiple'
                          ? 'Множинний'
                          : 'Відкритий кейс'}
                      </span>
                      <span className="text-amber-400 font-bold font-mono">
                        {q.maxPoints} б.
                      </span>

                      {canManageTests && (
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => handleEditQuestion(selectedTestForBank, q)}
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteQuestion(selectedTestForBank, q.id)}
                            className="p-1 text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Options summary */}
                  {q.options && q.options.length > 0 && (
                    <div className="pl-6 space-y-1 pt-1 text-[11px] text-slate-400">
                      {q.options.map((opt, oIdx) => {
                        const isCorrect =
                          q.type === 'single'
                            ? q.correctOption === oIdx
                            : (q.correctOptions || []).includes(oIdx);

                        return (
                          <div
                            key={oIdx}
                            className={`flex items-center gap-2 ${
                              isCorrect ? 'text-emerald-400 font-semibold' : ''
                            }`}
                          >
                            <span>{isCorrect ? '✅' : '⚪'}</span>
                            <span>{opt}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.explanation && (
                    <div className="pl-6 pt-1 text-[10px] text-slate-500 italic">
                      Підказка інструктору: {q.explanation}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
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
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Назва іспиту <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                required
                value={editingTest.title || ''}
                onChange={(e) => setEditingTest({ ...editingTest, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                placeholder="напр. Теорія: Процесуальний кодекс"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Категорія</label>
                <input
                  type="text"
                  value={editingTest.category || ''}
                  onChange={(e) => setEditingTest({ ...editingTest, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="Законодавство / Тактика"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Опис / Регламент</label>
              <textarea
                rows={2}
                value={editingTest.description || ''}
                onChange={(e) => setEditingTest({ ...editingTest, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                placeholder="Короткий зміст або опис для кадета"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Питань у білеті
                </label>
                <input
                  type="number"
                  min={1}
                  value={editingTest.randomQuestionCount || 5}
                  onChange={(e) =>
                    setEditingTest({ ...editingTest, randomQuestionCount: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
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
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
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
              <label className="block text-xs font-medium text-slate-300 mb-1">
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
              <label className="block text-xs font-medium text-slate-300 mb-1">
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
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                placeholder="напр. Що означає тен-код 10-4?"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
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
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
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
                <label className="block text-xs font-medium text-slate-300 mb-1">
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Категорія</label>
                <input
                  type="text"
                  value={editingQuestion.question.category || ''}
                  onChange={(e) =>
                    setEditingQuestion({
                      ...editingQuestion,
                      question: { ...editingQuestion.question, category: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="напр. Тен-коди"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
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
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
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
