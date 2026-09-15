// =====================================================
// EduPilot API Client
// =====================================================

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const TOKEN_KEY =
  import.meta.env.VITE_TOKEN_STORAGE_KEY || "edupilotToken";

// Per-request timeout, in milliseconds. 0 disables the timeout entirely.
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 30000;
// How many times to retry transient (5xx / 429) responses or network errors.
const DEFAULT_RETRIES = Number(import.meta.env.VITE_API_RETRY_COUNT) || 1;
// Initial backoff delay, in milliseconds. Doubles on every retry.
const DEFAULT_RETRY_DELAY_MS =
  Number(import.meta.env.VITE_API_RETRY_DELAY_MS) || 600;

// =====================================================
// TOKEN HELPERS
// =====================================================

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function requireToken() {
  const token = getToken();

  if (!token) {
    throw new Error("You are not logged in.");
  }

  return token;
}

// =====================================================
// COMMON API REQUEST
// =====================================================

async function apiRequest(endpoint, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const baseHeaders = {
    ...(options.headers || {}),
  };
  if (!isFormData) {
    baseHeaders["Content-Type"] = "application/json";
  }
  if (token && !baseHeaders.Authorization) {
    baseHeaders.Authorization = `Bearer ${token}`;
  }

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

    let response;

    try {
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: baseHeaders,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (error?.name === "AbortError") {
        // Don't retry timeouts — the request might have gone through.
        throw new Error(
          "The request timed out. Please try again.",
          { cause: error },
        );
      }
      // Network error — retry if we have attempts left.
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * (attempt + 1)),
        );
        continue;
      }
      throw new Error(
        "Unable to connect to EduPilot backend. Make sure FastAPI is running.",
        { cause: error },
      );
    }

    clearTimeout(timeoutId);

    // 401 should never be retried — the token is bad.
    if (response.status === 401) {
      let data = {};
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      logoutUser();
      throw new Error(
        data.detail ||
          "Your session has expired. Please log in again.",
      );
    }

    // Retry 5xx and 429 with backoff.
    if (
      (response.status >= 500 || response.status === 429) &&
      attempt < retries
    ) {
      // Drain the body before retrying to free the connection.
      try {
        await response.text();
      } catch {
        /* noop */
      }
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * (attempt + 1)),
      );
      continue;
    }

    let data = {};
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { detail: text };
      }
    }

    if (!response.ok) {
      throw new Error(
        data.detail ||
          data.message ||
          `Request failed with status ${response.status}.`,
      );
    }

    return data;
  }

  // Should never reach here, but just in case.
  throw (
    lastError ||
    new Error("Request failed after retries.")
  );
}

// =====================================================
// AUTH
// =====================================================

export async function registerUser(name, email, password) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim(),
      password,
    }),
  });
}

// =====================================================
// LOGIN
// =====================================================

export async function loginUser(email, password) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim(),
      password,
    }),
  });

  if (!data.access_token) {
    throw new Error("Login succeeded but no access token was returned.");
  }

  localStorage.setItem(TOKEN_KEY, data.access_token);

  return data;
}

// =====================================================
// CURRENT USER
// =====================================================

export async function getCurrentUser() {
  requireToken();

  return apiRequest("/auth/me", {
    method: "GET",
  });
}

// =====================================================
// LOGOUT
// =====================================================

export function logoutUser() {
  localStorage.removeItem(TOKEN_KEY);

  localStorage.removeItem("active_quiz_state");
}

// =====================================================
// USER STATS / ANALYTICS
// =====================================================

export async function getUserStats() {
  requireToken();

  return apiRequest("/user/stats", {
    method: "GET",
  });
}

// =====================================================
// EXAM SETTINGS (persistent countdown)
// =====================================================

export async function getExamSettings() {
  requireToken();

  return apiRequest("/user/exam", {
    method: "GET",
  });
}

export async function updateExamSettings(examName, examDate) {
  requireToken();

  return apiRequest("/user/exam", {
    method: "PUT",
    body: JSON.stringify({
      exam_name: examName || null,
      exam_date: examDate || null,
    }),
  });
}

export async function clearExamSettings() {
  requireToken();

  return apiRequest("/user/exam", {
    method: "DELETE",
  });
}

// =====================================================
// AI RECOMMENDATIONS
// =====================================================

export async function getAIRecommendations() {
  requireToken();

  return apiRequest("/user/recommendations", {
    method: "GET",
  });
}

// =====================================================
// SUBJECTS
// =====================================================

export async function getSubjects() {
  requireToken();

  return apiRequest("/subjects", {
    method: "GET",
  });
}

export async function createSubject(name, description = null) {
  requireToken();

  return apiRequest("/subjects", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      description: description?.trim() || null,
    }),
  });
}

export async function updateSubject(subjectId, name, description = null) {
  requireToken();

  return apiRequest(`/subjects/${subjectId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: name.trim(),
      description: description?.trim() || null,
    }),
  });
}

export async function deleteSubject(subjectId) {
  requireToken();

  return apiRequest(`/subjects/${subjectId}`, {
    method: "DELETE",
  });
}

// =====================================================
// STUDY TASKS
// =====================================================

export async function getStudyTasks() {
  requireToken();

  return apiRequest("/study-tasks", {
    method: "GET",
  });
}

export async function createStudyTask(title, description, dueDate, subjectId) {
  requireToken();

  return apiRequest("/study-tasks", {
    method: "POST",
    body: JSON.stringify({
      title: title.trim(),
      description: description?.trim() || null,
      due_date: dueDate || null,
      subject_id: Number(subjectId),
    }),
  });
}

export async function toggleStudyTask(taskId) {
  requireToken();

  return apiRequest(`/study-tasks/${taskId}/complete`, {
    method: "PATCH",
  });
}

export async function deleteStudyTask(taskId) {
  requireToken();

  return apiRequest(`/study-tasks/${taskId}`, {
    method: "DELETE",
  });
}

// =====================================================
// DASHBOARD
// =====================================================

export async function getDashboardData() {
  requireToken();

  const [subjects, tasks] = await Promise.all([getSubjects(), getStudyTasks()]);

  return {
    subjects,
    tasks,
  };
}

// =====================================================
// DOCUMENTS
// =====================================================

export async function getDocuments() {
  requireToken();

  return apiRequest("/documents", {
    method: "GET",
  });
}

export async function uploadDocument(file, subjectId = null) {
  requireToken();

  if (!file) {
    throw new Error("Please select a file.");
  }

  const formData = new FormData();

  formData.append("file", file);

  if (subjectId !== null && subjectId !== undefined && subjectId !== "") {
    formData.append("subject_id", String(subjectId));
  }

  return apiRequest("/documents", {
    method: "POST",
    body: formData,
  });
}

export async function deleteDocument(documentId) {
  requireToken();

  return apiRequest(`/documents/${documentId}`, {
    method: "DELETE",
  });
}

// =====================================================
// QUIZZES
// =====================================================

export async function getQuizzes() {
  requireToken();

  return apiRequest("/quizzes", {
    method: "GET",
  });
}

export async function getQuiz(quizId) {
  requireToken();

  return apiRequest(`/quizzes/${quizId}`, {
    method: "GET",
  });
}

export async function createQuiz(title, subjectId, questions) {
  requireToken();

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Quiz must contain at least one question.");
  }

  return apiRequest("/quizzes", {
    method: "POST",
    body: JSON.stringify({
      title: title.trim(),
      subject_id: Number(subjectId),
      questions,
    }),
  });
}

// =====================================================
// AI QUIZ GENERATION
// =====================================================

export async function generateAIQuiz(title, subjectId, numberOfQuestions = 5) {
  requireToken();

  const count = Number(numberOfQuestions);

  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error("Number of questions must be between 1 and 20.");
  }

  return apiRequest("/quizzes/generate", {
    method: "POST",
    body: JSON.stringify({
      title: title.trim(),
      subject_id: Number(subjectId),
      number_of_questions: count,
    }),
  });
}

// =====================================================
// SUBMIT QUIZ
// =====================================================

export async function submitQuiz(quizId, answers) {
  requireToken();

  if (!Array.isArray(answers)) {
    throw new Error("Quiz answers must be an array.");
  }

  return apiRequest(`/quizzes/${quizId}/submit`, {
    method: "POST",
    body: JSON.stringify({
      answers,
    }),
  });
}

// =====================================================
// QUIZ ATTEMPTS / HISTORY
// =====================================================

export async function getQuizAttempts() {
  requireToken();

  return apiRequest("/quiz-attempts", {
    method: "GET",
  });
}

export async function getQuizAttempt(attemptId) {
  requireToken();

  return apiRequest(`/quiz-attempts/${attemptId}`, {
    method: "GET",
  });
}

// =====================================================
// AI TUTOR
// =====================================================

export async function askAI(question) {
  requireToken();

  if (!question?.trim()) {
    throw new Error("Question cannot be empty.");
  }

  return apiRequest("/ai/ask", {
    method: "POST",
    body: JSON.stringify({
      question: question.trim(),
    }),
  });
}

// =====================================================
// AI RAG CHAT
// =====================================================

export async function askAITutor(message, subjectId = null) {
  requireToken();

  if (!message?.trim()) {
    throw new Error("Message cannot be empty.");
  }

  return apiRequest("/chat/ask", {
    method: "POST",
    body: JSON.stringify({
      message: message.trim(),
      subject_id:
        subjectId !== null && subjectId !== undefined && subjectId !== ""
          ? Number(subjectId)
          : null,
    }),
  });
}

// =====================================================
// AI CHAT HISTORY
// =====================================================

export async function getAIChatHistory() {
  requireToken();

  return apiRequest("/chat/history", {
    method: "GET",
  });
}

// =====================================================
// CLEAR AI CHAT HISTORY
// =====================================================

export async function clearAIChatHistory() {
  requireToken();

  return apiRequest("/chat/history", {
    method: "DELETE",
  });
}

// =====================================================
// SMART STUDY PLANNER
// =====================================================

export async function generateStudyPlan(
  examName,
  daysRemaining,
  studyHoursPerDay,
  currentKnowledge,
  subjectId = null,
) {
  requireToken();

  const payload = {
    exam_name: examName.trim(),
    days_remaining: Number(daysRemaining),
    study_hours_per_day: Number(studyHoursPerDay),
    current_knowledge: currentKnowledge.trim(),
  };

  if (subjectId !== null && subjectId !== undefined) {
    payload.subject_id = Number(subjectId);
  }

  return apiRequest("/study-plan/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


