import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getQuizAttempt, getQuiz } from "../services/api";
import { useToast } from "../context/ToastContext";

const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d"];

function QuizAttemptReview() {
  const { attemptId } = useParams();
  const toast = useToast();

  const [attempt, setAttempt] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAttempt() {
      try {
        setLoading(true);

        const data = await getQuizAttempt(attemptId);

        if (cancelled) return;

        setAttempt(data);

        // Load the quiz for question/option text. If it fails, still
        // show the attempt (answers map back to question IDs).
        try {
          const quizData = await getQuiz(data.quiz_id);

          if (!cancelled) {
            setQuiz(quizData);
          }
        } catch (err) {
          if (!cancelled) {
            toast.info(err.message || "Could not load quiz details, showing raw answers.");
          }
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Unable to load quiz attempt.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAttempt();

    return () => {
      cancelled = true;
    };
  }, [attemptId, toast]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-sm text-slate-500 dark:text-slate-400 shadow-sm">
          Loading attempt...
        </div>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This attempt could not be loaded.
          </p>
          <Link
            to="/quiz-history"
            className="mt-4 inline-block text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            ← Back to Quiz History
          </Link>
        </div>
      </div>
    );
  }

  const questionMap = Object.fromEntries(
    (quiz?.questions || []).map((q) => [q.id, q]),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      {/* Header */}

      <section>
        <Link
          to="/quiz-history"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-400"
        >
          ← Back to Quiz History
        </Link>

        <p className="mt-5 text-sm font-medium text-blue-600 dark:text-blue-400">
          Quiz Review
        </p>

        <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
          {quiz?.title || `Quiz #${attempt.quiz_id}`}
        </h1>

        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Review your answers from this attempt.
        </p>
      </section>

      {/* Result */}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">Score</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {attempt.score}/{attempt.total}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">Percentage</p>
          <p className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400">
            {attempt.percentage}%
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">Questions</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {attempt.answers?.length || 0}
          </p>
        </div>
      </section>

      {/* Answers */}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-5">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Answer Review</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            See which questions you answered correctly.
          </p>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {(attempt.answers || []).map((answer, index) => {
            const question = questionMap[answer.question_id];

            const selectedKey = answer.selected_answer;
            const selectedText = question
              ? question[selectedKey] || selectedKey
              : selectedKey;

            const correctKey = question?.correct_answer;
            const correctText = question
              ? question[correctKey] || correctKey
              : null;

            const options = question
              ? OPTION_KEYS.map((key, i) => ({
                  key,
                  letter: String.fromCharCode(65 + i),
                  text: question[key],
                }))
              : [];

            return (
              <div key={answer.id} className="px-6 py-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold ${
                      answer.is_correct
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {index + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        {question?.question || `Question ${index + 1}`}
                      </h3>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          answer.is_correct
                            ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                        }`}
                      >
                        {answer.is_correct ? "Correct" : "Incorrect"}
                      </span>
                    </div>

                    {options.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {options.map((option) => {
                          const isSelected = option.key === selectedKey;
                          const isCorrect = option.key === correctKey;

                          let style = "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300";
                          if (isCorrect) {
                            style = "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300";
                          } else if (isSelected && !isCorrect) {
                            style = "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300";
                          }

                          return (
                            <div
                              key={option.key}
                              className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${style}`}
                            >
                              <span className="font-semibold">{option.letter}.</span>
                              <span className="flex-1">{option.text}</span>
                              {isCorrect && (
                                <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                  ✓ Correct
                                </span>
                              )}
                              {isSelected && !isCorrect && (
                                <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                                  ✕ Your answer
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {options.length === 0 && (
                      <div className="mt-3">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Your answer:{" "}
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {selectedText || "Not answered"}
                          </span>
                        </p>
                        {!answer.is_correct && correctText && (
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Correct answer:{" "}
                            <span className="font-medium text-green-700 dark:text-green-400">
                              {correctText}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default QuizAttemptReview;
