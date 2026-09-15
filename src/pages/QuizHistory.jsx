import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getQuizAttempts } from "../services/api";
import { useToast } from "../context/ToastContext";

function getScoreColor(pct) {
  if (pct >= 80) return { pill: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-50 dark:bg-emerald-900/30", label: "Excellent" };
  if (pct >= 60) return { pill: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400", bar: "bg-blue-50 dark:bg-blue-900/30", label: "Good" };
  if (pct >= 40) return { pill: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", bar: "bg-amber-50 dark:bg-amber-900/30", label: "Average" };
  return { pill: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400", bar: "bg-red-400", label: "Needs work" };
}

function formatDate(ds) {
  if (!ds) return "";
  const d = new Date(ds);
  if (isNaN(d)) return ds;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function QuizHistory() {
  const toast = useToast();
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const data = await getQuizAttempts();
        if (!cancelled) setAttempts(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Unable to load quiz history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = attempts.filter((a) => {
    const pct = Number(a.percentage) || 0;
    if (filter === "passed") return pct >= 60;
    if (filter === "failed") return pct < 60;
    return true;
  });

  const totalAttempts = attempts.length;
  const best = totalAttempts > 0 ? Math.max(...attempts.map((a) => Number(a.percentage) || 0)) : 0;
  const avg = totalAttempts > 0 ? Math.round(attempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / totalAttempts) : 0;
  const passed = attempts.filter((a) => Number(a.percentage) >= 60).length;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-100 dark:border-blue-800 border-t-blue-600" />
          <p className="text-sm text-slate-500 dark:text-slate-500">Loading quiz history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">

      {/* ── Header ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">Performance</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Quiz History</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Review every attempt and track improvement over time.</p>
      </div>

      {/* ── Summary cards ── */}
      {totalAttempts > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Attempts", value: totalAttempts, color: "text-slate-900 dark:text-slate-100", bg: "bg-slate-50 dark:bg-slate-800/50" },
            { label: "Best Score", value: `${best}%`, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
            { label: "Average", value: `${avg}%`, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30" },
            { label: "Passed", value: `${passed}/${totalAttempts}`, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">{s.label}</p>
              <p className={`mt-2 text-2xl font-bold ${s.color}`}>{s.value}</p>
              <div className={`mt-2 h-1 w-8 rounded-full ${s.bg}`} />
            </div>
          ))}
        </div>
      )}

      {/* ── Filter tabs ── */}
      {totalAttempts > 0 && (
        <div className="flex gap-2">
          {["all", "passed", "failed"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold capitalize transition ${
                filter === f
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
              }`}
            >
              {f === "all" ? `All (${totalAttempts})` : f === "passed" ? `Passed (${passed})` : `Failed (${totalAttempts - passed})`}
            </button>
          ))}
        </div>
      )}

      {/* ── Attempts list ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Attempts</h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Click any row to review your answers.</p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-2xl">📝</div>
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {totalAttempts === 0 ? "No attempts yet" : "No attempts match this filter"}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              {totalAttempts === 0 ? "Complete a quiz to see results here." : "Try a different filter."}
            </p>
            {totalAttempts === 0 && (
              <Link to="/quiz" className="mt-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 dark:hover:bg-blue-500">
                Take a Quiz
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((attempt) => {
              const pct = Number(attempt.percentage) || 0;
              const score = Number(attempt.score) || 0;
              const total = Number(attempt.total) || 0;
              const { pill, bar, label } = getScoreColor(pct);

              return (
                <Link
                  key={attempt.id}
                  to={`/quiz-history/${attempt.id}`}
                  className="group flex flex-col gap-3 px-6 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:flex-row sm:items-center"
                >
                  {/* Icon */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 text-xl">
                    📝
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                      {attempt.quiz_title || `Quiz #${attempt.quiz_id}`}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                      {attempt.subject_name && (
                        <span className="font-medium text-blue-500 dark:text-blue-400">{attempt.subject_name}</span>
                      )}
                      {attempt.subject_name && <span>·</span>}
                      <span>{score}/{total} correct</span>
                      <span>·</span>
                      <span>{formatDate(attempt.submitted_at)}</span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Score pill */}
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pill}`}>
                      {pct}% · {label}
                    </span>
                    <span className="text-xs font-medium text-blue-500 dark:text-blue-400 opacity-0 transition group-hover:opacity-100">
                      Review →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuizHistory;
