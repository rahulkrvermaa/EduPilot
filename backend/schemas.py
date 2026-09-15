from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
)


# =========================================================
# AUTH
# =========================================================

class RegisterRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
    )
    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=128,
    )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(
        min_length=1,
        max_length=128,
    )


class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr

    model_config = ConfigDict(
        from_attributes=True,
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


# =========================================================
# SUBJECTS
# =========================================================

class SubjectCreate(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=200,
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
    )


class SubjectUpdate(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=200,
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
    )


class SubjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    progress: int

    model_config = ConfigDict(
        from_attributes=True,
    )


# =========================================================
# STUDY TASKS
# =========================================================

class StudyTaskCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=300,
    )
    description: str | None = Field(
        default=None,
        max_length=2000,
    )
    due_date: str | None = None
    subject_id: int = Field(
        gt=0,
    )


class StudyTaskResponse(BaseModel):
    id: int
    title: str
    description: str | None
    due_date: str | None
    completed: bool
    subject_id: int

    model_config = ConfigDict(
        from_attributes=True,
    )


# =========================================================
# DOCUMENTS
# =========================================================

class DocumentResponse(BaseModel):
    id: int
    filename: str
    content_type: str | None
    subject_id: int | None

    model_config = ConfigDict(
        from_attributes=True,
    )


# =========================================================
# QUIZZES
# =========================================================

CorrectAnswer = Literal[
    "option_a",
    "option_b",
    "option_c",
    "option_d",
]


class QuestionCreate(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=2000,
    )
    option_a: str = Field(
        min_length=1,
        max_length=1000,
    )
    option_b: str = Field(
        min_length=1,
        max_length=1000,
    )
    option_c: str = Field(
        min_length=1,
        max_length=1000,
    )
    option_d: str = Field(
        min_length=1,
        max_length=1000,
    )
    correct_answer: CorrectAnswer


class QuestionResponse(BaseModel):
    id: int
    question: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str

    model_config = ConfigDict(
        from_attributes=True,
    )


class QuizCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=300,
    )
    subject_id: int = Field(
        gt=0,
    )
    questions: list[QuestionCreate] = Field(
        min_length=1,
        max_length=50,
    )


class QuizResponse(BaseModel):
    id: int
    title: str
    subject_id: int

    model_config = ConfigDict(
        from_attributes=True,
    )


class QuizDetailResponse(BaseModel):
    id: int
    title: str
    subject_id: int
    questions: list[QuestionResponse]

    model_config = ConfigDict(
        from_attributes=True,
    )


# =========================================================
# QUIZ SUBMISSION
# =========================================================

class QuizAnswer(BaseModel):
    question_id: int = Field(
        gt=0,
    )

    answer: Literal[
        "",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
    ]


class QuizSubmitRequest(BaseModel):
    answers: list[QuizAnswer]


# =========================================================
# QUIZ REVIEW
# =========================================================

class QuizReviewItem(BaseModel):
    question_number: int
    question_id: int
    question: str

    attempted_answer: str
    correct_answer: str

    is_correct: bool

    option_a: str
    option_b: str
    option_c: str
    option_d: str


class QuizSubmitResponse(BaseModel):
    score: int
    total: int
    percentage: int
    review: list[QuizReviewItem]


# =========================================================
# QUIZ ATTEMPT HISTORY
# =========================================================

class QuizAttemptResponse(BaseModel):
    id: int
    quiz_id: int
    user_id: int
    score: int
    total: int
    percentage: int
    submitted_at: datetime
    subject_id: int | None = None
    subject_name: str | None = None
    quiz_title: str | None = None

    model_config = ConfigDict(
        from_attributes=True,
    )


class QuizAttemptAnswerResponse(BaseModel):
    id: int
    question_id: int
    selected_answer: str
    is_correct: bool

    model_config = ConfigDict(
        from_attributes=True,
    )


class QuizAttemptDetailResponse(BaseModel):
    id: int
    quiz_id: int
    score: int
    total: int
    percentage: int
    submitted_at: datetime
    answers: list[QuizAttemptAnswerResponse]

    model_config = ConfigDict(
        from_attributes=True,
    )


# =========================================================
# AI TUTOR
# =========================================================

class AIAskRequest(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=10000,
    )


class AIAskResponse(BaseModel):
    answer: str


# =========================================================
# AI CHAT
# =========================================================

class ChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=10000,
    )
    subject_id: int | None = Field(
        default=None,
        gt=0,
    )


class ChatSource(BaseModel):
    document_id: int
    filename: str
    chunk_index: int
    score: float


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSource]


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


# =========================================================
# AI QUIZ GENERATION
# =========================================================

class AIQuizGenerateRequest(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=300,
    )
    subject_id: int = Field(
        gt=0,
    )
    number_of_questions: int = Field(
        default=5,
        ge=1,
        le=20,
    )


class AIQuizGenerateResponse(BaseModel):
    quiz_id: int
    title: str
    subject_id: int
    questions: list[QuestionResponse]


# =========================================================
# SMART STUDY PLANNER
# =========================================================

class GenerateStudyPlanRequest(BaseModel):
    exam_name: str = Field(
        min_length=1,
        max_length=200,
    )

    days_remaining: int = Field(
        gt=0,
        le=365,
    )

    study_hours_per_day: float = Field(
        gt=0,
        le=24,
    )

    current_knowledge: str = Field(
        min_length=1,
        max_length=50,
    )

    subject_id: int | None = Field(
        default=None,
        gt=0,
    )


class StudyPlanDay(BaseModel):
    day: int
    topic: str
    description: str
    estimated_hours: float
    priority: float
    type: str


class GenerateStudyPlanResponse(BaseModel):
    exam: str
    subject_id: int | None = None
    subject_name: str
    days_remaining: int
    study_hours_per_day: float
    current_knowledge: str
    study_plan: list[StudyPlanDay]


# =========================================================
# EXAM SETTINGS (persistent countdown)
# =========================================================

class ExamSettings(BaseModel):
    exam_name: str | None = None
    exam_date: str | None = None


class ExamSettingsResponse(BaseModel):
    id: int
    exam_name: str | None = None
    exam_date: str | None = None

    model_config = ConfigDict(
        from_attributes=True,
    )


# =========================================================
# DASHBOARD STATS / ANALYTICS
# =========================================================

class SubjectPerformance(BaseModel):
    subject_id: int
    subject_name: str
    attempts: int
    total_questions: int
    correct_questions: int
    average_score: float
    best_score: float
    completion_percentage: int


class ActivityItem(BaseModel):
    type: str
    title: str
    subtitle: str
    timestamp: datetime


class UserStatsResponse(BaseModel):
    subject_performance: list[SubjectPerformance]
    activity: list[ActivityItem]
    streak_days: int
    average_score: float
    best_score: float
    total_attempts: int
    completed_tasks: int
    pending_tasks: int
    completion_rate: int


# =========================================================
# AI RECOMMENDATIONS
# =========================================================

class AIRecommendation(BaseModel):
    title: str
    description: str


class AIRecommendationsResponse(BaseModel):
    recommendations: list[AIRecommendation]

