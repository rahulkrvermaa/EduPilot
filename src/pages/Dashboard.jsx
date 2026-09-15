import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  getCurrentUser,
  getDashboardData,
  getQuizAttempts,
  getUserStats,
  getExamSettings,
  updateExamSettings,
  clearExamSettings,
  getAIRecommendations,
} from "../services/api";

// =====================================================
// HELPERS
// =====================================================

function getTimeLeft(targetDate) {
  const now = Date.now();
  const diff = new Date(targetDate).getTime() - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, expired: false };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function getUrgencyColor(days) {
  if (days <= 3) return { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600", ring: "ring-red-200" };
  if (days <= 7) return { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-200" };
  if (days <= 14) return { bg: "bg-yellow-50 dark:bg-yellow-900/30", text: "text-yellow-600 dark:text-yellow-400", ring: "ring-yellow-200" };
  return { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600", ring: "ring-blue-200" };
}

function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

const ACTIVITY_ICON = { quiz: "🎯", document: "📄", task: "📝" };
const ACTIVITY_BG = { quiz: "bg-blue-50 dark:bg-blue-900/30", document: "bg-purple-50 dark:bg-purple-900/30", task: "bg-amber-50 dark:bg-amber-900/30" };
const ACTIVITY_TEXT = { quiz: "text-blue-600", document: "text-purple-600", task: "text-amber-600 dark:text-amber-400" };

// =====================================================
// STAT CARD
// =====================================================

function StatCard({ icon, label, value, sub, valueClass = "text-slate-900 dark:text-slate-100", bg = "bg-slate-50 dark:bg-slate-800/50" }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-500">{label}</p>
          <p className={`mt-2 text-3xl font-bold ${valueClass}`}>{value}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${bg}`}>
          {icon}
        </div>
      </div>
      {sub && <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

// =====================================================
// STREAK WIDGET
// =====================================================

function StreakWidget({ streakDays }) {
  return (
    <div className="rounded-2xl border border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 p-5 ring-1 ring-orange-100">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
            🔥 Study Streak
          </p>
          <p className="mt-2 text-3xl font-extrabold text-orange-700 dark:text-orange-400 tabular-nums">
            {streakDays}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">
            {streakDays === 1 ? "day" : "days"} in a row
          </p>
        </div>
        <div className="flex flex-col items-center gap-1">
          {[...Array(Math.min(streakDays, 5))].map((_, i) => (
            <div key={i} className="h-2 w-8 rounded-full bg-orange-300" />
          ))}
          {streakDays === 0 && (
            <div className="text-xs text-slate-400 dark:text-slate-500">No streak yet</div>
          )}
        </div>
      </div>
      {streakDays > 0 && (
        <p className="mt-3 text-xs font-semibold text-orange-500 dark:text-orange-400">
          Keep going! Study today to maintain your streak.
        </p>
      )}
      {streakDays === 0 && (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Take a quiz or complete a task to start your streak.
        </p>
      )}
    </div>
  );
}

// =====================================================
// EXAM COUNTDOWN WIDGET (persistent)
// =====================================================

function ExamCountdown() {
  const [examDate, setExamDate] = useState("");
  const [examLabel, setExamLabel] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [timeLeft, setTimeLeft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getExamSettings();
        if (cancelled) return;

        setExamDate(data.exam_date || "");
        setExamLabel(data.exam_name || "");
        setDraftDate(data.exam_date || "");
        setDraftLabel(data.exam_name || "");
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!examDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimeLeft(null);
      return;
    }

    function tick() {
      setTimeLeft(getTimeLeft(examDate));
    }

    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => clearInterval(timerRef.current);
  }, [examDate]);

  async function handleSave() {
    if (!draftDate) return;

    setSaving(true);

    try {
      await updateExamSettings(draftLabel, draftDate);
      setExamDate(draftDate);
      setExamLabel(draftLabel);
      setEditing(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    try {
      await clearExamSettings();
      setExamDate("");
      setExamLabel("");
      setDraftDate("");
      setDraftLabel("");
      setEditing(false);
      setTimeLeft(null);
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 dark:border-blue-800 border-t-blue-600" />
      </div>
    );
  }

  if (!examDate && !editing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-5 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-xl">
          📅
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Set Your Exam Date</p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Synced across all your devices.</p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="mt-1 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
        >
          Set Exam Date
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 p-5">
        <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">📅 Set Exam Date</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Exam name (e.g. DBMS Mid-Sem)"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="datetime-local"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!draftDate || saving}
            className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const urgency = timeLeft ? getUrgencyColor(timeLeft.days) : getUrgencyColor(99);

  return (
    <div className={`rounded-2xl border p-5 ring-1 ${urgency.bg} ${urgency.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${urgency.text}`}>
            📅 Exam Countdown
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-slate-800 dark:text-slate-200">
            {examLabel || "Exam"}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {new Date(examDate).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          onClick={() => { setDraftDate(examDate); setDraftLabel(examLabel); setEditing(true); }}
          className="shrink-0 rounded-lg p-1 text-slate-400 dark:text-slate-500 transition hover:bg-white dark:bg-slate-900 hover:text-slate-700 dark:text-slate-300"
          title="Edit exam date"
        >
          ✏️
        </button>
      </div>

      {timeLeft?.expired ? (
        <div className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-center">
          <p className="text-sm font-bold text-red-600">Exam time has passed!</p>
          <button onClick={handleClear} className="mt-2 text-xs text-red-400 underline">
            Clear
          </button>
        </div>
      ) : timeLeft ? (
        <>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: "Days", value: timeLeft.days },
              { label: "Hrs", value: pad(timeLeft.hours) },
              { label: "Min", value: pad(timeLeft.minutes) },
              { label: "Sec", value: pad(timeLeft.seconds) },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-col items-center rounded-xl bg-white dark:bg-slate-900 px-1 py-2 shadow-sm"
              >
                <span className={`text-xl font-extrabold tabular-nums ${urgency.text}`}>
                  {value}
                </span>
                <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {label}
                </span>
              </div>
            ))}
          </div>
          {timeLeft.days <= 3 && (
            <p className="mt-3 text-center text-xs font-semibold text-red-500 dark:text-red-400">
              Exam is very close — focus now!
            </p>
          )}
        </>
      ) : null}

      <button
        onClick={handleClear}
        className="mt-3 w-full text-center text-xs text-slate-400 dark:text-slate-500 transition hover:text-slate-600 dark:text-slate-300"
      >
        Remove exam date
      </button>
    </div>
  );
}

// =====================================================
// SUBJECT PERFORMANCE CHART
// =====================================================

function SubjectPerformanceChart({ subjectPerformance }) {
  if (!subjectPerformance || subjectPerformance.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Subject Performance</h2>
        <p className="mt-4 text-center text-sm text-slate-400 dark:text-slate-500">
          Take quizzes to see your per-subject performance.
        </p>
      </div>
    );
  }

  const data = subjectPerformance.map((sp) => ({
    name: sp.subject_name,
    score: sp.average_score,
    best: sp.best_score,
  }));

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Subject Performance</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-500">Average and best quiz scores per subject.</p>
        </div>
      </div>

      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid var(--chart-tooltip-border)",
                backgroundColor: "var(--chart-tooltip-bg)",
                color: "var(--chart-tooltip-text)",
                fontSize: "13px",
              }}
              formatter={(value) => [`${value}%`]}
            />
            <Bar dataKey="score" name="Average" radius={[6, 6, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.score >= 60 ? "#3b82f6" : "#f59e0b"} />
              ))}
            </Bar>
            <Bar dataKey="best" name="Best" radius={[6, 6, 0, 0]} fill="#10b981" opacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// =====================================================
// SCORE TREND CHART
// =====================================================

function ScoreTrendChart({ attempts }) {
  if (!attempts || attempts.length < 2) {
    return null;
  }

  const data = [...attempts]
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
    .slice(-15)
    .map((a) => ({
      date: new Date(a.submitted_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      score: Number(a.percentage),
      label: a.quiz_title || `Quiz #${a.quiz_id}`,
    }));

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Score Trend</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Your quiz scores over time.</p>
      </div>

      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid var(--chart-tooltip-border)",
                backgroundColor: "var(--chart-tooltip-bg)",
                color: "var(--chart-tooltip-text)",
                fontSize: "13px",
              }}
              formatter={(value, _name, props) => [
                `${value}%`,
                props.payload.label,
              ]}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#scoreGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// =====================================================
// ACTIVITY TIMELINE
// =====================================================

function ActivityTimeline({ activity }) {
  if (!activity || activity.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-500">Your latest study actions.</p>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {activity.slice(0, 8).map((item, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3.5">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${
                ACTIVITY_BG[item.type] || "bg-slate-100 dark:bg-slate-800"
              } ${ACTIVITY_TEXT[item.type] || "text-slate-500 dark:text-slate-500"}`}
            >
              {ACTIVITY_ICON[item.type] || "📌"}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.title}</p>
              <p className="truncate text-xs text-slate-400 dark:text-slate-500">{item.subtitle}</p>
            </div>

            <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
              {item.timestamp ? timeAgo(item.timestamp) : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================
// AI RECOMMENDATIONS
// =====================================================

function AIRecommendations() {
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getAIRecommendations();
        if (!cancelled) setRecs(data?.recommendations || []);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">AI Recommendations</h2>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-500">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-200 dark:border-purple-800 border-t-purple-600" />
          Generating personalized tips...
        </div>
      </div>
    );
  }

  if (recs.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xl">🤖</span>
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">AI Study Recommendations</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Personalized based on your real data.</p>

      <div className="mt-4 space-y-3">
        {recs.map((rec, i) => (
          <div
            key={i}
            className="rounded-xl border border-purple-100 dark:border-purple-800 bg-white/70 dark:bg-slate-800/70 p-4"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rec.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{rec.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================
// DASHBOARD
// =====================================================

function Dashboard() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);

        const [userData, dashboardData, attemptsData, statsData] = await Promise.all([
          getCurrentUser(),
          getDashboardData(),
          getQuizAttempts(),
          getUserStats(),
        ]);

        if (!cancelled) {
          setUser(userData);
          setSubjects(dashboardData.subjects || []);
          setTasks(dashboardData.tasks || []);
          setAttempts(attemptsData || []);
          setStats(statsData || null);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Unable to load dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const completedTasks = tasks.filter(
    (t) => Number(t.completed) === 1 || t.completed === true,
  ).length;

  const pendingTasks = tasks.length - completedTasks;
  const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  const totalAttempts = stats?.total_attempts ?? attempts.length;
  const averageQuizScore = stats?.average_score ?? 0;
  const bestQuizScore = stats?.best_score ?? 0;
  const streakDays = stats?.streak_days ?? 0;

  const recentAttempts = [...attempts]
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .slice(0, 5);

  const upcomingTasks = tasks
    .filter((t) => t.due_date && !t.completed)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 3);

  const recentTasks = [...tasks].sort((a, b) => b.id - a.id).slice(0, 5);

  const subjectPerformance = stats?.subject_performance || [];
  const activity = stats?.activity || [];

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 dark:border-blue-800 border-t-blue-600" />
          <p className="text-sm text-slate-500 dark:text-slate-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">

      {/* ===================================================
          WELCOME BANNER + EXAM COUNTDOWN + STREAK
      =================================================== */}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

          {/* Left — greeting + progress */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-600">{greeting}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              Welcome back, {user?.name || "Student"}!
            </h1>
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
              {now.toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>

            {tasks.length > 0 && (
              <div className="mt-5 max-w-sm">
                <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-500">
                  <span>Overall task progress</span>
                  <span className="font-semibold text-blue-600">{progress}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {completedTasks} completed · {pendingTasks} pending
                </p>
              </div>
            )}

            {/* Avatar row for mobile */}
            <div className="mt-4 flex items-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-md">
                {(user?.name || "S").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{user?.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Right — avatar + exam countdown + streak */}
          <div className="flex flex-col items-start gap-4 lg:w-80 lg:shrink-0">
            <div className="hidden items-center gap-3 lg:flex">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-md">
                {(user?.name || "S").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{user?.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{user?.email}</p>
              </div>
            </div>

            <div className="w-full">
              <ExamCountdown />
            </div>

            <div className="w-full">
              <StreakWidget streakDays={streakDays} />
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================
          STAT CARDS
      =================================================== */}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon="📚" label="Subjects" value={subjects.length} sub="Active subjects" bg="bg-blue-50 dark:bg-blue-900/30" />
        <StatCard icon="📝" label="Total Tasks" value={tasks.length} sub="Study tasks" bg="bg-purple-50 dark:bg-purple-900/30" />
        <StatCard icon="✅" label="Completed" value={completedTasks} sub="Tasks done" valueClass="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
        <StatCard icon="⏳" label="Pending" value={pendingTasks} sub="Tasks remaining" valueClass="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/30" />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon="🎯" label="Quiz Attempts" value={totalAttempts} sub="Total quizzes completed" bg="bg-blue-50 dark:bg-blue-900/30" />
        <StatCard icon="📊" label="Average Score" value={`${averageQuizScore}%`} sub="Across all attempts" valueClass="text-blue-600" bg="bg-purple-50 dark:bg-purple-900/30" />
        <StatCard icon="🏆" label="Best Score" value={`${bestQuizScore}%`} sub="Your highest quiz score" valueClass="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
      </section>

      {/* ===================================================
          SCORE TREND + SUBJECT PERFORMANCE CHARTS
      =================================================== */}

      <section className="grid gap-6 lg:grid-cols-2">
        <ScoreTrendChart attempts={attempts} />
        <SubjectPerformanceChart subjectPerformance={subjectPerformance} />
      </section>

      {/* ===================================================
          AI RECOMMENDATIONS
      =================================================== */}

      <AIRecommendations />

      {/* ===================================================
          ACTIVITY TIMELINE + UPCOMING TASKS
      =================================================== */}

      <section className="grid gap-6 lg:grid-cols-2">
        <ActivityTimeline activity={activity} />

        {/* Upcoming due tasks */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Upcoming Due Tasks</h2>
            <Link to="/study-plan" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View All
            </Link>
          </div>

          {upcomingTasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 dark:bg-green-900/30 text-xl">🎉</div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No pending tasks with due dates</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">All caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingTasks.map((task) => {
                const due = new Date(task.due_date);
                const daysLeft = Math.ceil((due - now.getTime()) / (1000 * 60 * 60 * 24));
                const urgent = daysLeft <= 2;

                return (
                  <div key={task.id} className="flex items-center gap-4 px-6 py-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${urgent ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
                      {urgent ? "🔥" : "📌"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{task.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        Due {due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {" · "}
                        <span className={urgent ? "font-semibold text-red-500 dark:text-red-400" : ""}>
                          {daysLeft <= 0 ? "Overdue!" : `${daysLeft}d left`}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===================================================
          QUICK ACTIONS + SUBJECTS
      =================================================== */}

      <section className="grid gap-6 lg:grid-cols-2">
        {/* Quick actions */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              { label: "Study Plan", icon: "📅", to: "/study-plan", color: "bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 text-blue-700" },
              { label: "AI Tutor", icon: "🤖", to: "/ai-tutor", color: "bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 text-purple-700" },
              { label: "Take Quiz", icon: "🎯", to: "/quiz", color: "bg-green-50 dark:bg-green-900/30 hover:bg-green-100 text-green-700" },
              { label: "Documents", icon: "📄", to: "/documents", color: "bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 text-amber-700" },
              { label: "Subjects", icon: "📚", to: "/subjects", color: "bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-700" },
              { label: "Quiz History", icon: "📊", to: "/quiz-history", color: "bg-pink-50 dark:bg-pink-900/30 hover:bg-pink-100 text-pink-700" },
            ].map(({ label, icon, to, color }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${color}`}
              >
                <span className="text-lg">{icon}</span>
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Subjects with live progress */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Your Subjects</h2>
            <Link to="/subjects" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              Manage
            </Link>
          </div>

          {subjects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 text-xl">📚</div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No subjects yet</p>
              <Link to="/subjects" className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                Add Subject
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {subjects.slice(0, 5).map((subject) => {
                const sp = subjectPerformance.find((s) => s.subject_id === subject.id);
                const liveProgress = sp?.completion_percentage ?? subject.progress ?? 0;

                return (
                  <div key={subject.id} className="px-6 py-3.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{subject.name}</p>
                      <span className="text-xs font-semibold text-blue-600">{liveProgress}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-50 dark:bg-blue-900/30 transition-all duration-500"
                        style={{ width: `${liveProgress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===================================================
          RECENT QUIZ ATTEMPTS
      =================================================== */}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-5">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Recent Quiz Attempts</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-500">Your latest quiz results.</p>
          </div>
          <Link to="/quiz-history" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            View All
          </Link>
        </div>

        {recentAttempts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-2xl">🎯</div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No quiz attempts yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Complete a quiz to see your results here.</p>
            <Link to="/quiz" className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
              Take a Quiz
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentAttempts.map((attempt) => {
              const percentage = Number(attempt.percentage || 0);
              const scoreColor =
                percentage >= 80
                  ? "text-green-600 bg-green-50 dark:bg-green-900/30"
                  : percentage >= 60
                    ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30"
                    : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30";

              return (
                <div
                  key={attempt.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 text-xl">
                    🎯
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {attempt.quiz_title || `Quiz #${attempt.quiz_id}`}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-400 dark:text-slate-500">
                      <span>{attempt.score} / {attempt.total} correct</span>
                      {attempt.subject_name && (
                        <span className="text-blue-500 dark:text-blue-400">{attempt.subject_name}</span>
                      )}
                      {attempt.submitted_at && (
                        <span>
                          {new Date(attempt.submitted_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreColor}`}>
                      {percentage}%
                    </span>

                    <Link
                      to={`/quiz-history/${attempt.id}`}
                      className="text-xs font-medium text-blue-500 dark:text-blue-400 hover:text-blue-700"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================================
          RECENT STUDY TASKS
      =================================================== */}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-5">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Recent Study Tasks</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-500">Your latest study activities.</p>
          </div>
          <Link to="/study-plan" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            View All
          </Link>
        </div>

        {recentTasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-2xl">📝</div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No study tasks yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Create your first task from the Study Plan page.</p>
            <Link to="/study-plan" className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
              Create Task
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-4 px-6 py-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    task.completed
                      ? "bg-green-100 text-green-600"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {task.completed ? "✓" : "○"}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      task.completed ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {task.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-400 dark:text-slate-500">
                    {task.due_date && <span>Due: {task.due_date}</span>}
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    task.completed
                      ? "bg-green-50 dark:bg-green-900/30 text-green-700"
                      : "bg-amber-50 dark:bg-amber-900/30 text-amber-700"
                  }`}
                >
                  {task.completed ? "Done" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
