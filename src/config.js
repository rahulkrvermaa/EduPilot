// =====================================================
// EduPilot client-side configuration
// =====================================================
// Centralized reader for VITE_* env vars. Components and the
// router consult this object instead of touching `import.meta.env`
// directly, so we have a single place to validate / default values.

function readBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export const config = {
  env: import.meta.env.VITE_ENV || "development",
  appName: import.meta.env.VITE_APP_NAME || "EduPilot",
  defaultTheme: import.meta.env.VITE_DEFAULT_THEME || "system",
  apiUrl: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 30000,
  apiRetryCount: Number(import.meta.env.VITE_API_RETRY_COUNT) || 1,
  apiRetryDelayMs: Number(import.meta.env.VITE_API_RETRY_DELAY_MS) || 600,
  tokenStorageKey:
    import.meta.env.VITE_TOKEN_STORAGE_KEY || "edupilotToken",
  maxUploadBytes:
    Number(import.meta.env.VITE_MAX_UPLOAD_BYTES) || 10 * 1024 * 1024,
  uploadAcceptedExtensions: (
    import.meta.env.VITE_UPLOAD_ACCEPTED_EXTENSIONS || ".pdf,.doc,.docx,.txt"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  features: {
    aiQuiz: readBool(import.meta.env.VITE_FEATURE_AI_QUIZ, true),
    aiTutor: readBool(import.meta.env.VITE_FEATURE_AI_TUTOR, true),
    documents: readBool(import.meta.env.VITE_FEATURE_DOCUMENTS, true),
    studyPlan: readBool(import.meta.env.VITE_FEATURE_STUDY_PLAN, true),
    quizHistory: readBool(import.meta.env.VITE_FEATURE_QUIZ_HISTORY, true),
  },
  analyticsId: import.meta.env.VITE_ANALYTICS_ID || "",
  devServerPort: Number(import.meta.env.VITE_DEV_SERVER_PORT) || 5173,
};

// True when running outside the local dev server. Helpful for showing
// staging banners or disabling dev-only diagnostics.
export const isProduction = config.env === "production";
export const isStaging = config.env === "staging";
