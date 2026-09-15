# EduPilot

EduPilot is an AI-assisted study platform with a React frontend and a FastAPI backend. It supports authentication, subjects, quizzes, study plans, document uploads, and AI-powered tutoring and quiz generation.

## Prerequisites

- Node.js 20 or newer
- Python 3.11 or newer
- PostgreSQL
- A Google Gemini API key for AI features

## Frontend setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The frontend runs at `http://localhost:5173` by default. Set `VITE_API_URL` in `.env` if the backend uses a different address.

Useful checks:

```powershell
npm run lint
npm run build
```

## Backend setup

```powershell
Set-Location backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Update `backend/.env` with a PostgreSQL connection string, a strong `SECRET_KEY`, and `GEMINI_API_KEY`. Start the API from the `backend` directory:

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API docs are available at `http://127.0.0.1:8000/docs` when `ENABLE_DOCS=true`.

## Repository notes

- Never commit `.env` files, API keys, database credentials, uploaded documents, or generated build output.
- `.env.example` and `backend/.env.example` contain safe configuration templates.
- Uploaded documents are stored locally under `backend/uploads/` during development and are ignored by Git.
