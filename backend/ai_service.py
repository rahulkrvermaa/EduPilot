import os
import time

from dotenv import load_dotenv

from google import genai
from google.genai import types


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing from your .env file."
    )


# =========================================================
# CLIENT
# =========================================================

client = genai.Client(
    api_key=GEMINI_API_KEY
)


# =========================================================
# MODEL
# =========================================================

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-3.6-flash",
)

# Per-request timeout, in seconds. The frontend default is 30s; we
# give the backend 60s so a slow model response still arrives.
GEMINI_TIMEOUT_SECONDS = int(
    os.getenv("GEMINI_TIMEOUT_SECONDS", "60")
)

# Optional cap on the number of output tokens per response.
# Empty string means "let the model decide".
_gemini_max_tokens_raw = os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "").strip()
GEMINI_MAX_OUTPUT_TOKENS = (
    int(_gemini_max_tokens_raw) if _gemini_max_tokens_raw else None
)

FALLBACK_MODELS = [
    GEMINI_MODEL,
    "gemini-3.6-flash",
    "gemini-flash-latest",
]


# =========================================================
# ASK GEMINI
# =========================================================

def ask_gemini(
    question: str,
    max_retries: int = 3,
) -> str:

    question = question.strip()

    if not question:
        return "Please enter a question."

    last_error = None

    # Deduplicate candidate models preserving order
    candidate_models = []
    for m in FALLBACK_MODELS:
        if m and m not in candidate_models:
            candidate_models.append(m)

    for model_name in candidate_models:
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=question,
                    config=types.GenerateContentConfig(
                        max_output_tokens=GEMINI_MAX_OUTPUT_TOKENS,
                        system_instruction="""
You are EduPilot AI Tutor.

Help students understand academic subjects.

Give clear, accurate, useful explanations.

Guidelines:
- Explain concepts step by step when appropriate.
- Use examples when helpful.
- Use headings and bullet points when useful.
- For technical subjects, explain important terms.
- Answer the complete question.
- Do not stop in the middle of an explanation.
- Keep simple questions concise.
- Give more detail when the question requires it.
""",
                    ),
                )

                answer = response.text

                if answer and answer.strip():
                    return answer.strip()

                raise RuntimeError(
                    "Gemini returned an empty response."
                )

            except Exception as error:
                last_error = error
                error_text = str(error)

                print(
                    f"GEMINI ERROR [{model_name}] attempt {attempt + 1}/{max_retries}:",
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
                    # Not a capacity/rate issue (e.g. 404 model not found); break to next fallback model
                    break

                if attempt < max_retries - 1:
                    delay = 1.5 * (2 ** attempt)
                    print(
                        f"Gemini temporarily unavailable. Retrying in {delay}s..."
                    )
                    time.sleep(delay)

    raise RuntimeError(
        f"Gemini request failed: {last_error}"
    ) from last_error
