import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getSubjects,
  generateAIQuiz,
} from "../services/api";
import { useToast } from "../context/ToastContext";

export default function AIGenerateQuiz() {
  const navigate = useNavigate();
  const toast = useToast();

  const [subjects, setSubjects] = useState([]);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);

  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchSubjects = async () => {
      try {
        setLoadingSubjects(true);

        const data = await getSubjects();
        const subjectList = Array.isArray(data) ? data : data?.subjects || [];

        if (!cancelled) {
          setSubjects(subjectList);
          if (subjectList.length > 0) {
            setSubjectId(String(subjectList[0].id));
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("LOAD SUBJECTS ERROR:", err);
          toast.error(err.message || "Failed to load subjects.");
        }
      } finally {
        if (!cancelled) {
          setLoadingSubjects(false);
        }
      }
    };

    void fetchSubjects();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate(event) {
    event.preventDefault();

    const cleanTitle = title.trim();
    const questionCount = Number(numberOfQuestions);
    const selectedSubjectId = Number(subjectId);

    if (!cleanTitle) {
      toast.error("Please enter a quiz title.");
      return;
    }

    if (!subjectId || !Number.isInteger(selectedSubjectId)) {
      toast.error("Please select a subject.");
      return;
    }

    if (
      !Number.isInteger(questionCount) ||
      questionCount < 1 ||
      questionCount > 20
    ) {
      toast.error("Number of questions must be between 1 and 20.");
      return;
    }

    try {
      setGenerating(true);

      const quiz = await generateAIQuiz(
        cleanTitle,
        selectedSubjectId,
        questionCount,
      );

      const quizId =
        quiz?.quiz_id ?? quiz?.id ?? quiz?.quiz?.id ?? quiz?.quiz?.quiz_id;

      if (!quizId) {
        throw new Error(
          "Quiz was generated, but the backend did not return a quiz ID.",
        );
      }

      toast.success("Quiz generated successfully.");
      navigate(`/quiz/${quizId}`);
    } catch (err) {
      toast.error(err.message || "Unable to generate the quiz. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}

      <div className="mb-8">
        <button
          type="button"
          onClick={() => navigate("/quiz")}
          className="mb-4 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-400"
        >
          ← Back to quizzes
        </button>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          Generate Quiz with AI
        </h1>

        <p className="mt-2 text-slate-500 dark:text-slate-500">
          Let EduPilot AI create questions from your study material.
        </p>
      </div>

      {/* Card */}

      <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <form onSubmit={handleGenerate}>
          {/* Quiz Title */}

          <div className="mb-6">
            <label
              htmlFor="quiz-title"
              className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Quiz Title
            </label>

            <input
              id="quiz-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Biology Chapter 1 Quiz"
              disabled={generating}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 dark:bg-slate-800/50"
            />
          </div>

          {/* Subject */}

          <div className="mb-6">
            <label
              htmlFor="quiz-subject"
              className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Subject
            </label>

            {loadingSubjects ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-500 dark:text-slate-500">
                Loading subjects...
              </div>
            ) : subjects.length === 0 ? (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-4 text-sm text-amber-700 dark:text-amber-400">
                No subjects found. Create a subject first.
              </div>
            ) : (
              <select
                id="quiz-subject"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                disabled={generating}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 dark:bg-slate-800/50"
              >
                <option value="">Select a subject</option>

                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Number of Questions */}

          <div className="mb-8">
            <label
              htmlFor="question-count"
              className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Number of Questions
            </label>

            <select
              id="question-count"
              value={numberOfQuestions}
              onChange={(event) =>
                setNumberOfQuestions(Number(event.target.value))
              }
              disabled={generating}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 dark:bg-slate-800/50"
            >
              <option value={5}>5 Questions</option>

              <option value={10}>10 Questions</option>

              <option value={15}>15 Questions</option>

              <option value={20}>20 Questions</option>
            </select>
          </div>

          {/* Generate */}

          <button
            type="submit"
            disabled={generating || loadingSubjects || subjects.length === 0}
            className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? "Generating Quiz..." : "Generate Quiz with AI"}
          </button>
        </form>

        {/* Generation Status */}

        {generating && (
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 dark:bg-blue-900/30 p-5">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />

              <div>
                <p className="font-semibold text-blue-700 dark:text-blue-400">
                  AI is creating your quiz...
                </p>

                <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
                  EduPilot is generating questions from your study material.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
