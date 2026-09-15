import { useEffect, useState } from "react";
import {
  createSubject,
  getSubjects,
  updateSubject,
  deleteSubject,
  getUserStats,
} from "../services/api";
import { useToast } from "../context/ToastContext";

const SUBJECT_COLORS = [
  { gradient: "from-blue-500 to-blue-600", light: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", bar: "bg-blue-50 dark:bg-blue-900/30" },
  { gradient: "from-violet-500 to-violet-600", light: "bg-violet-50 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-400", bar: "bg-violet-50 dark:bg-violet-900/30" },
  { gradient: "from-emerald-500 to-emerald-600", light: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-50 dark:bg-emerald-900/30" },
  { gradient: "from-amber-500 to-amber-600", light: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-50 dark:bg-amber-900/30" },
  { gradient: "from-pink-500 to-pink-600", light: "bg-pink-50 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400", bar: "bg-pink-50 dark:bg-pink-900/30" },
  { gradient: "from-cyan-500 to-cyan-600", light: "bg-cyan-50 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-400", bar: "bg-cyan-50 dark:bg-cyan-900/30" },
];

function Subjects() {
  const toast = useToast();
  const [subjects, setSubjects] = useState([]);
  const [subjectPerformance, setSubjectPerformance] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [data, statsData] = await Promise.all([
          getSubjects(),
          getUserStats().catch(() => null),
        ]);

        if (!cancelled) {
          setSubjects(Array.isArray(data) ? data : []);
          setSubjectPerformance(statsData?.subject_performance || []);
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

  function getLiveProgress(subjectId) {
    const sp = subjectPerformance.find((s) => s.subject_id === subjectId);
    return sp?.completion_percentage ?? 0;
  }

  function getLiveAvgScore(subjectId) {
    const sp = subjectPerformance.find((s) => s.subject_id === subjectId);
    return sp?.average_score ?? null;
  }

  function getLiveAttempts(subjectId) {
    const sp = subjectPerformance.find((s) => s.subject_id === subjectId);
    return sp?.attempts ?? 0;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Please enter a subject name."); return; }

    try {
      setCreating(true);
      const s = await createSubject(name.trim(), description.trim());
      setSubjects((prev) => [...prev, s]);
      setName("");
      setDescription("");
      setShowForm(false);
      toast.success("Subject created.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(subject) {
    setEditingId(subject.id);
    setEditName(subject.name);
    setEditDescription(subject.description || "");
  }

  async function handleSaveEdit(subjectId) {
    if (!editName.trim()) { toast.error("Name cannot be empty."); return; }

    try {
      setSaving(true);
      const updated = await updateSubject(subjectId, editName.trim(), editDescription.trim());
      setSubjects((prev) => prev.map((s) => s.id === subjectId ? updated : s));
      setEditingId(null);
      toast.success("Subject updated.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(subjectId) {
    if (!window.confirm("Delete this subject and all its tasks, documents, and quizzes? This cannot be undone.")) return;

    try {
      setDeletingId(subjectId);
      await deleteSubject(subjectId);
      setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
      toast.success("Subject deleted.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-100 dark:border-blue-700 border-t-blue-600" />
          <p className="text-sm text-slate-500 dark:text-slate-500">Loading subjects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">Learning</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">My Subjects</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
            {subjects.length} subject{subjects.length !== 1 ? "s" : ""} · Manage your learning areas
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(!showForm); }}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:hover:bg-blue-500"
        >
          {showForm ? "Cancel" : "+ Add Subject"}
        </button>
      </div>

      {/* ── Add Form ── */}
      {showForm && (
        <div className="rounded-2xl border border-blue-100 dark:border-blue-700 bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-blue-50 dark:ring-blue-900/30">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add New Subject</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-500">Create a subject to organise tasks, documents, and quizzes.</p>

          <form onSubmit={handleCreate} className="mt-5 space-y-4">
            <div>
              <label htmlFor="s-name" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Subject Name <span className="text-red-500">*</span>
              </label>
              <input
                id="s-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Database Management Systems"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:text-slate-500 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="s-desc" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Description <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
              </label>
              <textarea
                id="s-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What topics will you study?"
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:text-slate-500 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500 disabled:opacity-60"
              >
                {creating ? "Adding..." : "Add Subject"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:bg-slate-800/50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Empty state ── */}
      {subjects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white dark:bg-slate-900 px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-3xl">📚</div>
          <h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">No subjects yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-500">
            Add your first subject to start organising your study materials, tasks, and quizzes.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 dark:hover:bg-blue-500"
          >
            Add Your First Subject
          </button>
        </div>
      )}

      {/* ── Subject cards ── */}
      {subjects.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject, idx) => {
            const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
            const liveProgress = getLiveProgress(subject.id);
            const avgScore = getLiveAvgScore(subject.id);
            const attempts = getLiveAttempts(subject.id);
            const isEditing = editingId === subject.id;
            const isDeleting = deletingId === subject.id;

            return (
              <div
                key={subject.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {/* Top color bar */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${color.gradient}`} />

                <div className="p-6">
                  {isEditing ? (
                    /* ── Edit mode ── */
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Subject name"
                        autoFocus
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Description (optional)"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(subject.id)}
                          disabled={saving}
                          className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 dark:hover:bg-blue-500 disabled:opacity-60"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── View mode ── */
                    <>
                      {/* Icon + actions */}
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${color.gradient} text-xl text-white shadow-sm`}>
                          📚
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={() => startEdit(subject)}
                            className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-700 dark:text-slate-300"
                            title="Edit subject"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(subject.id)}
                            disabled={isDeleting}
                            className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                            title="Delete subject"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Name + desc */}
                      <h2 className="mt-4 font-semibold text-slate-900 dark:text-slate-100 leading-tight">{subject.name}</h2>
                      <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-slate-500 dark:text-slate-500">
                        {subject.description || "No description."}
                      </p>

                      {/* Live stats row */}
                      <div className="mt-4 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
                        {attempts > 0 && (
                          <span className={`rounded-full px-2.5 py-1 font-medium ${color.light} ${color.text}`}>
                            Avg {Math.round(avgScore ?? 0)}%
                          </span>
                        )}
                        {attempts > 0 && (
                          <span className="text-slate-400 dark:text-slate-500">{attempts} quiz{attempts !== 1 ? "zes" : ""}</span>
                        )}
                        {attempts === 0 && (
                          <span className="text-slate-300 italic">No quizzes yet</span>
                        )}
                      </div>

                      {/* Live progress */}
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-slate-400 dark:text-slate-500">Task progress</span>
                          <span className={`font-semibold ${color.text}`}>{liveProgress}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${color.bar}`}
                            style={{ width: `${liveProgress}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Subjects;
