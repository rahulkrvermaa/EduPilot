import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, logoutUser } from "../services/api";
import { useTheme } from "../context/ThemeContext";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, toggleTheme } = useTheme();

  const [user, setUser] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error("Unable to load user:", error);
      }
    }

    loadUser();
  }, []);

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  const firstLetter = user?.name ? user.name.charAt(0).toUpperCase() : "S";

  const PAGE_META = {
    "/dashboard": { title: "Dashboard", subtitle: "Track your learning progress" },
    "/subjects": { title: "Subjects", subtitle: "Manage your study subjects" },
    "/documents": { title: "Documents", subtitle: "Upload and manage study materials" },
    "/ai-tutor": { title: "AI Tutor", subtitle: "Get instant help from AI" },
    "/quiz": { title: "Quizzes", subtitle: "Test your knowledge" },
    "/generate-quiz": { title: "Generate Quiz", subtitle: "Create quizzes with AI" },
    "/quiz-history": { title: "Quiz History", subtitle: "Review past quiz attempts" },
    "/study-plan": { title: "Study Plan", subtitle: "Organize your study tasks" },
    "/profile": { title: "Profile", subtitle: "Manage your account" },
  };

  const currentPath = location.pathname.replace(/\/+$/, "") || "/dashboard";
  const pageMeta = PAGE_META[currentPath] || { title: "EduPilot", subtitle: "" };

  return (
    <header className="fixed left-64 right-0 top-0 z-30 h-20 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="flex h-full items-center justify-between px-8">
        {/* Page title */}
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{pageMeta.title}</h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">{pageMeta.subtitle}</p>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-5">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          {/* Notification */}
          <button
            className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Notifications"
          >
            🔔
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
          </button>

          {/* User */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 font-semibold text-blue-600 dark:text-blue-400">
                {firstLetter}
              </div>

              {/* User details */}
              <div className="hidden text-left sm:block">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {user?.name || "Student"}
                </p>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user?.email || "Learner"}
                </p>
              </div>

              <span className="text-slate-400">▾</span>
            </button>

            {/* Dropdown */}
            {showMenu && (
              <div className="absolute right-0 top-14 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 shadow-lg">
                <div className="border-b border-slate-100 dark:border-slate-700 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {user?.name || "Student"}
                  </p>

                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {user?.email || ""}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowMenu(false);
                    navigate("/profile");
                  }}
                  className="mt-1 w-full rounded-lg px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Profile
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full rounded-lg px-4 py-2 text-left text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
