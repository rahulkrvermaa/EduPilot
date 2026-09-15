import { NavLink } from "react-router-dom";
import { config } from "../config";

function Sidebar() {
  const navigation = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: "🏠",
    },
    {
      name: "Subjects",
      path: "/subjects",
      icon: "📚",
    },
    {
      name: "Documents",
      path: "/documents",
      icon: "📄",
      feature: "documents",
    },
    {
      name: "AI Tutor",
      path: "/ai-tutor",
      icon: "🤖",
      feature: "aiTutor",
    },
    {
      name: "Quiz",
      path: "/quiz",
      icon: "📝",
    },
    {
      name: "Quiz History",
      path: "/quiz-history",
      icon: "📊",
      feature: "quizHistory",
    },
    {
      name: "Study Plan",
      path: "/study-plan",
      icon: "📅",
      feature: "studyPlan",
    },
  ].filter((item) => !item.feature || config.features[item.feature]);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
      {/* Logo */}
      <div className="flex h-20 items-center border-b border-slate-200 dark:border-slate-800 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl">
            🚀
          </div>

          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              EduPilot
            </h1>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              AI Academic Assistant
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Main Menu
        </p>

        <div className="space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                }`
              }
            >
              <span className="text-lg">
                {item.icon}
              </span>

              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom navigation */}
      <div className="absolute bottom-0 w-full border-t border-slate-200 dark:border-slate-800 p-4">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
              isActive
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`
          }
        >
          <span className="text-lg">👤</span>

          <span>Profile</span>
        </NavLink>
      </div>
    </aside>
  );
}

export default Sidebar;