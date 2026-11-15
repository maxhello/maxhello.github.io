# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# agents/tutor/ — AI 英语口语陪练 Emma(语音 agent)

**2026-11-15 从独立仓库 maxhello/livekit-tutor 并入个人站点仓库(只搬代码,未带提交历史)。原来的三部分现在分住三处:**

- 语音 agent → 本目录 `agents/tutor/`(`uv` / `lk` 命令在这里执行)
- 陪练页前端 → 站点的 `web/src/tutor/`,路由 `/english/tutor`(站点的一个页面,不再是独立应用)
- 后端 → 仓库根的 `site-api/`(同时管站点的学习数据)

仓库级规则(提交纪律、内容红线)见根目录 CLAUDE.md。下文路径相对仓库根。

AI 英语口语陪练 "Emma":bilingual short-sentence conversation practice for a Chinese adult beginner (CEFR A1). Personal-use project.

## Three parts, each deployed separately

- `agents/tutor/` — the voice agent. Entrypoint `agent/main.py` (Dockerfile CMD; paths in this bullet are relative to `agents/tutor/`); pure correction logic (analyzer prompt, gating, card parsing) lives in `agent/corrections.py` so tests import it without loading the whole agent. Pipeline: STT `assemblyai/universal-3-5-pro` · LLM `google/gemma-4-31b-it` · TTS `fishaudio/s2.1-pro` (voice Hannah) — all via LiveKit Inference (`livekit.agents.inference`), so no third-party API keys. Uses the LiveKit turn detector with adaptive interruptions and preemptive generation, plus ai_coustics noise cancellation on input. Deployed to LiveKit Cloud with `lk agent deploy`.
  - **Live correction notebook**: every completed user turn triggers a background `google/gemini-3.1-flash-lite` analysis (`on_user_turn_completed` → fire-and-forget task, rate-limited, never blocks the reply); real mistakes are pushed as cards on data channel topic `correction` (grammar/word/pronunciation + Chinese point + IPA words, fed by low-confidence STT words). Emma's spoken "更正:" behavior is unchanged.
  - **Simli avatar (opt-in)**: enabled only when `SIMLI_API_KEY` + `SIMLI_FACE_ID` are set in `.env.local`; the avatar worker republishes lip-synced A/V so the agent's own `audio_output` is disabled in that case. Without keys: plain voice, identical to before. Startup retries on Simli 429 (first instance started before `session.start` so the greeting audio routes to it; after `ctx.connect()` a background task confirms its video track appears and otherwise retries with fresh instances after `/ratelimiter/sessions` clears the concurrency slot — reconnecting within ~20s of leaving can hit the 429 because the previous job's shutdown still holds the slot; the plugin's own `wait_for_join` returns immediately when called before the room connects, so it isn't used). Tests: `tests/test_avatar_retry.py`.
  - **Auto hang-up**: Emma has the prebuilt `EndCallTool`; when the student says goodbye she says one short goodbye, shuts the session down and deletes the room, and the page auto-saves on disconnect. Behavior tests: `tests/test_end_call_behavior.py`.
- `web/src/tutor/` — the practice page, part of the personal site's single React app (route `/english/tutor`, wrapper `web/src/pages/Tutor.tsx` renders it outside the site `Layout` and lazy-loads it so `livekit-client` only downloads there; styles in `web/src/tutor/tutor.css` scoped by the `.tutor-app` container, button class is `.tutor-btn-primary` to stay clear of the site's `.btn-primary`). Deployed with the site by `deploy.yml`. The old URL `/livekit-tutor/` is a static redirect (`web/public/livekit-tutor/index.html`) that keeps query and hash. `web/src/tutor/Tutor.tsx` is the app shell (connection, transcript, live correction cards, avatar video, session capture; the call status only says it's the student's turn once the agent's `lk.agent.state` leaves `initializing` — Build-plan cold starts take 10–20s); `web/src/tutor/History.tsx` is the history list / replay (read straight from the backend — no localStorage history; only login state lives in localStorage); `web/src/tutor/api.ts` is the backend client (GitHub PAT → backend-issued JWT, silent re-auth on 401).
- `site-api/` — backend: FastAPI + SQLAlchemy (Neon serverless PostgreSQL in prod — direct endpoint, small pool with `pool_recycle` for autosuspend; sqlite in tests), GitHub OAuth one-click login (code flow with state cookie, allowlist-checked, issues 30-day JWTs delivered back to the SPA via URL hash; a legacy PAT login endpoint also exists), session/message/correction CRUD, and `POST /api/token` which mints short-lived LiveKit room tokens and creates the session row (server-generated id + `started_at`; `ended_at` set on the first save — the client never supplies ids or times). The session id also rides in the room token as participant attribute `session_id`; `POST /api/livekit/webhook` (LiveKit Cloud webhook, signed with the server's API key) fills a missing `ended_at` on `participant_left` for `max`, so sessions closed without the hang-up save still get an end time. Split: `main.py` (app/routes), `models.py` (DB models + engine), `auth.py` (PAT verify + JWT). Deployed on the user's k3s server (Traefik + cert-manager Let's Encrypt; per-service subdomain `tutor.<IP-dashes>.sslip.io`). k8s manifests and deploy docs are kept outside this repo. Image built by `.github/workflows/server-image.yml` (pushes touching `site-api/**`) to `ghcr.io/maxhello/site-api`.

**Connection flow:** on Start (login required), the page calls `POST /api/token` on the backend, which signs a fresh 12h LiveKit room token with the API key/secret (embedded agent dispatch → Emma joins automatically) — no long-lived tokens in the browser, no manual `lk token create` for the web. Room `tutor-max`, identity `max` are fixed on the backend (`site-api/main.py`). On hang-up the page auto-saves the transcript + correction cards with `PUT /api/sessions/{sessionId}` (idempotent, retried). **What to practice** is decided at Start and sent in the `/api/token` body: a scenario wins; otherwise a Duolingo unit (default = current unit, any learned unit selectable for review), otherwise free chat. The page gets the unit data from the same sources as the site's learning path (`web/src/tutor/units.ts`: progress from `web/src/lib/learning.ts` → current unit = latest `score.lastUnitDone` + 1; objective/key sentences/grammar from `loadGuidebooks()` in `web/src/components/UnitGuide.tsx`). The backend validates/clamps it and puts it in the agent dispatch metadata; `agent/practice.py` parses `ctx.job.metadata` into the "Today's practice" instructions (unit material fenced as data) and Emma opens accordingly in `on_enter`. Behavior tests: `tests/test_practice_behavior.py` (real LLM + judge, skipped without credentials). The personal site's learning path (`/english/learn`) links here with `?unit=N` / `?history=unit:N` and shows per-unit practice counts from `GET /api/units/stats` (same app now; reuses the tutor login kept in localStorage). The agent pushes correction cards back on `topic: "correction"`. Human participant identity is always `max`; transcript bubbles and speaking state are keyed off it.

**Learning data (since 2026-11-15):** `site-api/` also owns the personal site's Duolingo / Praktika data. `site-api/collectors/` are the collectors (file-based: read/merge/write module-level `OUT`); `site-api/collect.py` (`run` / `seed` / `dump`) runs them against the single `learning_docs` table for the k3s CronJob (one row per document per day, `is_latest` marks the live one, older rows are 90-day backups); `GET /api/learning/{key}` is public read-only. The site reads it through `web/src/lib/learning.ts` (fetched from the API at startup; no bundled fallback). Details are in the repo-root CLAUDE.md. Tests: `site-api/tests/test_collect*.py`.

Old GitHub-as-storage history (`sessions/` JSON) was dropped intentionally — history now lives in PostgreSQL only.

## Commands

Agent and backend use `uv` (two separate uv projects: `agents/tutor/` and `site-api/`); the practice page is built with the site (`npm run dev` / `npm run build` in `web/`).

```bash
# in agents/tutor/
lk agent dev agent/main.py   # run agent locally with hot reload (entrypoint must be explicit)
lk agent deploy               # update the LiveKit Cloud deployment (after agent changes)
                              # Simli 密钥经 LiveKit Cloud secrets 注入(不进镜像/git):
                              #   lk agent deploy --secrets SIMLI_API_KEY=xxx --secrets SIMLI_FACE_ID=yyy
uv run ruff format && uv run ruff check   # agent lint/format
uv run pytest                              # agent tests (tests/)

# in site-api/
uv run pytest                    # backend + collector tests (sqlite in-memory)
uv run uvicorn main:app --reload # backend dev (sqlite fallback without DATABASE_URL)
```

Secrets live in `agents/tutor/.env.local` (gitignored; loaded by `agent/main.py` via `load_dotenv`): `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`, plus optional `SIMLI_API_KEY` / `SIMLI_FACE_ID`. `livekit.toml` holds the LiveKit Cloud project subdomain and agent id used by `lk agent` commands.

Practice-page version marker: `APP_VERSION` in `web/src/tutor/Tutor.tsx` — bump on every change to `web/src/tutor/`; the footer shows it to verify the Pages deploy. The backend URL comes from `site.tutor.api` in `web/src/site.config.ts`.

## LiveKit Documentation

LiveKit Agents evolves fast — always check the latest docs rather than guessing APIs. The LiveKit CLI's `lk docs` subcommand gives full docs access from the terminal (CLI 2.15.0+, `brew install livekit-cli` on macOS). Key commands: `lk docs overview`, `lk docs search`, `lk docs get-page`, `lk docs changelog`. Prefer browsing over search, and search over `code-search` (docs pages are more current). An MCP server with the same access lives at `https://docs.livekit.io/mcp`. If you used these to search or browse, submit constructive feedback with `lk docs submit-feedback`.

## Agent design

Voice AI is latency-sensitive: keep irrelevant context and tools out of LLM requests. Background work (like the correction analyzer) must run as fire-and-forget tasks with held references — never inline in hooks that gate Emma's reply.

When changing core agent behavior (instructions, tool descriptions, tasks/handoffs, the correction pipeline), don't guess what will work — write tests for the desired behavior first and iterate until they pass. See https://docs.livekit.io/agents/start/testing/.

Beyond docs access, the `lk` CLI also manages things like SIP trunks for telephony agents (`lk --help`).
