# Campus Customs Ops Desk (frontend)

React 19 + Vite 8 + TypeScript dashboard for the agent team. It talks to the FastAPI backend from Problem 7.

```bash
# 1. backend (from the project root)
cd backend && source ../.venv/bin/activate && uvicorn main:app --reload --port 8000
# 2. frontend (new terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173
```

- API base URL: `VITE_API_BASE_URL` in `frontend/.env` (default `http://localhost:8000`, see `.env.example`).
- `npm run typecheck`: TypeScript only. `npm run build`: typecheck + production bundle.
- Layout: `src/lib/` (typed API client, types mirroring `backend/models.py`, polling hook, feed/summary logic, status mapping) and `src/components/` (queue, workspace, timeline, run review, finance panel, dialogs).
- Design rationale: `../output/design.md`.
