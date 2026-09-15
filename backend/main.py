import json
import os
import re
import time

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)

from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from ai_service import (
    ask_gemini,
    client as gemini_client,
    FALLBACK_MODELS,
    GEMINI_MODEL,
)

from auth import (
    create_access_token,
    get_authenticated_user,
    hash_password,
    verify_password,
)

from database import Base, engine, get_db

from models import (
    ChatMessage,
    Document,
    DocumentChunk,
    Question,
    Quiz,
    QuizAttempt,
    QuizAttemptAnswer,
    StudyTask,
    Subject,
    User,
    UserSetting,
)

from schemas import (
    AIAskRequest,
    AIAskResponse,
    AIQuizGenerateRequest,
    AIQuizGenerateResponse,
    AIRecommendation,
    AIRecommendationsResponse,
    ActivityItem,
    ChatMessageResponse,
    ChatRequest,
    ChatResponse,
    ChatSource,
    DocumentResponse,
    ExamSettings,
    ExamSettingsResponse,
    GenerateStudyPlanRequest,
    GenerateStudyPlanResponse,
    LoginRequest,
    QuizAttemptDetailResponse,
    QuizAttemptResponse,
    QuizCreate,
    QuizDetailResponse,
    QuizResponse,
    QuizSubmitRequest,
    QuizSubmitResponse,
    RegisterRequest,
    StudyPlanDay,  # FIXED: was missing
    StudyTaskCreate,
    StudyTaskResponse,
    SubjectCreate,
    SubjectPerformance,
    SubjectResponse,
    TokenResponse,
    UserResponse,
    UserStatsResponse,
)


# =========================================================
# DATABASE
# =========================================================

Base.metadata.create_all(bind=engine)


# =========================================================
# FILE UPLOADS
# =========================================================

UPLOAD_DIR = "uploads"

# Maximum allowed upload size in bytes (10 MB). The frontend enforces this
# too, but the backend is the source of truth.
MAX_UPLOAD_BYTES = int(
    os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024))
)

# Comma-separated list of MIME types accepted by the upload endpoint.
UPLOAD_ALLOWED_TYPES = {
    mime.strip().lower()
    for mime in os.getenv(
        "UPLOAD_ALLOWED_TYPES",
        ",".join([
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
        ]),
    ).split(",")
    if mime.strip()
}

# Where uploaded files live. Override via UPLOAD_DIR.
UPLOAD_DIR = os.getenv("UPLOAD_DIR") or "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)


# =========================================================
# APP
# =========================================================

_docs_url = "/docs" if os.getenv("ENABLE_DOCS", "true").lower() == "true" else None
_redoc_url = "/redoc" if os.getenv("ENABLE_DOCS", "true").lower() == "true" else None

app = FastAPI(
    title="EduPilot API",
    description="Backend API for EduPilot",
    version="1.0.0",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
)


# =========================================================
# GLOBAL EXCEPTION HANDLERS
# =========================================================

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request,
    exc: RequestValidationError,
):
    # Return the first error message in a shape the frontend already
    # understands ({"detail": "..."}) instead of Pydantic's verbose list.
    errors = exc.errors()
    first = errors[0] if errors else {}
    message = first.get("msg", "Invalid request.")
    return JSONResponse(
        status_code=422,
        content={"detail": str(message)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request,
    exc: Exception,
):
    # Never leak internals to the client; log server-side only.
    print(
        f"UNHANDLED {request.method} {request.url.path}:",
        repr(exc),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


# =========================================================
# CORS
# =========================================================

# Comma-separated list of allowed origins in the CORS_ORIGINS env var.
# Defaults to the Vite dev server. In production, set CORS_ORIGINS to your
# real frontend URL(s), e.g. "https://edupilot.example.com".
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

CORS_METHODS = [
    m.strip().upper()
    for m in os.getenv(
        "CORS_METHODS",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    ).split(",")
    if m.strip()
]

CORS_HEADERS = [
    h.strip()
    for h in os.getenv(
        "CORS_HEADERS",
        "Authorization,Content-Type,Accept,Origin,X-Requested-With",
    ).split(",")
    if h.strip()
]

CORS_MAX_AGE = int(os.getenv("CORS_MAX_AGE", "600"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=CORS_METHODS,
    allow_headers=CORS_HEADERS,
    max_age=CORS_MAX_AGE,
)


# =========================================================
# OPTIONAL REQUEST LOGGING MIDDLEWARE
# =========================================================

if os.getenv("REQUEST_LOGGING", "false").lower() == "true":
    import time

    @app.middleware("http")
    async def log_requests(request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        print(
            f"{request.client.host if request.client else '?'} "
            f"{request.method} {request.url.path} "
            f"{response.status_code} {elapsed_ms:.1f}ms"
        )
        return response


# =========================================================
# GEMINI HELPER
# =========================================================


def generate_with_gemini(prompt: str, max_retries: int = 3) -> str:
    """
    Call Gemini synchronously via the google-genai SDK.

    Includes retry with exponential backoff for transient 503/429
    errors, and automatic fallback across candidate models.
    """
    if gemini_client is None:
        raise RuntimeError("Gemini client is not configured.")

    candidate_models = []
    for m in FALLBACK_MODELS:
        if m and m not in candidate_models:
            candidate_models.append(m)

    last_error = None

    for model_name in candidate_models:
        for attempt in range(max_retries):
            try:
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )

                text = getattr(response, "text", None)

                if text and text.strip():
                    return text.strip()

                raise RuntimeError("Gemini returned an empty response.")

            except Exception as error:
                last_error = error
                error_text = str(error)

                print(
                    f"GEMINI GENERATE [{model_name}] attempt {attempt + 1}/{max_retries}:",
                    repr(error),
                )

                temporary_error = (
                    "503" in error_text
                    or "UNAVAILABLE" in error_text
                    or "429" in error_text
                    or "RESOURCE_EXHAUSTED" in error_text
                    or "high demand" in error_text
                )

                if not temporary_error:
                    break

                if attempt < max_retries - 1:
                    delay = 1.5 * (2 ** attempt)
                    print(f"Gemini busy/unavailable. Retrying in {delay}s...")
                    time.sleep(delay)

    raise RuntimeError(f"Gemini request failed: {last_error}") from last_error


# =========================================================
# JSON CLEANING HELPER
# =========================================================

def extract_json_object(text: str) -> dict:
    cleaned = text.strip()

    # Remove Markdown code fences if Gemini adds them.
    cleaned = re.sub(
        r"^```(?:json)?\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    cleaned = re.sub(
        r"\s*```$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    cleaned = cleaned.strip()

    # First attempt: entire response is JSON.
    try:
        result = json.loads(cleaned)

        if isinstance(result, dict):
            return result

    except json.JSONDecodeError:
        pass

    # Second attempt: extract the outermost JSON object.
    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start == -1 or end == -1 or end <= start:
        raise ValueError(
            "No valid JSON object found."
        )

    json_text = cleaned[start:end + 1]

    result = json.loads(json_text)

    if not isinstance(result, dict):
        raise ValueError(
            "Generated JSON is not an object."
        )

    return result


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():
    return {
        "message": "Welcome to EduPilot API"
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "ai_configured": gemini_client is not None,
    }


# =========================================================
# REGISTER
# =========================================================

@app.post(
    "/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    user_data: RegisterRequest,
    db: Session = Depends(get_db),
):
    name = user_data.name.strip()
    email = str(user_data.email).strip().lower()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty.",
        )

    if not user_data.password:
        raise HTTPException(
            status_code=400,
            detail="Password cannot be empty.",
        )

    existing_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email is already registered.",
        )

    new_user = User(
        name=name,
        email=email,
        password_hash=hash_password(
            user_data.password
        ),
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

    except Exception as error:
        db.rollback()

        print(
            "Registration database error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to create account.",
        )

    return new_user


# =========================================================
# LOGIN
# =========================================================

@app.post(
    "/auth/login",
    response_model=TokenResponse,
)
def login(
    user_data: LoginRequest,
    db: Session = Depends(get_db),
):
    email = str(user_data.email).strip().lower()

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    if not verify_password(
        user_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    access_token = create_access_token(
        user.id
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


# =========================================================
# CURRENT USER
# =========================================================

@app.get(
    "/auth/me",
    response_model=UserResponse,
)
def get_me(
    current_user: User = Depends(
        get_authenticated_user
    ),
):
    return current_user


# =========================================================
# SUBJECTS
# =========================================================

@app.get(
    "/subjects",
    response_model=list[SubjectResponse],
)
def get_subjects(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    return (
        db.query(Subject)
        .filter(
            Subject.user_id == current_user.id
        )
        .order_by(Subject.id.asc())
        .all()
    )


@app.post(
    "/subjects",
    response_model=SubjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_subject(
    subject_data: SubjectCreate,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    name = subject_data.name.strip()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Subject name cannot be empty.",
        )

    description = (
        subject_data.description.strip()
        if subject_data.description
        else None
    )

    new_subject = Subject(
        name=name,
        description=description,
        progress=0,
        user_id=current_user.id,
    )

    try:
        db.add(new_subject)
        db.commit()
        db.refresh(new_subject)

    except Exception as error:
        db.rollback()

        print(
            "Subject creation error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to create subject.",
        )

    return new_subject


# =========================================================
# UPDATE SUBJECT
# =========================================================

@app.put(
    "/subjects/{subject_id}",
    response_model=SubjectResponse,
)
def update_subject(
    subject_id: int,
    subject_data: SubjectCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    subject = (
        db.query(Subject)
        .filter(
            Subject.id == subject_id,
            Subject.user_id == current_user.id,
        )
        .first()
    )

    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found.")

    subject.name = subject_data.name.strip()
    subject.description = (
        subject_data.description.strip()
        if subject_data.description
        else None
    )

    db.commit()
    db.refresh(subject)
    return subject


# =========================================================
# DELETE SUBJECT
# =========================================================

@app.delete(
    "/subjects/{subject_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_subject(
    subject_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    subject = (
        db.query(Subject)
        .filter(
            Subject.id == subject_id,
            Subject.user_id == current_user.id,
        )
        .first()
    )

    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found.")

    db.delete(subject)
    db.commit()


# =========================================================
# STUDY TASKS
# =========================================================

@app.get(
    "/study-tasks",
    response_model=list[StudyTaskResponse],
)
def get_study_tasks(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    return (
        db.query(StudyTask)
        .filter(
            StudyTask.user_id == current_user.id
        )
        .order_by(StudyTask.id.desc())
        .all()
    )


@app.post(
    "/study-tasks",
    response_model=StudyTaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_study_task(
    task_data: StudyTaskCreate,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    title = task_data.title.strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Task title cannot be empty.",
        )

    subject = (
        db.query(Subject)
        .filter(
            Subject.id == task_data.subject_id,
            Subject.user_id == current_user.id,
        )
        .first()
    )

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Subject not found.",
        )

    description = (
        task_data.description.strip()
        if task_data.description
        else None
    )

    task = StudyTask(
        title=title,
        description=description,
        due_date=task_data.due_date,
        subject_id=task_data.subject_id,
        user_id=current_user.id,
        completed=False,
    )

    try:
        db.add(task)
        db.commit()
        db.refresh(task)

    except Exception as error:
        db.rollback()

        print(
            "Study task creation error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to create study task.",
        )

    return task


@app.patch(
    "/study-tasks/{task_id}/complete",
    response_model=StudyTaskResponse,
)
def complete_study_task(
    task_id: int,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    task = (
        db.query(StudyTask)
        .filter(
            StudyTask.id == task_id,
            StudyTask.user_id == current_user.id,
        )
        .first()
    )

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Study task not found.",
        )

    task.completed = not task.completed

    try:
        db.commit()
        db.refresh(task)

    except Exception as error:
        db.rollback()

        print(
            "Study task update error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to update study task.",
        )

    return task


# =========================================================
# DELETE STUDY TASK
# =========================================================

@app.delete(
    "/study-tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_study_task(
    task_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    task = (
        db.query(StudyTask)
        .filter(
            StudyTask.id == task_id,
            StudyTask.user_id == current_user.id,
        )
        .first()
    )

    if not task:
        raise HTTPException(status_code=404, detail="Study task not found.")

    db.delete(task)
    db.commit()


# =========================================================
# DOCUMENTS
# =========================================================

@app.get(
    "/documents",
    response_model=list[DocumentResponse],
)
def get_documents(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    return (
        db.query(Document)
        .filter(
            Document.user_id == current_user.id
        )
        .order_by(Document.id.desc())
        .all()
    )


@app.post(
    "/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    file: UploadFile = File(...),
    subject_id: int | None = Form(None),
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    if subject_id is not None:
        subject = (
            db.query(Subject)
            .filter(
                Subject.id == subject_id,
                Subject.user_id == current_user.id,
            )
            .first()
        )

        if not subject:
            raise HTTPException(
                status_code=404,
                detail="Subject not found.",
            )

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="File name is required.",
        )

    original_filename = os.path.basename(
        file.filename
    )

    extension = os.path.splitext(
        original_filename
    )[1].lower()

    # Derive the allowed file extensions from UPLOAD_ALLOWED_TYPES so the
    # env var stays the single source of truth. Plain .txt files are
    # always permitted when text/plain is in the allow-list.
    _mime_to_ext = {
        "application/pdf": ".pdf",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "text/plain": ".txt",
    }
    allowed_extensions = {
        ext
        for mime, ext in _mime_to_ext.items()
        if mime in UPLOAD_ALLOWED_TYPES
    }

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {', '.join(sorted(allowed_extensions))} "
                "files are allowed."
            ),
        )

    # Enforce the size limit while streaming to disk so we never
    # hold a 10 GB file in memory.
    stored_filename = (
        f"{current_user.id}_"
        f"{os.urandom(8).hex()}"
        f"{extension}"
    )

    file_path = os.path.join(
        UPLOAD_DIR,
        stored_filename,
    )

    try:
        bytes_written = 0
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    buffer.close()
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit."
                        ),
                    )
                buffer.write(chunk)

    except HTTPException:
        raise

    except Exception as error:
        print(
            "File save error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save uploaded file.",
        )

    finally:
        try:
            await file.close()
        except Exception:
            pass

    document = Document(
        filename=original_filename,
        file_path=file_path,
        content_type=file.content_type,
        user_id=current_user.id,
        subject_id=subject_id,
    )

    try:
        db.add(document)
        db.commit()
        db.refresh(document)

    except Exception as error:
        db.rollback()

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

        print(
            "Document database error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save document information.",
        )

    # Currently PDF files are processed for RAG.
    if extension == ".pdf":
        try:
            from rag_service import (
                clean_text,
                create_chunks,
                create_embedding,
                extract_pdf_text,
                serialize_embedding,
            )

            text = extract_pdf_text(
                document.file_path
            )

            text = clean_text(text)

            chunks = create_chunks(text)

            for index, chunk_text in enumerate(chunks):
                if not chunk_text.strip():
                    continue

                embedding = create_embedding(
                    chunk_text
                )

                chunk = DocumentChunk(
                    document_id=document.id,
                    content=chunk_text,
                    chunk_index=index,
                    embedding=serialize_embedding(
                        embedding
                    ),
                )

                db.add(chunk)

            db.commit()

        except Exception as error:
            db.rollback()

            print(
                "PDF processing error:",
                repr(error),
            )

    return document


@app.delete("/documents/{document_id}")
def delete_document(
    document_id: int,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    file_path = document.file_path

    try:
        db.delete(document)
        db.commit()

    except Exception as error:
        db.rollback()

        print(
            "Document deletion error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to delete document.",
        )

    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError as error:
            print(
                "File deletion warning:",
                repr(error),
            )

    return {
        "message": "Document deleted successfully."
    }


# =========================================================
# QUIZZES
# =========================================================

@app.get(
    "/quizzes",
    response_model=list[QuizResponse],
)
def get_quizzes(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    return (
        db.query(Quiz)
        .filter(
            Quiz.user_id == current_user.id
        )
        .order_by(Quiz.id.desc())
        .all()
    )


# =========================================================
# CREATE QUIZ
# =========================================================

@app.post(
    "/quizzes",
    response_model=QuizResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_quiz(
    quiz_data: QuizCreate,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    title = quiz_data.title.strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Quiz title cannot be empty.",
        )

    if not quiz_data.questions:
        raise HTTPException(
            status_code=400,
            detail=(
                "Quiz must contain at least one question."
            ),
        )

    subject = (
        db.query(Subject)
        .filter(
            Subject.id == quiz_data.subject_id,
            Subject.user_id == current_user.id,
        )
        .first()
    )

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Subject not found.",
        )

    quiz = Quiz(
        title=title,
        subject_id=quiz_data.subject_id,
        user_id=current_user.id,
    )

    try:
        db.add(quiz)
        db.flush()

        for question_data in quiz_data.questions:
            question_text = (
                question_data.question.strip()
            )

            options = [
                question_data.option_a.strip(),
                question_data.option_b.strip(),
                question_data.option_c.strip(),
                question_data.option_d.strip(),
            ]

            if not question_text:
                raise HTTPException(
                    status_code=400,
                    detail="Question cannot be empty.",
                )

            if any(not option for option in options):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "All quiz options must contain text."
                    ),
                )

            normalized_options = [
                option.casefold()
                for option in options
            ]

            if len(set(normalized_options)) != 4:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Each question must have "
                        "four unique options."
                    ),
                )

            correct_answer = (
                question_data.correct_answer
                .strip()
                .lower()
            )

            if correct_answer not in {
                "option_a",
                "option_b",
                "option_c",
                "option_d",
            }:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "correct_answer must be "
                        "option_a, option_b, "
                        "option_c, or option_d."
                    ),
                )

            question = Question(
                question=question_text,
                option_a=options[0],
                option_b=options[1],
                option_c=options[2],
                option_d=options[3],
                correct_answer=correct_answer,
                quiz_id=quiz.id,
            )

            db.add(question)

        db.commit()
        db.refresh(quiz)

    except HTTPException:
        db.rollback()
        raise

    except Exception as error:
        db.rollback()

        print(
            "Quiz creation error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to create quiz.",
        )

    return quiz


# =========================================================
# AI QUIZ GENERATION
# =========================================================

@app.post(
    "/quizzes/generate",
    response_model=AIQuizGenerateResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_ai_quiz(
    quiz_data: AIQuizGenerateRequest,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    title = quiz_data.title.strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Quiz title cannot be empty.",
        )

    if not 1 <= quiz_data.number_of_questions <= 20:
        raise HTTPException(
            status_code=400,
            detail=(
                "number_of_questions must be "
                "between 1 and 20."
            ),
        )

    subject = (
        db.query(Subject)
        .filter(
            Subject.id == quiz_data.subject_id,
            Subject.user_id == current_user.id,
        )
        .first()
    )

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Subject not found.",
        )

    chunks = (
        db.query(DocumentChunk)
        .join(
            Document,
            DocumentChunk.document_id == Document.id,
        )
        .filter(
            Document.user_id == current_user.id,
            Document.subject_id == quiz_data.subject_id,
        )
        .order_by(
            Document.id.asc(),
            DocumentChunk.chunk_index.asc(),
        )
        .limit(30)
        .all()
    )

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail=(
                "No study material was found for this subject. "
                "Please upload a PDF in the Documents page and "
                "attach it to this subject before generating a quiz."
            ),
        )

    document_text = "\n\n".join(
        chunk.content
        for chunk in chunks
        if chunk.content
    )

    if not document_text.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "The uploaded documents contain no usable text. "
                "Please ensure your PDF files contain readable text."
            ),
        )

    MAX_CONTEXT_CHARS = 50000

    if len(document_text) > MAX_CONTEXT_CHARS:
        document_text = document_text[
            :MAX_CONTEXT_CHARS
        ]

    prompt = f"""
You are EduPilot AI Tutor.

Generate a high-quality multiple-choice quiz
for a student.

SUBJECT:
{subject.name}

SUBJECT DESCRIPTION:
{subject.description or "No description provided."}

NUMBER OF QUESTIONS:
{quiz_data.number_of_questions}

STUDY MATERIAL:
{document_text}

RULES:

1. Generate exactly {quiz_data.number_of_questions} questions.
2. Base the questions primarily on the supplied study material.
3. Each question must have exactly four options.
4. Each question must have exactly one correct answer.
5. The correct_answer field must contain exactly one of:
   option_a
   option_b
   option_c
   option_d
6. Do not create duplicate questions.
7. Do not create duplicate options within a question.
8. Make incorrect options plausible.
9. Do not invent facts that contradict the study material.
10. Do not include explanations.
11. Return ONLY valid JSON.
12. Do not use Markdown.
13. Do not wrap the JSON in code fences.

Return exactly this structure:

{{
    "questions": [
        {{
            "question": "Question text",
            "option_a": "Option A",
            "option_b": "Option B",
            "option_c": "Option C",
            "option_d": "Option D",
            "correct_answer": "option_a"
        }}
    ]
}}
"""

    try:
        ai_text = generate_with_gemini(prompt)

    except Exception as error:
        print(
            "AI quiz generation error:",
            repr(error),
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "AI quiz generation is temporarily "
                "unavailable. Please try again."
            ),
        )

    try:
        generated_data = extract_json_object(
            ai_text
        )

    except Exception as error:
        print(
            "AI quiz JSON parsing error:",
            repr(error),
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "AI generated an invalid quiz. "
                "Please try again."
            ),
        )

    generated_questions = generated_data.get(
        "questions"
    )

    if not isinstance(
        generated_questions,
        list,
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "AI generated an invalid quiz format."
            ),
        )

    expected_count = quiz_data.number_of_questions

    if len(generated_questions) != expected_count:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI generated an incorrect number "
                "of questions. Please try again."
            ),
        )

    valid_answers = {
        "option_a",
        "option_b",
        "option_c",
        "option_d",
    }

    required_fields = {
        "question",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_answer",
    }

    validated_questions = []
    normalized_question_texts = set()

    for index, question_data in enumerate(
        generated_questions,
        start=1,
    ):
        if not isinstance(
            question_data,
            dict,
        ):
            raise HTTPException(
                status_code=503,
                detail=(
                    f"AI generated invalid data "
                    f"for question {index}."
                ),
            )

        missing_fields = (
            required_fields
            - question_data.keys()
        )

        if missing_fields:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"AI question {index} is missing "
                    f"required fields."
                ),
            )

        values = {}

        for field in required_fields:
            value = question_data.get(field)

            if (
                not isinstance(value, str)
                or not value.strip()
            ):
                raise HTTPException(
                    status_code=503,
                    detail=(
                        f"AI generated an invalid "
                        f"{field} for question {index}."
                    ),
                )

            values[field] = value.strip()

        question_text = values["question"]

        normalized_question = (
            question_text.casefold()
        )

        if normalized_question in normalized_question_texts:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"AI generated a duplicate "
                    f"question at question {index}."
                ),
            )

        normalized_question_texts.add(
            normalized_question
        )

        correct_answer = (
            values["correct_answer"]
            .casefold()
        )

        if correct_answer not in valid_answers:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"AI generated an invalid "
                    f"correct answer for question "
                    f"{index}."
                ),
            )

        options = [
            values["option_a"],
            values["option_b"],
            values["option_c"],
            values["option_d"],
        ]

        normalized_options = [
            option.casefold()
            for option in options
        ]

        if len(set(normalized_options)) != 4:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"AI generated duplicate options "
                    f"for question {index}."
                ),
            )

        validated_questions.append(
            {
                "question": question_text,
                "option_a": options[0],
                "option_b": options[1],
                "option_c": options[2],
                "option_d": options[3],
                "correct_answer": correct_answer,
            }
        )

    quiz = Quiz(
        title=title,
        subject_id=quiz_data.subject_id,
        user_id=current_user.id,
    )

    try:
        db.add(quiz)
        db.flush()

        for question_data in validated_questions:
            question = Question(
                question=question_data["question"],
                option_a=question_data["option_a"],
                option_b=question_data["option_b"],
                option_c=question_data["option_c"],
                option_d=question_data["option_d"],
                correct_answer=question_data[
                    "correct_answer"
                ],
                quiz_id=quiz.id,
            )

            db.add(question)

        db.commit()
        db.refresh(quiz)

    except Exception as error:
        db.rollback()

        print(
            "AI quiz database error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save generated quiz.",
        )

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "subject_id": quiz.subject_id,
        "questions": quiz.questions,
    }


# =========================================================
# GET SINGLE QUIZ
# =========================================================

@app.get(
    "/quizzes/{quiz_id}",
    response_model=QuizDetailResponse,
)
def get_quiz(
    quiz_id: int,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:
        raise HTTPException(
            status_code=404,
            detail="Quiz not found.",
        )

    return quiz


# =========================================================
# SUBMIT QUIZ
# =========================================================

@app.post(
    "/quizzes/{quiz_id}/submit",
    response_model=QuizSubmitResponse,
)
def submit_quiz(
    quiz_id: int,
    submission: QuizSubmitRequest,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:
        raise HTTPException(
            status_code=404,
            detail="Quiz not found.",
        )

    questions = quiz.questions

    if not questions:
        raise HTTPException(
            status_code=400,
            detail="Quiz has no questions.",
        )

    question_answers = {}

    for answer in submission.answers:
        if answer.question_id in question_answers:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Question {answer.question_id} "
                    "was submitted more than once."
                ),
            )

        selected_answer = (
            answer.answer or ""
        ).strip().lower()

        if selected_answer and selected_answer not in {
            "option_a",
            "option_b",
            "option_c",
            "option_d",
        }:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid answer for question "
                    f"{answer.question_id}."
                ),
            )

        question_answers[
            answer.question_id
        ] = selected_answer

    question_ids = {
        question.id
        for question in questions
    }

    for submitted_question_id in question_answers:
        if submitted_question_id not in question_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Question {submitted_question_id} "
                    "does not belong to this quiz."
                ),
            )

    score = 0
    review = []

    for index, question in enumerate(
        questions,
        start=1,
    ):
        attempted_key = question_answers.get(
            question.id,
            "",
        )

        correct_key = (
            question.correct_answer
            .strip()
            .lower()
        )

        is_correct = (
            attempted_key == correct_key
        )

        if is_correct:
            score += 1

        options = {
            "option_a": question.option_a,
            "option_b": question.option_b,
            "option_c": question.option_c,
            "option_d": question.option_d,
        }

        attempted_text = (
            options.get(
                attempted_key,
                "Invalid answer",
            )
            if attempted_key
            else "Not answered"
        )

        correct_text = options.get(
            correct_key,
            "Invalid correct answer",
        )

        review.append(
            {
                "question_number": index,
                "question_id": question.id,
                "question": question.question,
                "attempted_answer": attempted_text,
                "correct_answer": correct_text,
                "is_correct": is_correct,
                "option_a": question.option_a,
                "option_b": question.option_b,
                "option_c": question.option_c,
                "option_d": question.option_d,
            }
        )

    total = len(questions)

    percentage = round(
        (score / total) * 100
    )

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        score=score,
        total=total,
        percentage=percentage,
    )

    try:
        db.add(attempt)
        db.flush()

        for question in questions:
            selected_answer = question_answers.get(
                question.id,
                "",
            )

            correct_key = (
                question.correct_answer
                .strip()
                .lower()
            )

            is_correct = (
                1
                if selected_answer == correct_key
                else 0
            )

            attempt_answer = QuizAttemptAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                selected_answer=selected_answer,
                is_correct=is_correct,
            )

            db.add(attempt_answer)

        db.commit()

    except Exception as error:
        db.rollback()

        print(
            "Quiz submission database error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save quiz attempt.",
        )

    return {
        "score": score,
        "total": total,
        "percentage": percentage,
        "review": review,
    }


# =========================================================
# QUIZ ATTEMPTS / HISTORY
# =========================================================

@app.get(
    "/quiz-attempts",
    response_model=list[QuizAttemptResponse],
)
def get_quiz_attempts(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.user_id == current_user.id
        )
        .order_by(
            QuizAttempt.submitted_at.desc()
        )
        .all()
    )

    results = []

    for attempt in attempts:
        quiz = (
            db.query(Quiz)
            .filter(Quiz.id == attempt.quiz_id)
            .first()
        )

        subject_name = None

        if quiz:
            subject = (
                db.query(Subject)
                .filter(Subject.id == quiz.subject_id)
                .first()
            )

            if subject:
                subject_name = subject.name

        results.append(
            QuizAttemptResponse(
                id=attempt.id,
                quiz_id=attempt.quiz_id,
                user_id=attempt.user_id,
                score=attempt.score,
                total=attempt.total,
                percentage=attempt.percentage,
                submitted_at=attempt.submitted_at,
                subject_id=quiz.subject_id if quiz else None,
                subject_name=subject_name,
                quiz_title=quiz.title if quiz else None,
            )
        )

    return results


# =========================================================
# GET SINGLE QUIZ ATTEMPT
# =========================================================

@app.get(
    "/quiz-attempts/{attempt_id}",
    response_model=QuizAttemptDetailResponse,
)
def get_quiz_attempt(
    attempt_id: int,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    attempt = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.id == attempt_id,
            QuizAttempt.user_id == current_user.id,
        )
        .first()
    )

    if not attempt:
        raise HTTPException(
            status_code=404,
            detail="Quiz attempt not found.",
        )

    return attempt


# =========================================================
# AI TUTOR
# =========================================================

@app.post(
    "/ai/ask",
    response_model=AIAskResponse,
)
def ask_ai(
    request: AIAskRequest,
    current_user: User = Depends(
        get_authenticated_user
    ),
):
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    try:
        answer = ask_gemini(question)

        if not answer or not answer.strip():
            raise RuntimeError(
                "AI returned an empty answer."
            )

        return {
            "answer": answer.strip()
        }

    except Exception as error:
        print(
            "AI tutor error:",
            repr(error),
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "AI service is temporarily "
                "unavailable. Please try again."
            ),
        )


# =========================================================
# AI TUTOR / RAG CHAT
# =========================================================

@app.post(
    "/chat/ask",
    response_model=ChatResponse,
)
def ask_ai_tutor(
    chat_data: ChatRequest,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    message = chat_data.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty.",
        )

    subject = None

    if chat_data.subject_id is not None:
        subject = (
            db.query(Subject)
            .filter(
                Subject.id == chat_data.subject_id,
                Subject.user_id == current_user.id,
            )
            .first()
        )

        if not subject:
            raise HTTPException(
                status_code=404,
                detail="Subject not found.",
            )

    previous_messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == current_user.id
        )
        .order_by(
            ChatMessage.created_at.desc(),
            ChatMessage.id.desc(),
        )
        .limit(10)
        .all()
    )

    previous_messages.reverse()

    conversation_history_parts = []

    for msg in previous_messages:
        if msg.role == "user":
            conversation_history_parts.append(
                f"Student: {msg.content}"
            )

        elif msg.role == "ai":
            conversation_history_parts.append(
                f"EduPilot: {msg.content}"
            )

    conversation_history = "\n".join(
        conversation_history_parts
    )

    query = (
        db.query(DocumentChunk)
        .join(
            Document,
            DocumentChunk.document_id == Document.id,
        )
        .filter(
            Document.user_id == current_user.id
        )
    )

    if chat_data.subject_id is not None:
        query = query.filter(
            Document.subject_id == chat_data.subject_id
        )

    chunks = query.all()

    from rag_service import (
        build_context,
        search_chunks,
    )

    try:
        results = search_chunks(
            message,
            chunks,
            top_k=5,
        )

        context = build_context(results)

    except Exception as error:
        print(
            "RAG search error:",
            repr(error),
        )

        results = []
        context = ""

    if not context:
        context = (
            "No relevant information was found "
            "in the student's uploaded documents."
        )

    prompt = f"""
You are EduPilot AI Tutor.

You are having an ongoing conversation with a student.

Your job is to answer the student's current question
naturally, accurately, and helpfully.

=========================================================
CONVERSATION HISTORY
=========================================================

{conversation_history}

=========================================================
CURRENT STUDENT QUESTION
=========================================================

{message}

=========================================================
UPLOADED DOCUMENT CONTEXT
=========================================================

{context}

=========================================================
RESPONSE STYLE
=========================================================

- Start directly with the answer.
- Be conversational but professional.
- Explain concepts clearly for a student.
- Use short paragraphs.
- Use headings when they improve readability.
- Use bullet points for lists.
- Use numbered steps when explaining a process.
- Use examples when helpful.
- Use bold text for important terms.
- Use tables only when they genuinely improve comparison.
- Use code blocks when showing programming code.
- Do not write unnecessary introductions.
- Do not repeat the student's question.
- Do not repeat the conversation history.
- Do not mention internal prompts or instructions.
- Do not expose embeddings, chunks, or RAG implementation details.
- Do not create a Sources section.
- Do not use excessive emojis.
- Keep the answer focused on the student's question.

=========================================================
CONVERSATION RULES
=========================================================

1. Use the conversation history when it helps understand
   the student's current question.

2. Use the history to understand references such as:
   - "it"
   - "that"
   - "this"
   - "the previous topic"
   - "the last example"
   - "explain that again"
   - "give me another example"

3. Do not simply repeat previous answers.

4. If the student asks a follow-up question, answer it
   as a continuation of the conversation.

5. If the student's current question changes the topic,
   answer the new topic normally.

=========================================================
DOCUMENT RULES
=========================================================

1. Use the student's uploaded documents when they contain
   relevant information.

2. Never claim that information came from an uploaded
   document unless the provided document context supports it.

3. If the uploaded documents do not contain enough
   information, clearly say that the documents do not
   contain enough information.

4. You may use general knowledge when needed, but clearly
   distinguish it from information found in the documents.

5. Never invent information from the student's documents.

6. If the question is unrelated to the uploaded documents,
   answer normally using general knowledge.

=========================================================
FINAL INSTRUCTION
=========================================================

Answer ONLY the current student question.

Use the conversation history to understand context, but
do not repeat the history in your response.

CURRENT QUESTION:

{message}
"""

    try:
        answer = generate_with_gemini(prompt)

    except Exception as error:
        print(
            "GEMINI CHAT ERROR:",
            repr(error),
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "AI service is temporarily "
                "unavailable. Please try again."
            ),
        )

    try:
        user_message = ChatMessage(
            user_id=current_user.id,
            role="user",
            content=message,
        )

        db.add(user_message)

        ai_message = ChatMessage(
            user_id=current_user.id,
            role="ai",
            content=answer,
        )

        db.add(ai_message)

        db.commit()

    except Exception as error:
        db.rollback()

        print(
            "Chat message database error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save chat messages.",
        )

    sources = []

    for result in results:
        chunk = result.get("chunk")

        if chunk is None:
            continue

        document = getattr(
            chunk,
            "document",
            None,
        )

        if document is None:
            continue

        try:
            score = float(
                result.get(
                    "score",
                    0,
                )
            )
        except (
            TypeError,
            ValueError,
        ):
            score = 0.0

        sources.append(
            ChatSource(
                document_id=chunk.document_id,
                filename=document.filename,
                chunk_index=chunk.chunk_index,
                score=round(score, 4),
            )
        )

    return ChatResponse(
        answer=answer,
        sources=sources,
    )


# =========================================================
# AI CHAT HISTORY
# =========================================================

@app.get(
    "/chat/history",
    response_model=list[ChatMessageResponse],
)
def get_chat_history(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    return (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == current_user.id
        )
        .order_by(
            ChatMessage.created_at.asc(),
            ChatMessage.id.asc(),
        )
        .all()
    )


# =========================================================
# CLEAR AI CHAT HISTORY
# =========================================================

@app.delete("/chat/history")
def clear_chat_history(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    try:
        (
            db.query(ChatMessage)
            .filter(
                ChatMessage.user_id == current_user.id
            )
            .delete(
                synchronize_session=False
            )
        )

        db.commit()

    except Exception as error:
        db.rollback()

        print(
            "Chat history deletion error:",
            repr(error),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to clear chat history.",
        )

    return {
        "message": "Chat history cleared successfully."
    }
# =========================================================
# SMART STUDY PLANNER
# =========================================================



KNOWLEDGE_LEVEL_WEAKNESS = {
    "beginner": 3.0,
    "basic": 2.2,
    "medium": 1.5,
    "good": 1.0,
    "advanced": 0.6,
}


def calculate_priority(
    topic_weight: float,
    exam_freq: float,
    weakness_score: float,
    days_remaining: int,
) -> float:
    """
    Calculate relative importance of a topic.

    Higher:
        - exam weight
        - exam frequency
        - student weakness

    means higher priority. Formula divides by days remaining.
    """

    priority = (
        topic_weight
        * exam_freq
        * weakness_score
    ) / max(days_remaining, 1)

    return round(priority, 2)


def normalize_hours(
    hours: float,
) -> float:
    """
    Keep study hours clean and consistent.
    """

    return round(
        max(hours, 0.1),
        1,
    )


def allocate_topic_hours(
    topics: list[dict],
    available_hours: float,
) -> list[dict]:
    """
    Allocate available study hours proportionally
    according to topic priority.
    """

    if not topics:
        return []

    total_priority = sum(
        topic["priority"]
        for topic in topics
    )

    if total_priority <= 0:
        equal_hours = (
            available_hours / len(topics)
        )

        return [
            {
                **topic,
                "hours": normalize_hours(
                    equal_hours
                ),
            }
            for topic in topics
        ]

    allocated = []

    for topic in topics:
        proportion = (
            topic["priority"]
            / total_priority
        )

        hours = (
            available_hours
            * proportion
        )

        allocated.append(
            {
                **topic,
                "hours": normalize_hours(hours),
            }
        )

    return allocated


def get_fallback_topics(
    exam_name: str,
) -> list[dict]:
    """
    Generic fallback topics when the planner does not
    have enough subject-specific information.
    """

    return [
        {
            "name": "Core Concepts",
            "weight": 8,
            "exam_freq": 8,
        },
        {
            "name": "Important Definitions",
            "weight": 6,
            "exam_freq": 7,
        },
        {
            "name": "Problem Solving",
            "weight": 9,
            "exam_freq": 9,
        },
        {
            "name": "Applications",
            "weight": 7,
            "exam_freq": 7,
        },
        {
            "name": "Advanced Concepts",
            "weight": 6,
            "exam_freq": 6,
        },
        {
            "name": "Practice Questions",
            "weight": 9,
            "exam_freq": 9,
        },
    ]


def get_planner_topics(
    exam_name: str,
    subject: Subject | None,
    document_chunks: list[DocumentChunk],
    weakness_score: float,
    days_remaining: int,
) -> list[dict]:
    """
    Select topics for the planner.

    Attempts to use Gemini to extract topics
    from uploaded material (if any) or subject name.

    If AI extraction fails, use a safe fallback.
    """

    material = ""
    if document_chunks:
        material = "\n\n".join(
            chunk.content
            for chunk in document_chunks
            if chunk.content
        )
        material = material[:30000]

    subject_name = (
        subject.name
        if subject
        else exam_name
    )

    prompt = f"""
You are an expert academic study planner.

Identify the most important topics that a student
should study for the following exam.

EXAM:
{exam_name}

SUBJECT:
{subject_name}

STUDY MATERIAL:
{material}

Return ONLY valid JSON.

Return exactly this structure:

{{
    "topics": [
        {{
            "name": "Topic name",
            "weight": 8,
            "exam_freq": 8
        }}
    ]
}}

Rules:

1. Return between 5 and 12 topics.
2. Base topics primarily on the supplied material.
3. Do not invent topics unrelated to the material.
4. weight must be an integer from 1 to 10.
5. exam_freq must be an integer from 1 to 10.
6. Avoid duplicate topics.
7. Return JSON only.
"""

    try:
        ai_text = generate_with_gemini(prompt)

        generated_data = extract_json_object(
            ai_text
        )

        generated_topics = (
            generated_data.get("topics")
        )

        if isinstance(
            generated_topics,
            list,
        ):
            validated_topics = []

            seen = set()

            for topic in generated_topics:
                if not isinstance(
                    topic,
                    dict,
                ):
                    continue

                name = topic.get("name")

                if not isinstance(
                    name,
                    str,
                ):
                    continue

                name = name.strip()

                if not name:
                    continue

                normalized_name = (
                    name.casefold()
                )

                if normalized_name in seen:
                    continue

                try:
                    weight = int(
                        topic.get(
                            "weight",
                            5,
                        )
                    )

                    exam_freq = int(
                        topic.get(
                            "exam_freq",
                            5,
                        )
                    )

                except (
                    TypeError,
                    ValueError,
                ):
                    continue

                weight = max(
                    1,
                    min(weight, 10),
                )

                exam_freq = max(
                    1,
                    min(exam_freq, 10),
                )

                seen.add(
                    normalized_name
                )

                validated_topics.append(
                    {
                        "name": name,
                        "weight": weight,
                        "exam_freq": exam_freq,
                    }
                )

            if validated_topics:
                topics = validated_topics
            else:
                topics = get_fallback_topics(
                    exam_name
                )

        else:
            topics = get_fallback_topics(
                exam_name
            )

    except Exception as error:
        print(
            "Study planner topic extraction error:",
            repr(error),
        )

        topics = get_fallback_topics(
            exam_name
        )

    prioritized_topics = []

    for topic in topics:
        priority = calculate_priority(
            topic["weight"],
            topic["exam_freq"],
            weakness_score,
            days_remaining,
        )

        prioritized_topics.append(
            {
                **topic,
                "priority": priority,
            }
        )

    prioritized_topics.sort(
        key=lambda item: item["priority"],
        reverse=True,
    )

    return prioritized_topics


@app.post(
    "/study-plan/generate",
    response_model=GenerateStudyPlanResponse,
)
def generate_study_plan(
    plan_request: GenerateStudyPlanRequest,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    Generate a personalized study plan.

    Strategy:

    - Identify important topics.
    - Give weaker students more time on difficult topics.
    - Reserve time for practice.
    - Reserve the final part of the schedule for revision.
    - Guarantee one task for every remaining day.
    """

    exam_name = (
        plan_request.exam_name.strip()
    )

    if not exam_name:
        raise HTTPException(
            status_code=400,
            detail="exam_name cannot be empty.",
        )

    days = plan_request.days_remaining

    hours_per_day = (
        plan_request.study_hours_per_day
    )

    knowledge_level = (
        plan_request.current_knowledge
        .strip()
        .casefold()
    )

    weakness_score = (
        KNOWLEDGE_LEVEL_WEAKNESS[
            knowledge_level
        ]
    )

    total_study_hours = (
        days * hours_per_day
    )

    # -----------------------------------------------------
    # Validate subject
    # -----------------------------------------------------

    subject = None

    if plan_request.subject_id is not None:
        subject = (
            db.query(Subject)
            .filter(
                Subject.id
                == plan_request.subject_id,
                Subject.user_id
                == current_user.id,
            )
            .first()
        )

        if not subject:
            raise HTTPException(
                status_code=404,
                detail="Subject not found.",
            )

    # -----------------------------------------------------
    # Load uploaded study material
    # -----------------------------------------------------

    document_chunks = []

    if plan_request.subject_id is not None:
        document_chunks = (
            db.query(DocumentChunk)
            .join(
                Document,
                DocumentChunk.document_id
                == Document.id,
            )
            .filter(
                Document.user_id
                == current_user.id,
                Document.subject_id
                == plan_request.subject_id,
            )
            .order_by(
                Document.id.asc(),
                DocumentChunk.chunk_index.asc(),
            )
            .limit(40)
            .all()
        )

    # -----------------------------------------------------
    # Get topics
    # -----------------------------------------------------

    topics = get_planner_topics(
        exam_name=exam_name,
        subject=subject,
        document_chunks=document_chunks,
        weakness_score=weakness_score,
        days_remaining=days,
    )

    # -----------------------------------------------------
    # Special case: one-day preparation
    # -----------------------------------------------------

    if days == 1:
        study_plan = [
            StudyPlanDay(
                day=1,
                topic="Final Revision + Mock Test",
                estimated_hours=normalize_hours(
                    hours_per_day
                ),
                priority=10.0,
                description=(
                    "Review the highest-priority topics, "
                    "solve important questions, and finish "
                    "with a timed mock test."
                ),
                type="revision",
            )
        ]

        return GenerateStudyPlanResponse(
            exam=exam_name,
            subject_id=plan_request.subject_id,
            subject_name=subject.name if subject else "Unknown subject",
            days_remaining=days,
            study_hours_per_day=hours_per_day,
            current_knowledge=(
                plan_request.current_knowledge
            ),
            study_plan=study_plan,
        )

    # -----------------------------------------------------
    # Decide how many days are reserved for revision
    # -----------------------------------------------------

    if days <= 3:
        revision_days = 1
    elif days <= 7:
        revision_days = 2
    elif days <= 14:
        revision_days = 2
    else:
        revision_days = max(
            2,
            min(
                5,
                round(days * 0.15),
            ),
        )

    # Always leave at least one content day.
    revision_days = min(
        revision_days,
        days - 1,
    )

    content_days = (
        days - revision_days
    )

    # -----------------------------------------------------
    # Reserve one practice/PYQ day
    # -----------------------------------------------------

    practice_days = 1

    if content_days <= 2:
        practice_days = 0

    topic_days = (
        content_days - practice_days
    )

    # -----------------------------------------------------
    # Select topics that can reasonably fit
    # -----------------------------------------------------

    selected_topics = topics[
        :max(topic_days, 1)
    ]

    # If there are more topic days than available
    # topics, cycle through important topics.
    expanded_topics = []

    for index in range(topic_days):
        topic = selected_topics[
            index % len(selected_topics)
        ]

        expanded_topics.append(
            topic
        )

    # -----------------------------------------------------
    # Allocate topic study time
    # -----------------------------------------------------

    topic_total_hours = (
        topic_days
        * hours_per_day
    )

    allocated_topics = allocate_topic_hours(
        expanded_topics,
        topic_total_hours,
    )

    study_plan = []

    # -----------------------------------------------------
    # Topic study days
    # -----------------------------------------------------

    for index, topic in enumerate(
        expanded_topics,
        start=1,
    ):
        study_plan.append(
            StudyPlanDay(
                day=index,
                topic=topic["name"],
                estimated_hours=round(
                    hours_per_day,
                    1,
                ),
                priority=topic["priority"],
                description=(
                    f"Study {topic['name']} thoroughly. "
                    "Create short notes and solve "
                    "practice questions."
                ),
                type="study",
            )
        )


    current_day = (
        len(study_plan) + 1
    )

    # -----------------------------------------------------
    # Practice / PYQ day
    # -----------------------------------------------------

    if practice_days:
        study_plan.append(
            StudyPlanDay(
                day=current_day,
                topic="Previous Year Questions & Practice",
                estimated_hours=normalize_hours(
                    hours_per_day
                ),
                priority=10.0,
                description=(
                    "Solve previous year questions "
                    "and timed practice problems. "
                    "Identify weak areas for revision."
                ),
                type="practice",
            )
        )

        current_day += 1

    # -----------------------------------------------------
    # Revision days
    # -----------------------------------------------------

    revision_topic_names = [
        "Weak Areas Revision",
        "Full Syllabus Revision",
        "Mock Test + Final Revision",
    ]

    revision_index = 0

    while current_day <= days:
        is_final_day = (
            current_day == days
        )

        if is_final_day:
            topic = "Mock Test + Final Revision"

            description = (
                "Take a timed full-length mock test, "
                "analyze mistakes, and revise the "
                "highest-priority weak areas."
            )

        else:
            topic = revision_topic_names[
                min(
                    revision_index,
                    len(
                        revision_topic_names
                    ) - 1,
                )
            ]

            description = (
                "Review previously studied material, "
                "active-recall key concepts, and solve "
                "targeted practice questions."
            )

        study_plan.append(
            StudyPlanDay(
                day=current_day,
                topic=topic,
                estimated_hours=normalize_hours(
                    hours_per_day
                ),
                priority=9.5,
                description=description,
                type="revision",
            )
        )

        revision_index += 1
        current_day += 1

    # -----------------------------------------------------
    # Safety check
    # -----------------------------------------------------

    # The planner must always return exactly the number
    # of requested days.
    if len(study_plan) != days:
        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to generate a complete study plan."
            ),
        )

    return GenerateStudyPlanResponse(
        exam=exam_name,
        subject_id=plan_request.subject_id,
        subject_name=subject.name if subject else "Unknown subject",
        days_remaining=days,
        study_hours_per_day=hours_per_day,
        current_knowledge=(
            plan_request.current_knowledge
        ),
        study_plan=study_plan,
    )


# =========================================================
# EXAM SETTINGS (persistent countdown)
# =========================================================

@app.get(
    "/user/exam",
    response_model=ExamSettingsResponse,
)
def get_exam_settings(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    setting = (
        db.query(UserSetting)
        .filter(UserSetting.user_id == current_user.id)
        .first()
    )

    if not setting:
        setting = UserSetting(user_id=current_user.id)
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return setting


@app.put(
    "/user/exam",
    response_model=ExamSettingsResponse,
)
def update_exam_settings(
    request: ExamSettings,
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    setting = (
        db.query(UserSetting)
        .filter(UserSetting.user_id == current_user.id)
        .first()
    )

    if not setting:
        setting = UserSetting(user_id=current_user.id)
        db.add(setting)

    setting.exam_name = request.exam_name
    setting.exam_date = request.exam_date

    db.commit()
    db.refresh(setting)

    return setting


@app.delete(
    "/user/exam",
    response_model=ExamSettingsResponse,
)
def clear_exam_settings(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    setting = (
        db.query(UserSetting)
        .filter(UserSetting.user_id == current_user.id)
        .first()
    )

    if not setting:
        setting = UserSetting(user_id=current_user.id)
        db.add(setting)

    setting.exam_name = None
    setting.exam_date = None

    db.commit()
    db.refresh(setting)

    return setting


# =========================================================
# USER STATS / ANALYTICS
# =========================================================

@app.get(
    "/user/stats",
    response_model=UserStatsResponse,
)
def get_user_stats(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    from sqlalchemy import func

    # ---- Subjects ----
    subjects = (
        db.query(Subject)
        .filter(Subject.user_id == current_user.id)
        .all()
    )

    # ---- Attempts ----
    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.user_id == current_user.id)
        .order_by(QuizAttempt.submitted_at.desc())
        .all()
    )

    # ---- Tasks ----
    tasks = (
        db.query(StudyTask)
        .filter(StudyTask.user_id == current_user.id)
        .all()
    )

    # ---- Documents ----
    documents = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.id.desc())
        .all()
    )

    # ---- Subject performance (single grouped query, no N+1) ----
    subject_performance = (
        db.query(
            Subject.id,
            Subject.name,
            func.count(QuizAttempt.id).label("attempts"),
            func.coalesce(func.sum(QuizAttempt.total), 0).label("total_questions"),
            func.coalesce(func.sum(QuizAttempt.score), 0).label("correct_questions"),
            func.coalesce(func.avg(QuizAttempt.percentage), 0).label("average_score"),
            func.coalesce(func.max(QuizAttempt.percentage), 0).label("best_score"),
        )
        .select_from(Subject)
        .outerjoin(
            Quiz,
            Quiz.subject_id == Subject.id,
        )
        .outerjoin(
            QuizAttempt,
            QuizAttempt.quiz_id == Quiz.id,
        )
        .filter(Subject.user_id == current_user.id)
        .group_by(Subject.id, Subject.name)
        .all()
    )

    # Compute per-subject task completion in one pass over tasks.
    subject_task_counts = {}
    subject_completed_counts = {}
    for task in tasks:
        subject_task_counts[task.subject_id] = subject_task_counts.get(task.subject_id, 0) + 1
        if bool(task.completed):
            subject_completed_counts[task.subject_id] = (
                subject_completed_counts.get(task.subject_id, 0) + 1
            )

    subject_perf_response = []
    for row in subject_performance:
        attempts_count = int(row.attempts or 0)
        total_questions = int(row.total_questions or 0)
        correct_questions = int(row.correct_questions or 0)
        avg = round(float(row.average_score or 0))
        best = int(row.best_score or 0)
        total_subj_tasks = subject_task_counts.get(row.id, 0)
        completed_subj_tasks = subject_completed_counts.get(row.id, 0)
        completion_pct = (
            round((completed_subj_tasks / total_subj_tasks) * 100)
            if total_subj_tasks
            else 0
        )
        subject_perf_response.append(
            SubjectPerformance(
                subject_id=row.id,
                subject_name=row.name,
                attempts=attempts_count,
                total_questions=total_questions,
                correct_questions=correct_questions,
                average_score=avg,
                best_score=best,
                completion_percentage=completion_pct,
            )
        )

    # ---- Activity feed (build quiz map once, no N+1) ----
    quiz_ids = {a.quiz_id for a in attempts}
    quiz_map = {}
    if quiz_ids:
        for q in (
            db.query(Quiz)
            .filter(Quiz.id.in_(quiz_ids))
            .all()
        ):
            quiz_map[q.id] = q

    activity = []

    for attempt in attempts:
        quiz = quiz_map.get(attempt.quiz_id)
        activity.append(
            ActivityItem(
                type="quiz",
                title="Completed a quiz",
                subtitle=(
                    f"{quiz.title if quiz else f'Quiz #{attempt.quiz_id}'} • "
                    f"{attempt.score}/{attempt.total} • {attempt.percentage}%"
                ),
                timestamp=attempt.submitted_at,
            )
        )

    for document in documents:
        activity.append(
            ActivityItem(
                type="document",
                title="Uploaded a document",
                subtitle=document.filename,
                # Documents have no created_at column; derive a sortable
                # synthetic timestamp from the auto-increment id so that
                # newer documents appear later in the activity feed.
                timestamp=_synthetic_task_time(document),
            )
        )

    for task in tasks:
        created_ts = None
        activity.append(
            ActivityItem(
                type="task",
                title="Created a study task",
                subtitle=task.title,
                timestamp=(
                    _parse_due_date(task.due_date)
                    or created_ts
                    or _synthetic_task_time(task)
                ),
            )
        )

    activity.sort(key=lambda item: item.timestamp, reverse=True)
    activity = activity[:15]

    # ---- Streak ----
    active_days = set()
    for attempt in attempts:
        active_days.add(attempt.submitted_at.date())

    streak_days = _compute_streak(active_days)

    # ---- Aggregate quiz numbers ----
    total_attempts = len(attempts)

    average_score = (
        round(sum(a.percentage for a in attempts) / total_attempts)
        if total_attempts
        else 0
    )

    best_score = (
        max(a.percentage for a in attempts)
        if total_attempts
        else 0
    )

    completed_tasks = sum(1 for t in tasks if bool(t.completed))
    pending_tasks = len(tasks) - completed_tasks
    completion_rate = round(
        (completed_tasks / len(tasks)) * 100
        if tasks
        else 0
    )

    return UserStatsResponse(
        subject_performance=subject_perf_response,
        activity=activity,
        streak_days=streak_days,
        average_score=average_score,
        best_score=best_score,
        total_attempts=total_attempts,
        completed_tasks=completed_tasks,
        pending_tasks=pending_tasks,
        completion_rate=completion_rate,
    )


# =========================================================
# AI PERSONALIZED RECOMMENDATIONS
# =========================================================

@app.get(
    "/user/recommendations",
    response_model=AIRecommendationsResponse,
)
def get_recommendations(
    current_user: User = Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    subjects = (
        db.query(Subject)
        .filter(Subject.user_id == current_user.id)
        .all()
    )

    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.user_id == current_user.id)
        .all()
    )

    tasks = (
        db.query(StudyTask)
        .filter(StudyTask.user_id == current_user.id)
        .all()
    )

    # Build quiz map in one query to avoid N+1.
    quiz_map = {}
    if attempts:
        quiz_ids = {a.quiz_id for a in attempts}
        for q in (
            db.query(Quiz)
            .filter(Quiz.id.in_(quiz_ids))
            .all()
        ):
            quiz_map[q.id] = q

    subject_name_by_id = {s.id: s.name for s in subjects}

    subject_scores = {}
    for attempt in attempts:
        quiz = quiz_map.get(attempt.quiz_id)
        if not quiz:
            continue
        entry = subject_scores.setdefault(
            quiz.subject_id,
            {"name": subject_name_by_id.get(quiz.subject_id, "Unknown"), "scores": []},
        )
        entry["scores"].append(attempt.percentage)

    weak_subjects = sorted(
        (
            {
                "name": data["name"],
                "avg": (
                    sum(data["scores"]) / len(data["scores"])
                    if data["scores"]
                    else 0
                ),
            }
            for data in subject_scores.values()
            if data["scores"]
        ),
        key=lambda x: x["avg"],
    )[:2]

    overdue_tasks = [
        t for t in tasks
        if not bool(t.completed)
        and t.due_date
        and _parse_due_date(t.due_date) is not None
        and _parse_due_date(t.due_date).date() < _today()
    ]

    pending_task_count = sum(
        1 for t in tasks if not bool(t.completed)
    )

    context_lines = []

    if weak_subjects:
        context_lines.append(
            "Weak subjects (lowest average quiz scores): "
            + ", ".join(
                f"{s['name']} ({s['avg']}%)"
                for s in weak_subjects
            )
        )

    if overdue_tasks:
        context_lines.append(
            f"Overdue tasks ({len(overdue_tasks)}): "
            + "; ".join(t.title for t in overdue_tasks[:3])
        )

    context_lines.append(
        f"Pending tasks: {pending_task_count}; "
        f"total attempts: {len(attempts)}; "
        f"subjects: {len(subjects)}."
    )

    setting = (
        db.query(UserSetting)
        .filter(UserSetting.user_id == current_user.id)
        .first()
    )

    if setting and setting.exam_name and setting.exam_date:
        context_lines.append(
            f"Next exam: {setting.exam_name} on {setting.exam_date}."
        )

    context = "\n".join(context_lines)

    prompt = (
        "You are EduPilot's study advisor. Based ONLY on the real student "
        "data below, give exactly 3 short, actionable, personalized study "
        "recommendations. Return raw JSON, no markdown, of the form: "
        '{"recommendations": [{"title": "...", "description": "..."}, '
        '{"title": "...", "description": "..."}, {"title": "...", '
        '"description": "..."}]}.\n\n'
        f"Student data:\n{context}"
    )

    try:
        raw = ask_gemini(prompt, max_retries=1)
        parsed = extract_json_object(raw)

        recs = parsed.get("recommendations", [])

        items = [
            AIRecommendation(
                title=str(r.get("title", "Tip")),
                description=str(r.get("description", "")),
            )
            for r in recs[:3]
            if isinstance(r, dict)
        ]

        if items:
            return AIRecommendationsResponse(recommendations=items)
    except Exception:
        pass

    # Fallback derived from real data (no hardcoded numbers)
    fallback = []

    for subject in weak_subjects:
        fallback.append(
            AIRecommendation(
                title=f"Focus on {subject['name']}",
                description=(
                    f"Your average score in {subject['name']} is "
                    f"{subject['avg']}%. Review your quiz history and "
                    "re-take quizzes to improve."
                ),
            )
        )

    if overdue_tasks:
        fallback.append(
            AIRecommendation(
                title="Catch up on overdue tasks",
                description=f"You have {len(overdue_tasks)} overdue task(s) to complete.",
            )
        )

    if not fallback:
        fallback.append(
            AIRecommendation(
                title="Keep building your study routine",
                description="Add study tasks and take quizzes to get personalized guidance.",
            )
        )

    return AIRecommendationsResponse(recommendations=fallback)


# =========================================================
# INTERNAL HELPERS (analytics)
# =========================================================

def _today():
    from datetime import date
    return date.today()


def _parse_due_date(value):
    if not value:
        return None

    try:
        from datetime import datetime
        return datetime.fromisoformat(str(value))
    except Exception:
        return None


def _synthetic_task_time(task):
    # Approximate a sortable timestamp when a task has no timestamps.
    from datetime import datetime, timedelta
    return datetime.now() - timedelta(hours=max(24, task.id * 1000))


def _compute_streak(active_days):
    from datetime import timedelta

    day = _today()

    if day not in active_days:
        day -= timedelta(days=1)

    streak = 0

    while day in active_days:
        streak += 1
        day -= timedelta(days=1)

    return streak


# =========================================================
# ENTRYPOINT
# =========================================================
# Run with:   python main.py
# Honors the HOST / PORT / RELOAD / WORKERS / LOG_LEVEL env vars.

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "1") == "1",
        workers=int(os.getenv("WORKERS", "1")),
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
