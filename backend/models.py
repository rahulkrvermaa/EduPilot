from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)

from sqlalchemy.orm import relationship

from database import Base


# =========================================================
# USER
# =========================================================

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    email = Column(
        String,
        unique=True,
        index=True,
        nullable=False,
    )

    password_hash = Column(
        String,
        nullable=False,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    subjects = relationship(
        "Subject",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    study_tasks = relationship(
        "StudyTask",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    documents = relationship(
        "Document",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    quizzes = relationship(
        "Quiz",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    quiz_attempts = relationship(
        "QuizAttempt",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    chat_messages = relationship(
        "ChatMessage",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    settings = relationship(
        "UserSetting",
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )


# =========================================================
# USER SETTING (exam date, etc.)
# =========================================================

class UserSetting(Base):
    __tablename__ = "user_settings"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
    )

    exam_name = Column(
        String,
        nullable=True,
    )

    exam_date = Column(
        String,
        nullable=True,
    )

    user = relationship(
        "User",
        back_populates="settings",
    )


# =========================================================
# SUBJECT
# =========================================================

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    description = Column(
        Text,
        nullable=True,
    )

    progress = Column(
        Integer,
        default=0,
        nullable=False,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    user = relationship(
        "User",
        back_populates="subjects",
    )

    tasks = relationship(
        "StudyTask",
        back_populates="subject",
        cascade="all, delete-orphan",
    )

    documents = relationship(
        "Document",
        back_populates="subject",
        cascade="all, delete-orphan",
    )

    quizzes = relationship(
        "Quiz",
        back_populates="subject",
        cascade="all, delete-orphan",
    )


# =========================================================
# STUDY TASK
# =========================================================

class StudyTask(Base):
    __tablename__ = "study_tasks"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    title = Column(
        String,
        nullable=False,
    )

    description = Column(
        Text,
        nullable=True,
    )

    due_date = Column(
        String,
        nullable=True,
    )

    completed = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    subject_id = Column(
        Integer,
        ForeignKey("subjects.id"),
        nullable=False,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    subject = relationship(
        "Subject",
        back_populates="tasks",
    )

    user = relationship(
        "User",
        back_populates="study_tasks",
    )


# =========================================================
# DOCUMENT
# =========================================================

class Document(Base):
    __tablename__ = "documents"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    filename = Column(
        String,
        nullable=False,
    )

    file_path = Column(
        String,
        nullable=False,
    )

    content_type = Column(
        String,
        nullable=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    subject_id = Column(
        Integer,
        ForeignKey("subjects.id"),
        nullable=True,
        index=True,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    user = relationship(
        "User",
        back_populates="documents",
    )

    subject = relationship(
        "Subject",
        back_populates="documents",
    )

    chunks = relationship(
        "DocumentChunk",
        back_populates="document",
        cascade="all, delete-orphan",
    )


# =========================================================
# QUIZ
# =========================================================

class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    title = Column(
        String,
        nullable=False,
    )

    subject_id = Column(
        Integer,
        ForeignKey("subjects.id"),
        nullable=False,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    subject = relationship(
        "Subject",
        back_populates="quizzes",
    )

    user = relationship(
        "User",
        back_populates="quizzes",
    )

    questions = relationship(
        "Question",
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="Question.id",
    )

    attempts = relationship(
        "QuizAttempt",
        back_populates="quiz",
        cascade="all, delete-orphan",
    )


# =========================================================
# QUESTION
# =========================================================

class Question(Base):
    __tablename__ = "questions"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    question = Column(
        Text,
        nullable=False,
    )

    option_a = Column(
        Text,
        nullable=False,
    )

    option_b = Column(
        Text,
        nullable=False,
    )

    option_c = Column(
        Text,
        nullable=False,
    )

    option_d = Column(
        Text,
        nullable=False,
    )

    correct_answer = Column(
        String,
        nullable=False,
    )

    quiz_id = Column(
        Integer,
        ForeignKey("quizzes.id"),
        nullable=False,
        index=True,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    quiz = relationship(
        "Quiz",
        back_populates="questions",
    )

    attempt_answers = relationship(
        "QuizAttemptAnswer",
        back_populates="question",
        cascade="all, delete-orphan",
    )


# =========================================================
# QUIZ ATTEMPT
# =========================================================

class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    quiz_id = Column(
        Integer,
        ForeignKey("quizzes.id"),
        nullable=False,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    score = Column(
        Integer,
        nullable=False,
    )

    total = Column(
        Integer,
        nullable=False,
    )

    percentage = Column(
        Integer,
        nullable=False,
    )

    submitted_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    quiz = relationship(
        "Quiz",
        back_populates="attempts",
    )

    user = relationship(
        "User",
        back_populates="quiz_attempts",
    )

    answers = relationship(
        "QuizAttemptAnswer",
        back_populates="attempt",
        cascade="all, delete-orphan",
    )


# =========================================================
# QUIZ ATTEMPT ANSWER
# =========================================================

class QuizAttemptAnswer(Base):
    __tablename__ = "quiz_attempt_answers"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    attempt_id = Column(
        Integer,
        ForeignKey("quiz_attempts.id"),
        nullable=False,
        index=True,
    )

    question_id = Column(
        Integer,
        ForeignKey("questions.id"),
        nullable=False,
        index=True,
    )

    selected_answer = Column(
        String,
        nullable=False,
        default="",
    )

    is_correct = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    attempt = relationship(
        "QuizAttempt",
        back_populates="answers",
    )

    question = relationship(
        "Question",
        back_populates="attempt_answers",
    )


# =========================================================
# DOCUMENT CHUNK
# =========================================================

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    document_id = Column(
        Integer,
        ForeignKey("documents.id"),
        nullable=False,
        index=True,
    )

    content = Column(
        Text,
        nullable=False,
    )

    chunk_index = Column(
        Integer,
        nullable=False,
    )

    embedding = Column(
        Text,
        nullable=True,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    document = relationship(
        "Document",
        back_populates="chunks",
    )


# =========================================================
# CHAT MESSAGE
# =========================================================

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    role = Column(
        String,
        nullable=False,
    )

    content = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------

    user = relationship(
        "User",
        back_populates="chat_messages",
    )