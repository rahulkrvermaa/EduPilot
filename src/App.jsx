import {
  lazy,
  Suspense,
} from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute, { isAuthenticated } from "./components/ProtectedRoute";
import RouteFallback from "./components/RouteFallback";
import { config } from "./config";

import Login from "./pages/Login";
import Register from "./pages/Register";

// Heavy pages are code-split so the initial bundle stays small.
// `recharts` alone is ~100 kB gzipped, and `react-markdown` adds another ~60 kB.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Subjects = lazy(() => import("./pages/Subjects"));
const StudyPlan = lazy(() => import("./pages/StudyPlan"));
const Documents = lazy(() => import("./pages/Documents"));
const Quiz = lazy(() => import("./pages/Quiz"));
const AITutor = lazy(() => import("./pages/AITutor"));
const Profile = lazy(() => import("./pages/Profile"));
const QuizHistory = lazy(() => import("./pages/QuizHistory"));
const QuizAttemptReview = lazy(() =>
  import("./pages/QuizAttemptReview"),
);
const AIGenerateQuiz = lazy(() => import("./pages/AIGenerateQuiz"));

// =====================================================
// PUBLIC ROUTE
// Redirects already-authenticated users to the dashboard.
// =====================================================

function PublicRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// =====================================================
// APP
// =====================================================

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* =================================================
              PUBLIC ROUTES
          ================================================= */}

          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />

          {/* =================================================
              PROTECTED ROUTES
          ================================================= */}

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/subjects" element={<Subjects />} />
            {config.features.studyPlan && (
              <Route path="/study-plan" element={<StudyPlan />} />
            )}
            {config.features.documents && (
              <Route path="/documents" element={<Documents />} />
            )}
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/quiz/:quizId" element={<Quiz />} />
            {config.features.aiQuiz && (
              <Route path="/generate-quiz" element={<AIGenerateQuiz />} />
            )}
            {config.features.quizHistory && (
              <Route path="/quiz-history" element={<QuizHistory />} />
            )}
            {config.features.quizHistory && (
              <Route
                path="/quiz-history/:attemptId"
                element={<QuizAttemptReview />}
              />
            )}
            {config.features.aiTutor && (
              <Route path="/ai-tutor" element={<AITutor />} />
            )}
            <Route path="/profile" element={<Profile />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>

          {/* =================================================
              UNKNOWN ROUTES
          ================================================= */}

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
