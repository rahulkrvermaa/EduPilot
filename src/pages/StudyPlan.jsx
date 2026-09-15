import { useEffect, useMemo, useState } from "react";
import {
  createStudyTask,
  getStudyTasks,
  getSubjects,
  toggleStudyTask,
  deleteStudyTask,
  generateStudyPlan,
} from "../services/api";
import { useToast } from "../context/ToastContext";

function StudyPlan() {
  const toast = useToast();

  // ============================================================
  // TASK MANAGEMENT
  // ============================================================
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subjectId, setSubjectId] = useState("");

  // ============================================================
  // SMART PLANNER
  // ============================================================
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerStep, setPlannerStep] = useState("form");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [creatingPlanTasks, setCreatingPlanTasks] = useState(false);

  const [examName, setExamName] = useState("");
  const [daysRemaining, setDaysRemaining] = useState("");
  const [studyHoursPerDay, setStudyHoursPerDay] = useState("");
  const [currentKnowledge, setCurrentKnowledge] = useState("medium");
  const [plannerSubjectId, setPlannerSubjectId] = useState("");

  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [createdPlanDays, setCreatedPlanDays] = useState(new Set());

  // ============================================================
  // LOAD DATA
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        const [taskData, subjectData] = await Promise.all([
          getStudyTasks(),
          getSubjects(),
        ]);

        if (cancelled) return;

        setTasks(Array.isArray(taskData) ? taskData : []);
        setSubjects(Array.isArray(subjectData) ? subjectData : []);

        if (subjectData?.length > 0) {
          const firstSubjectId = String(subjectData[0].id);

          setSubjectId((current) => current || firstSubjectId);
          setPlannerSubjectId(
            (current) => current || firstSubjectId
          );
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.message || "Unable to load study data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================
  // SUBJECT LOOKUP
  // ============================================================
  function getSubjectName(id) {
    const subject = subjects.find(
      (item) => Number(item.id) === Number(id)
    );

    return subject?.name || "Unknown subject";
  }

  const selectedPlannerSubject = useMemo(() => {
    return subjects.find(
      (subject) =>
        Number(subject.id) === Number(plannerSubjectId)
    );
  }, [subjects, plannerSubjectId]);

  // ============================================================
  // CREATE NORMAL TASK
  // ============================================================
  async function handleCreateTask(event) {
    event.preventDefault();

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (!cleanTitle) {
      toast.error("Please enter a task title.");
      return;
    }

    if (!subjectId) {
      toast.error("Please select a subject.");
      return;
    }

    try {
      setCreating(true);
      /*
       * IMPORTANT:
       * createStudyTask should send:
       *
       * {
       *   title,
       *   description,
       *   due_date,
       *   subject_id
       * }
       *
       * The backend should obtain user_id from the
       * authenticated user.
       */
      const newTask = await createStudyTask(
        cleanTitle,
        cleanDescription,
        dueDate || "",
        Number(subjectId)
      );

      setTasks((current) => [...current, newTask]);

      setTitle("");
      setDescription("");
      setDueDate("");
      setShowForm(false);
    } catch (err) {
      toast.error(err?.message || "Unable to create study task.");
    } finally {
      setCreating(false);
    }
  }

  // ============================================================
  // TOGGLE TASK
  // ============================================================
  async function handleToggleTask(taskId) {
    try {
      const updatedTask = await toggleStudyTask(taskId);

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? updatedTask : task
        )
      );
    } catch (err) {
      toast.error(err?.message || "Unable to update study task.");
    }
  }

  // ============================================================
  // DELETE TASK
  // ============================================================
  async function handleDeleteTask(taskId) {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;

    try {
      await deleteStudyTask(taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
    } catch (err) {
      toast.error(err?.message || "Unable to delete study task.");
    }
  }

  // ============================================================
  // GENERATE PLAN
  // ============================================================
  async function handleGeneratePlan(event) {
    event.preventDefault();
    const cleanExamName = examName.trim();
    const days = Number(daysRemaining);
    const hours = Number(studyHoursPerDay);

    if (!cleanExamName) {
      toast.error("Please enter an exam name.");
      return;
    }

    if (!Number.isInteger(days) || days <= 0) {
      toast.error("Days remaining must be a whole number greater than 0.");
      return;
    }

    if (days > 365) {
      toast.error("Please enter 365 days or fewer.");
      return;
    }

    if (!Number.isFinite(hours) || hours <= 0) {
      toast.error("Study hours per day must be greater than 0.");
      return;
    }

    if (hours > 16) {
      toast.error("Study hours per day cannot exceed 16.");
      return;
    }

    if (!plannerSubjectId) {
      toast.error("Please select a subject.");
      return;
    }

    try {
      setGeneratingPlan(true);

      const plan = await generateStudyPlan(
        cleanExamName,
        days,
        hours,
        currentKnowledge,
        plannerSubjectId
      );

      setGeneratedPlan(plan);
      setCreatedPlanDays(new Set());
      setPlannerStep("viewing");
    } catch (err) {
      toast.error(err?.message || "Unable to generate study plan.");
    } finally {
      setGeneratingPlan(false);
    }
  }

  // ============================================================
  // CREATE ONE PLAN TASK
  // ============================================================
  async function handleCreateTaskFromPlan(dayIndex) {
    if (!generatedPlan) return;

    const day = generatedPlan.study_plan[dayIndex];

    if (!day) return;

    if (!plannerSubjectId) {
      toast.error("Please select a subject first.");
      return;
    }

    if (createdPlanDays.has(day.day)) {
      return;
    }

    const taskTitle = `Day ${day.day}: ${day.topic}`;

    const taskDescription = [
      day.description,
      `Estimated study time: ${day.estimated_hours} hours`,
      `Exam: ${generatedPlan.exam}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const newTask = await createStudyTask(
        taskTitle,
        taskDescription,
        "",
        Number(plannerSubjectId)
      );

      setTasks((current) => [...current, newTask]);

      setCreatedPlanDays((current) => {
        const next = new Set(current);
        next.add(day.day);
        return next;
      });
    } catch (err) {
      toast.error(err?.message || "Unable to create study task.");
    }
  }

  // ============================================================
  // CREATE ALL PLAN TASKS
  // ============================================================
  async function handleCreateAllPlanTasks() {
    if (!generatedPlan) return;

    if (!plannerSubjectId) {
      toast.error("Please select a subject first.");
      return;
    }

    try {
      setCreatingPlanTasks(true);
      const existingTitles = new Set(
        tasks.map((task) => task.title)
      );

      const daysToCreate = generatedPlan.study_plan.filter(
        (day) =>
          !existingTitles.has(
            `Day ${day.day}: ${day.topic}`
          )
      );

      for (const day of daysToCreate) {
        const taskTitle = `Day ${day.day}: ${day.topic}`;

        const taskDescription = [
          day.description,
          `Estimated study time: ${day.estimated_hours} hours`,
          `Exam: ${generatedPlan.exam}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        await createStudyTask(
          taskTitle,
          taskDescription,
          "",
          Number(plannerSubjectId)
        );
      }

      const updatedTasks = await getStudyTasks();

      setTasks(
        Array.isArray(updatedTasks)
          ? updatedTasks
          : []
      );

      setCreatedPlanDays(
        new Set(
          generatedPlan.study_plan.map(
            (day) => day.day
          )
        )
      );
    } catch (err) {
      toast.error(err?.message || "Unable to create study tasks.");
    } finally {
      setCreatingPlanTasks(false);
    }
  }

  // ============================================================
  // RESET PLANNER
  // ============================================================
  function resetPlanner() {
    setExamName("");
    setDaysRemaining("");
    setStudyHoursPerDay("");
    setCurrentKnowledge("medium");

    setPlannerSubjectId(
      subjects.length > 0
        ? String(subjects[0].id)
        : ""
    );

    setGeneratedPlan(null);
    setCreatedPlanDays(new Set());
    setPlannerStep("form");
  }

  // ============================================================
  // TASK SUMMARY
  // ============================================================
  const completedTasks = tasks.filter(
    (task) => task.completed
  ).length;

  const remainingTasks =
    tasks.length - completedTasks;

  const completionPercentage =
    tasks.length > 0
      ? Math.round(
          (completedTasks / tasks.length) * 100
        )
      : 0;

  // ============================================================
  // LOADING
  // ============================================================
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-sm text-slate-500 dark:text-slate-500 shadow-sm">
          Loading study plan...
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ======================================================
          HEADER
      ====================================================== */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Study Plan
          </h1>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
            Organize your study tasks and stay on track.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowForm((current) => !current);
          }}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
        >
          {showForm ? "Cancel" : "+ Add Task"}
        </button>
      </div>

      {/* ======================================================
          SUMMARY
      ====================================================== */}
      <div className="grid gap-4 sm:grid-cols-4">

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Total Tasks
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {tasks.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Completed
          </p>

          <p className="mt-2 text-2xl font-bold text-green-600 dark:text-green-400">
            {completedTasks}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Remaining
          </p>

          <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {remainingTasks}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Progress
          </p>

          <p className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
            {completionPercentage}%
          </p>
        </div>

      </div>

      {/* ======================================================
          SMART PLANNER
      ====================================================== */}
      <div className="rounded-2xl border border-blue-200 dark:border-blue-700 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-6 shadow-sm">

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🧠</span>

              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Smart Study Planner
              </h2>
            </div>

            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Generate a personalized schedule based on
              your subject, available time, and knowledge level.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowPlanner((current) => !current);
              if (!showPlanner) {
                setPlannerStep("form");
              }
            }}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
          >
            {showPlanner
              ? "Close Planner"
              : "Create Smart Plan"}
          </button>

        </div>

        {/* ====================================================
            PLANNER FORM
        ==================================================== */}
        {showPlanner && plannerStep === "form" && (
          <form
            onSubmit={handleGeneratePlan}
            className="mt-6 space-y-5 rounded-2xl border border-blue-100 dark:border-blue-800 bg-white dark:bg-slate-900 p-5"
          >

            <div>
              <label
                htmlFor="exam-name"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Exam
              </label>

              <input
                id="exam-name"
                type="text"
                value={examName}
                onChange={(event) =>
                  setExamName(event.target.value)
                }
                placeholder="e.g. Semester Exam"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="planner-subject"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Subject
              </label>

              <select
                id="planner-subject"
                value={plannerSubjectId}
                onChange={(event) =>
                  setPlannerSubjectId(event.target.value)
                }
                disabled={subjects.length === 0}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 disabled:bg-slate-50 dark:disabled:bg-slate-800/50"
              >
                {subjects.length === 0 ? (
                  <option value="">
                    No subjects available
                  </option>
                ) : (
                  subjects.map((subject) => (
                    <option
                      key={subject.id}
                      value={subject.id}
                    >
                      {subject.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">

              <div>
              <label
                htmlFor="days-remaining"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Days Remaining
              </label>

              <input
                id="days-remaining"
                type="number"
                min="1"
                max="365"
                step="1"
                value={daysRemaining}
                onChange={(event) =>
                  setDaysRemaining(event.target.value)
                }
                placeholder="e.g. 12"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
              </div>

              <div>
              <label
                htmlFor="study-hours"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Study Time / Day
              </label>

              <input
                id="study-hours"
                type="number"
                min="0.5"
                max="16"
                step="0.5"
                value={studyHoursPerDay}
                onChange={(event) =>
                  setStudyHoursPerDay(event.target.value)
                }
                placeholder="e.g. 3"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
              </div>

            </div>

            <div>
              <label
                htmlFor="knowledge-level"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Current Knowledge
              </label>

              <select
                id="knowledge-level"
                value={currentKnowledge}
                onChange={(event) =>
                  setCurrentKnowledge(event.target.value)
                }
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              >
                <option value="weak">
                  Weak
                </option>

                <option value="medium">
                  Medium
                </option>

                <option value="strong">
                  Strong
                </option>
              </select>
            </div>

            {selectedPlannerSubject && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
                Planning for{" "}
                <span className="font-semibold">
                  {selectedPlannerSubject.name}
                </span>
                .
              </div>
            )}

            <button
              type="submit"
              disabled={
                generatingPlan ||
                subjects.length === 0
              }
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generatingPlan
                ? "Generating Smart Plan..."
                : "Generate Smart Study Plan"}
            </button>

          </form>
        )}

        {/* ====================================================
            GENERATED PLAN
        ==================================================== */}
        {showPlanner &&
          plannerStep === "viewing" &&
          generatedPlan && (
            <div className="mt-6">

              <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {generatedPlan.exam} Study Plan
                  </h3>

                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {generatedPlan.days_remaining} days ·{" "}
                    {generatedPlan.study_hours_per_day}{" "}
                    hours/day ·{" "}
                    {generatedPlan.current_knowledge}
                  </p>

                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Subject:{" "}
                    {generatedPlan.subject_name}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">

                  <button
                    type="button"
                    onClick={() => setPlannerStep("form")}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Edit Plan
                  </button>

                  <button
                    type="button"
                    onClick={resetPlanner}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    New Plan
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateAllPlanTasks}
                    disabled={creatingPlanTasks}
                    className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 dark:hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingPlanTasks
                      ? "Adding..."
                      : "Add All Tasks"}
                  </button>

                </div>

              </div>

              {/* PLAN DAYS */}
              <div className="space-y-3">

                {generatedPlan.study_plan.map(
                  (day, index) => {
                    const alreadyCreated =
                      createdPlanDays.has(day.day);

                    return (
                      <div
                        key={day.day}
                        className={`flex flex-col gap-4 rounded-2xl border p-5 shadow-sm transition sm:flex-row sm:items-center ${
                          alreadyCreated
                            ? "border-green-200 dark:border-green-700 bg-green-50/40 dark:bg-green-900/30"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        }`}
                      >

                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30 font-bold text-blue-700 dark:text-blue-400">
                          {day.day}
                        </div>

                        <div className="min-w-0 flex-1">

                          <div className="flex flex-wrap items-center gap-2">

                            <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                              {day.topic}
                            </h4>

                            {day.priority > 0 && (
                              <span className="rounded-full bg-purple-50 dark:bg-purple-900/30 px-2.5 py-1 text-xs font-medium text-purple-700 dark:text-purple-400">
                                Priority {day.priority}
                              </span>
                            )}

                            {day.type === "revision" && (
                              <span className="rounded-full bg-green-50 dark:bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
                                Revision
                              </span>
                            )}

                            {day.type === "practice" && (
                              <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                                Practice
                              </span>
                            )}

                          </div>

                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                            {day.description}
                          </p>

                          <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                            ⏱ {day.estimated_hours} hours
                          </p>

                        </div>

                        <button
                          type="button"
                          disabled={alreadyCreated}
                          onClick={() =>
                            handleCreateTaskFromPlan(
                              index
                            )
                          }
                          className={`rounded-xl border px-4 py-2 text-sm font-medium ${
                            alreadyCreated
                              ? "cursor-not-allowed border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                              : "border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          }`}
                        >
                          {alreadyCreated
                            ? "Added"
                            : "Add Task"}
                        </button>

                      </div>
                    );
                  }
                )}

              </div>

              {/* ALGORITHM INFO */}
              <div className="mt-5 rounded-xl border border-purple-100 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 p-4">

                <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                  How Smart Planning Works
                </p>

                <p className="mt-1 text-xs leading-5 text-purple-700 dark:text-purple-400">
                  Topic priority considers topic importance,
                  exam frequency, your current knowledge level,
                  and the amount of time remaining.
                </p>

                <div className="mt-2 rounded-lg bg-white/70 dark:bg-slate-800/70 px-3 py-2 text-xs font-semibold text-purple-900 dark:text-purple-200">
                  Priority = Weight × Exam Frequency ×
                  Weakness ÷ Days Remaining
                </div>

                <p className="mt-2 text-xs leading-5 text-purple-700 dark:text-purple-400">
                  The final day is reserved for revision and a
                  mock test. When there are at least three days,
                  the previous day is reserved for previous-year
                  questions.
                </p>

              </div>

            </div>
          )}

      </div>

      {/* ======================================================
          NORMAL CREATE TASK FORM
      ====================================================== */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">

          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Create Study Task
          </h2>

          <form
            onSubmit={handleCreateTask}
            className="mt-5 space-y-4"
          >

            <div>
              <label
                htmlFor="task-title"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Task Title
              </label>

              <input
                id="task-title"
                type="text"
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="e.g. Study Normalization"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="task-description"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Description
              </label>

              <textarea
                id="task-description"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="What do you need to study?"
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">

              <div>
              <label
                htmlFor="task-subject"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Subject
              </label>

              <select
                id="task-subject"
                value={subjectId}
                onChange={(event) =>
                  setSubjectId(event.target.value)
                }
                disabled={subjects.length === 0}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 disabled:bg-slate-50 dark:disabled:bg-slate-800/50"
              >
                  {subjects.length === 0 ? (
                    <option value="">
                      No subjects available
                    </option>
                  ) : (
                    subjects.map((subject) => (
                      <option
                        key={subject.id}
                        value={subject.id}
                      >
                        {subject.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
              <label
                htmlFor="task-date"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Due Date
              </label>

              <input
                id="task-date"
                type="date"
                value={dueDate}
                onChange={(event) =>
                  setDueDate(event.target.value)
                }
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800/50 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
              </div>

            </div>

            <button
              type="submit"
              disabled={
                creating ||
                subjects.length === 0
              }
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating
                ? "Creating..."
                : "Create Task"}
            </button>

          </form>

        </div>
      )}

      {/* ======================================================
          TASK LIST
      ====================================================== */}
      {tasks.length === 0 ? (

        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-6 py-12 text-center shadow-sm">

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-2xl">
            📅
          </div>

          <h2 className="mt-4 font-semibold text-slate-900 dark:text-slate-100">
            No study tasks yet
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create your first task or generate a smart study plan.
          </p>

          <div className="mt-5 flex justify-center gap-2">

            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 dark:hover:bg-blue-500"
            >
              Create Task
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPlanner(true);
                setPlannerStep("form");
              }}
              className="rounded-xl border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-900 px-5 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            >
              Smart Plan
            </button>

          </div>

        </div>

      ) : (

        <div className="space-y-3">

          {tasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-start gap-4 rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm transition ${
                task.completed
                  ? "border-green-200 dark:border-green-700 bg-green-50/30 dark:bg-green-900/30"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >

              <button
                type="button"
                onClick={() =>
                  handleToggleTask(task.id)
                }
                aria-label={
                  task.completed
                    ? "Mark task incomplete"
                    : "Mark task complete"
                }
                className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                  task.completed
                    ? "border-green-500 dark:border-green-400 bg-green-500 dark:bg-green-600 text-white dark:text-slate-100"
                    : "border-slate-300 dark:border-slate-500 text-transparent hover:border-blue-500"
                }`}
              >
                ✓
              </button>

              <div className="min-w-0 flex-1">

                <h3
                  className={`font-semibold ${
                    task.completed
                      ? "text-slate-400 dark:text-slate-500 line-through"
                      : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {task.title}
                </h3>

                {task.description && (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-500 dark:text-slate-500">
                    {task.description}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">

                  <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                    {getSubjectName(task.subject_id)}
                  </span>

                  {task.due_date && (
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-500">
                      Due: {task.due_date}
                    </span>
                  )}

                  {task.completed ? (
                    <span className="rounded-full bg-green-50 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400">
                      Completed
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Pending
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteTask(task.id)}
                    className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 transition hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400"
                    title="Delete task"
                  >
                    🗑️
                  </button>

                </div>

              </div>

            </div>
          ))}

        </div>

      )}

    </div>
  );
}

export default StudyPlan;
