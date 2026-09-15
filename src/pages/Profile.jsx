import { useEffect, useState } from "react";
import { getCurrentUser, getUserStats } from "../services/api";
import { useToast } from "../context/ToastContext";

function Profile() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [u, s] = await Promise.all([getCurrentUser(), getUserStats().catch(() => null)]);
        if (!cancelled) {
          setUser(u);
          setStats(s);
        }
      } catch (err) {
        if (!cancelled) toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="text-sm text-slate-500 dark:text-slate-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  const firstLetter = user?.name?.charAt(0).toUpperCase() || "S";

  const statItems = stats ? [
    { label: "Quizzes taken", value: stats.total_attempts, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30" },
    { label: "Best score", value: `${stats.best_score}%`, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
    { label: "Average", value: `${stats.average_score}%`, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30" },
    { label: "Study streak", value: `${stats.streak_days} day${stats.streak_days !== 1 ? "s" : ""}`, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30" },
    { label: "Tasks completed", value: stats.completed_tasks, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-900/30" },
    { label: "Tasks pending", value: stats.pending_tasks, color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-800/50" },
    { label: "Subjects", value: stats.subject_performance?.length || 0, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30" },
    { label: "Completion rate", value: `${stats.completion_rate}%`, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-900/30" },
  ] : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">

      {/* ── Header ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">Account</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Profile</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Manage your account and view learning statistics.</p>
      </div>

      {/* ── Avatar + name ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold text-white shadow-md ring-8 ring-blue-50/50 dark:ring-blue-900/30">
            {firstLetter}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{user?.name}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">{user?.email}</p>

            <div className="mt-3 flex items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-semibold text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                Student
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      {statItems.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statItems.map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{s.label}</p>
              <p className={`mt-1.5 text-xl font-bold ${s.color}`}>{s.value}</p>
              <div className={`mt-1.5 h-1 w-6 rounded-full ${s.bg}`} />
            </div>
          ))}
        </div>
      )}

      {/* ── Account info ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Account Information</h2>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="px-6 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Full Name</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Email Address</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.email}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Account ID</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">#{user?.id}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Role</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Student</p>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">EduPilot Account</p>
            <p className="text-xs text-slate-500 dark:text-slate-500">Your account is connected and active.</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-sm text-emerald-600 dark:text-emerald-400">
            ✓
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;
