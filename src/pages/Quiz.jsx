import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  generateAIQuiz,
  getQuizzes,
  getQuiz,
  getSubjects,
  submitQuiz,
} from "../services/api";
import { useToast } from "../context/ToastContext";

const QUIZ_STORAGE_KEY = "active_quiz_state";

// =====================================================
// GET SAVED QUIZ STATE
// =====================================================

function getSavedQuizState() {
  try {
    const savedState = localStorage.getItem(
      QUIZ_STORAGE_KEY,
    );

    if (!savedState) {
      return null;
    }

    const parsedState = JSON.parse(savedState);

    if (!parsedState.selectedQuiz) {
      return null;
    }

    return parsedState;
  } catch (err) {
    console.error(
      "Could not restore quiz state:",
      err,
    );

    localStorage.removeItem(QUIZ_STORAGE_KEY);

    return null;
  }
}

function Quiz() {
  const navigate = useNavigate();
  const { quizId } = useParams();
  const toast = useToast();

  // =====================================================
  // RESTORE SAVED STATE ON INITIALIZATION
  // =====================================================

  const savedQuizState = getSavedQuizState();

  const [quizzes, setQuizzes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [newQuizTitle, setNewQuizTitle] = useState("");
  const [newQuizSubjectId, setNewQuizSubjectId] = useState("");
  const [newQuizCount, setNewQuizCount] = useState(5);
  const [creatingQuiz, setCreatingQuiz] = useState(false);

  const [selectedQuiz, setSelectedQuiz] = useState(
    savedQuizState?.selectedQuiz || null,
  );

  const [currentQuestion, setCurrentQuestion] =
    useState(
      Number.isInteger(
        savedQuizState?.currentQuestion,
      )
        ? savedQuizState.currentQuestion
        : 0,
    );

  const [answers, setAnswers] = useState(
    savedQuizState?.answers &&
      typeof savedQuizState.answers === "object"
      ? savedQuizState.answers
      : {},
  );

  const [result, setResult] = useState(
    savedQuizState?.result || null,
  );

  const [showReview, setShowReview] = useState(
    savedQuizState?.showReview === true,
  );

  const [loading, setLoading] = useState(true);
  const [quizLoading, setQuizLoading] =
    useState(false);

  // =====================================================
  // GENERATE QUIZ WITH AI
  // =====================================================

  async function handleCreateQuiz(event) {
    event.preventDefault();

    if (!newQuizTitle.trim()) {
      toast.error("Please enter a quiz title.");
      return;
    }

    if (!newQuizSubjectId || !Number.isInteger(Number(newQuizSubjectId))) {
      toast.error("Please select a subject.");
      return;
    }

    const count = Number(newQuizCount);

    if (!Number.isInteger(count) || count < 1 || count > 20) {
      toast.error("Number of questions must be between 1 and 20.");
      return;
    }

    try {
      setCreatingQuiz(true);
      const result = await generateAIQuiz(
        newQuizTitle.trim(),
        Number(newQuizSubjectId),
        count,
      );

      const quizId = result?.quiz_id ?? result?.id ?? result?.quiz?.id ?? result?.quiz?.quiz_id;

      if (!quizId) {
        throw new Error("Quiz was generated, but no quiz ID was returned.");
      }

      setShowQuizForm(false);
      setNewQuizTitle("");
      setNewQuizSubjectId("");
      setNewQuizCount(5);

      const data = await getQuiz(quizId);
      setSelectedQuiz(data);
      setCurrentQuestion(0);
      setAnswers({});
      setResult(null);
      setShowReview(false);
    } catch (err) {
      const message = err.message || "Unable to generate the quiz.";

      if (
        message.toLowerCase().includes("no uploaded") ||
        (message.toLowerCase().includes("document") &&
        message.toLowerCase().includes("subject"))
      ) {
        toast.error("No study material was found for this subject. Please upload a PDF in the Documents page and attach it to this subject before generating a quiz.");
        return;
      }

      toast.error(message);
    } finally {
      setCreatingQuiz(false);
    }
  }

  // =====================================================
  // SAVE QUIZ STATE TO LOCAL STORAGE
  // =====================================================

  useEffect(() => {
    /*
     * Only save when a quiz is actually active.
     */

    if (!selectedQuiz) {
      return;
    }

    const quizState = {
      selectedQuiz,
      currentQuestion,
      answers,
      result,
      showReview,
    };

    localStorage.setItem(
      QUIZ_STORAGE_KEY,
      JSON.stringify(quizState),
    );
  }, [
    selectedQuiz,
    currentQuestion,
    answers,
    result,
    showReview,
  ]);

  // =====================================================
  // LOAD QUIZZES
  // =====================================================

  useEffect(() => {
    let cancelled = false;

    async function loadQuizzes() {
      try {
        setLoading(true);
        const [quizData, subjectData] = await Promise.all([
          getQuizzes(),
          getSubjects(),
        ]);

        if (cancelled) return;

        setQuizzes(quizData);

        const subjectList = Array.isArray(subjectData)
          ? subjectData
          : subjectData?.subjects || [];
        setSubjects(subjectList);

        if (subjectList.length > 0 && !newQuizSubjectId) {
          setNewQuizSubjectId(String(subjectList[0].id));
        }

        if (quizId) {
          const data = await getQuiz(Number(quizId));
          if (!cancelled) {
            setSelectedQuiz(data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Unable to load quizzes.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadQuizzes();

    return () => {
      cancelled = true;
    };
  }, [quizId]); // eslint-disable-line react-hooks/exhaustive-deps

  // =====================================================
  // SELECT QUIZ
  // =====================================================

  async function handleSelectQuiz(id) {
    try {
      setQuizLoading(true);
      setSelectedQuiz(null);
      setResult(null);
      setShowReview(false);
      setAnswers({});
      setCurrentQuestion(0);

      const data = await getQuiz(id);

      setSelectedQuiz(data);
    } catch (err) {
      toast.error(err.message || "Unable to load quiz.");
    } finally {
      setQuizLoading(false);
    }
  }

  // =====================================================
  // SELECT ANSWER
  // =====================================================

  function handleAnswer(answerKey) {
    if (result || showReview) {
      return;
    }

    /*
     * Store the answer KEY:
     *
     * option_a
     * option_b
     * option_c
     * option_d
     */
    setAnswers((previous) => ({
      ...previous,
      [currentQuestion]: answerKey,
    }));
  }

  // =====================================================
  // NEXT QUESTION
  // =====================================================

  function handleNext() {
    if (!selectedQuiz) {
      return;
    }

    if (
      currentQuestion <
      selectedQuiz.questions.length - 1
    ) {
      setCurrentQuestion(
        (previous) => previous + 1,
      );
    }
  }

  // =====================================================
  // PREVIOUS QUESTION
  // =====================================================

  function handlePrevious() {
    if (currentQuestion > 0) {
      setCurrentQuestion(
        (previous) => previous - 1,
      );
    }
  }

  // =====================================================
  // SUBMIT QUIZ
  // =====================================================

  async function handleSubmit() {
    if (!selectedQuiz) {
      return;
    }

    try {
      setQuizLoading(true);
      /*
       * Backend expects:
       *
       * {
       *   question_id: 11,
       *   answer: "option_b"
       * }
       */

      const submittedAnswers =
        selectedQuiz.questions.map(
          (question, index) => ({
            question_id: question.id,
            answer: answers[index] || "",
          }),
        );

      const data = await submitQuiz(
        selectedQuiz.id,
        submittedAnswers,
      );

      setResult(data);
      setShowReview(false);

      /*
       * The result is automatically saved
       * by the localStorage useEffect.
       */
    } catch (err) {
      toast.error(err.message || "Unable to submit quiz.");
    } finally {
      setQuizLoading(false);
    }

    setShowReview(true);
  }

  // =====================================================
  // TRY AGAIN
  // =====================================================

  function restartQuiz() {
    setCurrentQuestion(0);
    setAnswers({});
    setResult(null);
    setShowReview(false);
    /*
     * Remove old completed quiz state.
     */

    localStorage.removeItem(
      QUIZ_STORAGE_KEY,
    );
  }

  // =====================================================
  // BACK TO QUIZ LIST
  // =====================================================

  function handleBack() {
    setSelectedQuiz(null);
    setCurrentQuestion(0);
    setAnswers({});
    setResult(null);
    setShowReview(false);
    /*
     * Remove saved active quiz.
     */

    localStorage.removeItem(
      QUIZ_STORAGE_KEY,
    );
  }

  // =====================================================
  // GO TO DASHBOARD
  // =====================================================

  function handleGoToDashboard() {
    /*
     * Clear the saved quiz before leaving.
     */

    localStorage.removeItem(
      QUIZ_STORAGE_KEY,
    );

    setSelectedQuiz(null);
    setCurrentQuestion(0);
    setAnswers({});
    setResult(null);
    setShowReview(false);

    navigate("/dashboard");
  }

  // =====================================================
  // START REVIEW
  // =====================================================

  function handleStartReview() {
    setCurrentQuestion(0);
    setShowReview(true);
  }

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-sm">
        <p className="text-slate-500 dark:text-slate-400">
          Loading quizzes...
        </p>
      </div>
    );
  }

  // =====================================================
  // REVIEW SCREEN
  // =====================================================

  if (
    selectedQuiz &&
    result &&
    showReview
  ) {
    const reviewQuestion =
      result.review?.[currentQuestion];

    if (!reviewQuestion) {
      return null;
    }

    const userAnswer =
      reviewQuestion.attempted_answer || "";

    const correctAnswer =
      reviewQuestion.correct_answer || "";

    const isCorrect =
      reviewQuestion.is_correct === true;

    const options = [
      {
        key: "option_a",
        text: reviewQuestion.option_a,
      },
      {
        key: "option_b",
        text: reviewQuestion.option_b,
      },
      {
        key: "option_c",
        text: reviewQuestion.option_c,
      },
      {
        key: "option_d",
        text: reviewQuestion.option_d,
      },
    ];

    return (
      <div className="mx-auto max-w-4xl">

        {/* Header */}

        <div className="mb-8 flex items-center justify-between">

          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Answer Review
            </h1>

            <p className="mt-2 text-slate-500 dark:text-slate-400">
              Review your answers one question at a time.
            </p>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 px-5 py-3 shadow-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your Score
            </p>

            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {result.score} / {result.total}
            </p>
          </div>

        </div>

        {/* Progress */}

        <div className="mb-6">

          <div className="mb-2 flex items-center justify-between">

            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Question {currentQuestion + 1}
            </span>

            <span className="text-sm text-slate-500 dark:text-slate-400">
              {currentQuestion + 1} /{" "}
              {result.review.length}
            </span>

          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">

            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all"
              style={{
                width: `${
                  ((currentQuestion + 1) /
                    result.review.length) *
                  100
                }%`,
              }}
            />

          </div>

        </div>

        {/* Review Card */}

        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">

          {/* Question */}

          <div className="flex items-start gap-4">

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 font-bold text-blue-600 dark:text-blue-400">
              {reviewQuestion.question_number}
            </div>

            <h2 className="pt-2 text-xl font-semibold leading-8 text-slate-900 dark:text-slate-100">
              {reviewQuestion.question}
            </h2>

          </div>

          {/* Options */}

          <div className="mt-8 space-y-3">

            {options.map((option, index) => {

              const isUserAnswer =
                option.text === userAnswer;

              const isCorrectAnswer =
                option.text === correctAnswer;

              let optionStyle =
                "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300";

              if (isCorrectAnswer) {
                optionStyle =
                  "border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400";
              } else if (
                isUserAnswer &&
                !isCorrectAnswer
              ) {
                optionStyle =
                  "border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400";
              }

              return (
                <div
                  key={`${option.key}-${index}`}
                  className={`flex items-center gap-4 rounded-2xl border p-4 ${optionStyle}`}
                >

                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                      isCorrectAnswer
                        ? "border-green-500 dark:border-green-400 bg-green-500 dark:bg-green-600 text-white dark:text-slate-100"
                        : isUserAnswer
                          ? "border-red-500 dark:border-red-400 bg-red-500 dark:bg-red-600 text-white dark:text-slate-100"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {String.fromCharCode(
                      65 + index,
                    )}
                  </span>

                  <span className="flex-1 font-medium">
                    {option.text}
                  </span>

                  {isCorrectAnswer && (
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                      ✓ Correct Answer
                    </span>
                  )}

                  {isUserAnswer &&
                    !isCorrectAnswer && (
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                        ✕ Your Answer
                      </span>
                    )}

                </div>
              );
            })}

          </div>

          {/* Result */}

          <div
            className={`mt-6 rounded-2xl border p-5 ${
              isCorrect
                ? "border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/30"
                : "border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30"
            }`}
          >

            <div className="flex items-start gap-3">

              <span className="text-2xl">
                {isCorrect ? "✅" : "❌"}
              </span>

              <div>

                <h3
                  className={`font-semibold ${
                    isCorrect
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {isCorrect
                    ? "Correct Answer!"
                    : "Incorrect Answer"}
                </h3>

                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Your answer:{" "}
                  <strong>
                    {userAnswer ||
                      "Not answered"}
                  </strong>
                </p>

                {!isCorrect && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Correct answer:{" "}
                    <strong>
                      {correctAnswer}
                    </strong>
                  </p>
                )}

              </div>

            </div>

          </div>

          {/* Navigation */}

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-6">

            <button
              type="button"
              onClick={handlePrevious}
              disabled={
                currentQuestion === 0
              }
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>

            {currentQuestion <
            result.review.length - 1 ? (

              <button
                type="button"
                onClick={handleNext}
                className="rounded-xl bg-blue-600 dark:bg-blue-500 px-6 py-3 text-sm font-semibold text-white dark:text-slate-100 transition hover:bg-blue-700 dark:hover:bg-blue-500"
              >
                Next Answer →
              </button>

            ) : (

              <div className="flex gap-3">

                <button
                  type="button"
                  onClick={restartQuiz}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  Try Again
                </button>

                <button
                  type="button"
                  onClick={handleGoToDashboard}
                  className="rounded-xl bg-blue-600 dark:bg-blue-500 px-6 py-3 text-sm font-semibold text-white dark:text-slate-100 transition hover:bg-blue-700 dark:hover:bg-blue-500"
                >
                  Go to Dashboard
                </button>

              </div>

            )}

          </div>

        </div>

      </div>
    );
  }

  // =====================================================
  // RESULT SCREEN
  // =====================================================

  if (selectedQuiz && result) {

    const score = result.score || 0;
    const total = result.total || 0;

    const percentage =
      result.percentage ??
      (total > 0
        ? Math.round(
            (score / total) * 100,
          )
        : 0);

    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">

        <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center shadow-sm">

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-4xl">
            {percentage >= 60
              ? "🎉"
              : "📚"}
          </div>

          <h1 className="mt-6 text-3xl font-bold text-slate-900 dark:text-slate-100">
            Quiz Completed!
          </h1>

          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Great job! Here is your result.
          </p>

          <div className="mt-8">

            <p className="text-6xl font-bold text-blue-600 dark:text-blue-400">
              {percentage}%
            </p>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {score} out of {total} answers correct
            </p>

          </div>

          <div className="mt-8 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">

            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all"
              style={{
                width: `${percentage}%`,
              }}
            />

          </div>

          <div className="mt-8 space-y-3">

            <button
              type="button"
              onClick={handleStartReview}
              className="w-full rounded-xl bg-blue-600 dark:bg-blue-500 px-5 py-3 text-sm font-semibold text-white dark:text-slate-100 transition hover:bg-blue-700 dark:hover:bg-blue-500"
            >
              📋 Check Answers
            </button>

            <button
              type="button"
              onClick={restartQuiz}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              Try Again
            </button>

            <button
              type="button"
              onClick={handleGoToDashboard}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              Go to Dashboard
            </button>

          </div>

        </div>

      </div>
    );
  }

  // =====================================================
  // QUIZ ATTEMPT SCREEN
  // =====================================================

  if (selectedQuiz) {

    const question =
      selectedQuiz.questions[
        currentQuestion
      ];

    if (!question) {
      return null;
    }

    const options = [
      {
        key: "option_a",
        text: question.option_a,
      },
      {
        key: "option_b",
        text: question.option_b,
      },
      {
        key: "option_c",
        text: question.option_c,
      },
      {
        key: "option_d",
        text: question.option_d,
      },
    ];

    const selectedAnswer =
      answers[currentQuestion] || "";

    const progress =
      ((currentQuestion + 1) /
        selectedQuiz.questions.length) *
      100;

    const isLastQuestion =
      currentQuestion ===
      selectedQuiz.questions.length - 1;

    return (
      <div className="mx-auto max-w-4xl">

        {/* Header */}

        <div className="mb-8 flex items-center justify-between">

          <div>

            <button
              type="button"
              onClick={handleBack}
              className="mb-4 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-400"
            >
              ← Back to quizzes
            </button>

            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {selectedQuiz.title}
            </h1>

            <p className="mt-2 text-slate-500 dark:text-slate-400">
              Answer all questions before submitting.
            </p>

          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 px-5 py-3 shadow-sm">

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Question
            </p>

            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {currentQuestion + 1} /{" "}
              {selectedQuiz.questions.length}
            </p>

          </div>

        </div>

        {/* Progress */}

        <div className="mb-8">

          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">

            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all"
              style={{
                width: `${progress}%`,
              }}
            />

          </div>

        </div>

        {/* Question Card */}

        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">

          {/* Question */}

          <div className="flex items-start gap-4">

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 font-bold text-blue-600 dark:text-blue-400">
              {currentQuestion + 1}
            </div>

            <h2 className="pt-2 text-xl font-semibold leading-8 text-slate-900 dark:text-slate-100">
              {question.question}
            </h2>

          </div>

          {/* Options */}

          <div className="mt-8 space-y-3">

            {options.map((option, index) => {

              const isSelected =
                selectedAnswer ===
                option.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() =>
                    handleAnswer(
                      option.key,
                    )
                  }
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >

                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                      isSelected
                        ? "border-blue-500 dark:border-blue-400 bg-blue-600 dark:bg-blue-500 text-white dark:text-slate-100"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {String.fromCharCode(
                      65 + index,
                    )}
                  </span>

                  <span className="font-medium">
                    {option.text}
                  </span>

                </button>
              );
            })}

          </div>

          {/* Navigation */}

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-6">

            <button
              type="button"
              onClick={handlePrevious}
              disabled={
                currentQuestion === 0
              }
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>

            {!isLastQuestion ? (

              <button
                type="button"
                onClick={handleNext}
                className="rounded-xl bg-blue-600 dark:bg-blue-500 px-6 py-3 text-sm font-semibold text-white dark:text-slate-100 hover:bg-blue-700 dark:hover:bg-blue-500"
              >
                Next →
              </button>

            ) : (

              <button
                type="button"
                onClick={handleSubmit}
                disabled={quizLoading}
                className="rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white dark:text-slate-100 hover:bg-green-700 dark:hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {quizLoading
                  ? "Submitting..."
                  : "Finish Quiz ✓"}
              </button>

            )}

          </div>

        </div>

      </div>
    );
  }

  const subjectMap = Object.fromEntries(
    subjects.map((subject) => [subject.id, subject]),
  );

  // =====================================================
  // QUIZ LIST
  // =====================================================

  return (
    <div>

      <div className="mb-8">

        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          Quizzes
        </h1>

        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Test your knowledge and track your learning.
        </p>

      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Quick actions</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Manage quizzes</h2>
        </div>

        <button
          type="button"
          onClick={() => setShowQuizForm((previous) => !previous)}
          className="rounded-xl bg-blue-600 dark:bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white dark:text-slate-100 hover:bg-blue-700 dark:hover:bg-blue-500"
        >
          {showQuizForm ? "Close Form" : "Generate Quiz with AI"}
        </button>
      </div>

      {showQuizForm && (
        <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create a new quiz</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">AI will generate questions from your uploaded study material for the selected subject.</p>

          <form onSubmit={handleCreateQuiz} className="mt-5 space-y-5">
            <div>
              <label htmlFor="new-quiz-title" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Quiz Title</label>
              <input
                id="new-quiz-title"
                type="text"
                value={newQuizTitle}
                onChange={(event) => setNewQuizTitle(event.target.value)}
                placeholder="e.g. DBMS Unit 1 Quiz"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 dark:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="new-quiz-subject" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Subject</label>
                <select
                  id="new-quiz-subject"
                  value={newQuizSubjectId}
                  onChange={(event) => setNewQuizSubjectId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 dark:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="new-quiz-count" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Questions</label>
                <select
                  id="new-quiz-count"
                  value={newQuizCount}
                  onChange={(event) => setNewQuizCount(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 dark:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                  <option value={15}>15 Questions</option>
                  <option value={20}>20 Questions</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={creatingQuiz || subjects.length === 0}
              className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white dark:text-slate-100 hover:bg-green-700 dark:hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingQuiz ? "Generating Quiz..." : "Create Quiz"}
            </button>
          </form>
        </div>
      )}

      {quizzes.length === 0 ? (
 
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center shadow-sm">
 
          <div className="text-4xl">
            📝
          </div>
 
          <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
            No quizzes yet
          </h2>
 
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Generate your first quiz using AI from any uploaded subject material.
          </p>
 
        </div>
 
      ) : (

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

          {quizzes.map((quiz) => (

            <div
              key={quiz.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >

              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 text-2xl">
                📝
              </div>

              <h2 className="mt-5 font-semibold text-slate-900 dark:text-slate-100">
                {quiz.title}
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Subject: {subjectMap?.[quiz.subject_id]?.name || `#${quiz.subject_id}`}
              </p>

              <button
                type="button"
                onClick={() =>
                  handleSelectQuiz(
                    quiz.id,
                  )
                }
                disabled={quizLoading}
                className="mt-5 w-full rounded-xl bg-blue-600 dark:bg-blue-500 py-2.5 text-sm font-semibold text-white dark:text-slate-100 hover:bg-blue-700 dark:hover:bg-blue-500 disabled:opacity-60"
              >
                {quizLoading
                  ? "Loading..."
                  : "Start Quiz"}
              </button>

            </div>

          ))}

        </div>

      )}

    </div>
  );
}

export default Quiz;
