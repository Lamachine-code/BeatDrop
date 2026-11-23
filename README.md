# 🎵 BeatDrop — Live Blind Test for Twitch Streamers (MVP)

The streamer logs in with Twitch, picks a blind test, pastes a URL into OBS, and starts the game. Chat answers, BeatDrop detects right answers (with typo tolerance), calculates points, and displays the live leaderboard.

> ⚠️ **Code status**: this MVP was written from the spec, but **could not be run end-to-end** in the environment where it was generated (no network access: no `pnpm install`, no Twitch, no YouTube). Only the pure logic (normalization + matcher) has been tested. Expect to fix a few typing or version issues on the first run (`pnpm typecheck` will help). Priority items to verify are listed in Section 12.

---

## Table of Contents

1. [What's Included in the MVP](https://www.google.com/search?q=%231-whats-included-in-the-mvp)
2. [Prerequisites](https://www.google.com/search?q=%232-prerequisites)
3. [Create the Twitch Application](https://www.google.com/search?q=%233-create-the-twitch-application)
4. [Installation](https://www.google.com/search?q=%234-installation)
5. [`.env` Configuration](https://www.google.com/search?q=%235-env-configuration)
6. [Database](https://www.google.com/search?q=%236-database)
7. [Running the Project](https://www.google.com/search?q=%237-running-the-project)
8. [First Blind Test, Step by Step](https://www.google.com/search?q=%238-first-blind-test-step-by-step)
9. [Connecting OBS](https://www.google.com/search?q=%239-connecting-obs)
10. [Testing Without Going Live](https://www.google.com/search?q=%2310-testing-without-going-live)
11. [Architecture and How It Works](https://www.google.com/search?q=%2311-architecture-and-how-it-works)
12. [Things to Check / Known Limitations](https://www.google.com/search?q=%2312-things-to-check--known-limitations)
13. [JSON Import Format](https://www.google.com/search?q=%2313-json-import-format)
14. [Deployment](https://www.google.com/search?q=%2314-deployment)
15. [Troubleshooting](https://www.google.com/search?q=%2315-troubleshooting)

---

## 1. What's Included in the MVP

| Spec (MVP) | Status |
| --- | --- |
| Twitch login, session creation | ✅ Custom Twitch OAuth (Fastify), JWT in cookie |
| Hidden audio playback + reveal | ✅ YouTube IFrame player always mounted, hidden behind an opaque card |
| Fuzzy matching + scoring (speed, first, streak, difficulty) | ✅ `packages/shared` (tested) |
| Manual / auto transition, +10 s, pause auto | ✅ |
| OBS overlay + dashboard | ✅ `/overlay/[token]` and `/live` |
| Editor + JSON import/export, YouTube check | ✅ `/studio` (check if `YOUTUBE_API_KEY` is set) |
| Netflix-style catalog (Embla carousels) + random | ✅ basic |
| Stream delay calibration | ✅ `/setup` (3 attempts, median) |
| Chat commands `!score` `!top` `!skip` `!hint` | ✅ |
| Duplicate a blind test (fork) | ✅ |

**Intentional deviations from the spec** (so an MVP can start up in a few minutes):

* **No Redis**: game state lives in memory on the realtime server (1 instance). Redis (pub/sub, Socket.IO adapter) becomes necessary to scale horizontally.
* **No Auth.js**: the Fastify server handles Twitch OAuth directly. The Next.js frontend is a pure client (client-rendered pages, so **no SEO on the catalog**).
* **No dedicated bot**: announcements (« ✅ It was… ») are posted using the streamer's account (`user:write:chat`).
* **Twitch tokens encrypted with AES-256-GCM** but stored as base64 `text` (not `bytea`). Categories stored in a text column (no `categories` table).
* **Dashboard**: route `/live?playlist=<id>` (one session per streamer) instead of `/live/[sessionId]`.
* **Out of MVP**: pausing mid-round, manual answer approval/rejection, cross-answer false-positive guards, silent/emote-only mode, hover audio preview, `/leaderboard` page, continuous latency tracking.

---

## 2. Prerequisites

* **Node.js ≥ 22** (`node -v`)
* **pnpm 9**: `corepack enable` then `corepack prepare pnpm@9.15.0 --activate` (or `npm i -g pnpm@9`)
* **Docker** (for PostgreSQL) — or a Postgres 16 instance already installed
* A **Twitch account** (your own works) and access to [https://dev.twitch.tv/console](https://dev.twitch.tv/console)
* Optional: a **YouTube Data API v3 key** ([https://console.cloud.google.com/](https://console.cloud.google.com/) → APIs & Services → enable "YouTube Data API v3" → Credentials → API Key)
* **OBS Studio** for live streams

---

## 3. Create the Twitch Application

1. Go to [https://dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → **Register Your Application**.
2. **Name**: `BeatDrop-dev` (must be unique on Twitch; change it if rejected).
3. **OAuth Redirect URLs**: `http://localhost:4000/auth/twitch/callback` (exact match, no trailing slash).
4. **Category**: `Game Integration` · **Client Type**: `Confidential`.
5. Create the app, open it, copy the **Client ID**, and generate a **Client Secret** (copy it right away).

Scopes requested on login: `user:read:chat` (read chat via EventSub) and `user:write:chat` (bot announcements).

---

## 4. Installation

```bash
cd beatdrop
pnpm install

```

---

## 5. `.env` Configuration

```bash
cp .env.example .env

```

Edit `.env` at the repository root:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | keep the default value matching the provided `docker-compose.yml` |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` (exact 64 hex characters) |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | from step 3 |
| `YOUTUBE_API_KEY` | optional (checks video embeddability on import) |
| `ALLOW_FAKE_CHAT` | `true` locally (test chat in the dashboard), `false` in production |

The frontend works without extra config locally (it points to `http://localhost:4000`). To change it: create `apps/web/.env.local` with `NEXT_PUBLIC_REALTIME_URL=…`.

If any variable is missing or invalid, the server exits with an explicit error message.

---

## 6. Database

```bash
docker compose up -d          # starts PostgreSQL 16 on port 5432
pnpm db:push                  # pushes schema (drizzle-kit push)
pnpm db:seed                  # seeds the public « Hits mondiaux (démo) » playlist

```

> The YouTube IDs in the demo playlist are well-known tracks, but **I could not verify them** (some "Vevo" videos block embedding). Any track that fails is automatically skipped during a live game. Replace them with your own via `/studio` if needed.

---

## 7. Running the Project

```bash
pnpm dev

```

| Service | URL |
| --- | --- |
| Frontend (Next.js) | [http://localhost:3000](http://localhost:3000) |
| Realtime server (Fastify + Socket.IO) | [http://localhost:4000](http://localhost:4000) (health check: `/health`) |

Core domain unit tests: `pnpm --filter @beatdrop/shared test`. Type check: `pnpm typecheck`.

---

## 8. First Blind Test, Step by Step

1. Open [http://localhost:3000](http://localhost:3000) → **Log in with Twitch** → authorize. You land on **Setup**.
2. Step 2: copy the **Overlay URL** (it is secret: you can regenerate it if leaked).
3. Open this URL in **another tab** (or OBS, see §9). Click inside the page to unlock audio (not needed in OBS).
4. Go back to the catalog → **Hits mondiaux (démo)** → **▶ Go live** → **Create session**.
5. The dashboard should show "Overlay connected" and "Twitch chat connected".
6. **▶ Start** (or `Space`). A 3-second countdown runs, then the music starts on the overlay.
7. Answer in your Twitch chat (or via the **test chat**, §10). The leaderboard and toasts update live.
8. Press `Space` to reveal / move to the next track. At the end of the playlist: podium.

**Dashboard shortcuts**: `Space` next/reveal · `H` hint · `A` toggle manual/auto.
**Chat commands**: `!score`, `!top`, `!hint`, `!skip` (moderators and streamer).

### Creating Your Own Blind Test

`/studio` → **New blind test** (form) or **Import JSON** (§13). Accepted answers: `Pokémon, Pokemon`; for both artist AND title: `Daft Punk, Daftpunk ; One More Time, 1 more time`.

---

## 9. Connecting OBS

1. **Sources → + → Browser**.
2. URL = `/setup` overlay URL · Width **1920** · Height **1080**.
3. Check **Control audio via OBS** (music shows up in the mixer).
4. Transparent background: automatic (the page has no background outside cards).
5. **DMCA**: in *Advanced Audio Properties*, route this source to a separate track **excluded from VODs**.

URL query options: `?pos=left` · `?scale=0.8` · `?audioOnly=1` (audio only, player off-screen).

**Calibration** (`/setup`, step 3): the overlay flashes "TOP". As soon as you see it on your stream (another tab), type `TOP` in your chat. 3 attempts, median saved. Adjustable afterward via a slider in the dashboard.

---

## 10. Testing Without Going Live

Twitch login is still required (OAuth), but no live stream is needed:

* The dashboard shows a **test chat** (when `ALLOW_FAKE_CHAT=true`): enter a username and a guess to simulate viewers.
* Set **stream delay to 0** to avoid waiting for perceived lag.
* Open the overlay in a tab: it scales to the window and shows the audio-unlock prompt.

---

## 11. Architecture and How It Works

```
apps/web        Next.js 15 · React 19 · Tailwind 4 · Framer Motion · Embla · Zustand · TanStack Query
apps/realtime   Fastify 5 · Socket.IO 4 · Twurple (EventSub WS + Helix) · Drizzle + PostgreSQL
packages/shared Zod (import/settings) · normalization · matcher · scoring · event types

```

* **Single server clock**: the server decides everything (`t0`, end of round). The overlay estimates its clock offset (ping/pong, best of 8 samples) to start audio at `playAtServerTs`.
* **Phases**: `LOBBY → COUNTDOWN (3 s) → PLAYING (duration + stream delay) → GRACE (1.5 s, no speed bonus) → REVEAL (10 s) → INTERMISSION → …→ ENDED`.
* **Chat**: EventSub `channel.chat.message` using the streamer's token; rate-limited to 1 evaluated message/s/viewer; only one right answer counted per round.
* **Scoring**: 100 + speed bonus (0–100) + 50 for first + streak (+10 × streak, max +50), multiplied by 1 / 1.25 / 1.5 based on difficulty.
* **Tolerance**: Levenshtein distance ≤ 0 / 1 / 2 / 3 based on normalized answer length (≤4 / 5–8 / 9–15 / >15) + sliding word window.
* **Security**: the overlay authenticates with a revocable opaque token (never the Twitch session); the host uses a short-lived JWT; every command is validated with Zod; Twitch tokens are encrypted; answers are never sent to the overlay before reveal; only scores are persisted (no chat messages).
* **Hidden player**: see the warning in §3.2 of the spec (YouTube Terms of Service). Have this reviewed before any commercial use.

Socket.IO events: `state:sync`, `presence`, `round:correct`, `round:reveal`, `leaderboard:update`, `host:toast`, `calib:*` (server → client); `host:session.create`, `host:next`, `host:stop`, `host:close`, `host:hint`, `host:extend`, `host:pause`, `host:settings.update`, `host:fakechat`, `host:calibrate.start`, `overlay:error`, `time:ping` (client → server).

REST API (session cookie): `GET /api/me`, `GET /api/catalog`, `GET|POST /api/playlists`, `GET|PUT|DELETE /api/playlists/:id`, `GET /api/playlists/:id/export`, `POST /api/playlists/:id/fork`, `POST /api/random`, `POST /api/overlay-token/rotate`, `GET /api/socket-token`.

---

## 12. Things to Check / Known Limitations

* **First run**: Next 15 / Tailwind 4 / Twurple 7 / drizzle 0.38 versions were not tested here. If an API changed, `pnpm typecheck` points to it (especially `apps/realtime/src/twitch.ts`).
* **EventSub**: one streamer = one Twitch WebSocket connection. Watch out if there are many concurrent channels.
* **Post-round dead air**: with a stream delay of D seconds, the reveal arrives ~D s after perceived audio ends (the answer window must stay open). Possible improvement: reveal earlier on the overlay while keeping the answer window open.
* **False positives**: with the spec's thresholds, `maria` is accepted for `Mario` (distance 1, 5 letters). Strings of 4 letters or fewer require an exact match.
* **Bot messages**: posted with the streamer's account, and ignored on receipt so they aren't counted as guesses.
* **Demo playlist**: unverified IDs (§6).
* **In-memory state**: restarting the server interrupts active games (scores are only persisted at the end).
* **Cross-domain cookies**: in production, frontend and API must share the same parent domain (e.g., `app.example.com` / `api.example.com`).

---

## 13. JSON Import Format

See `examples/blindtest-hits.json`. Summary:

```json
{
  "schemaVersion": 1,
  "title": "90s Cartoon Blind Test",
  "category": "cartoon",
  "language": "FR",
  "difficulty": 2,
  "tags": ["nostalgie"],
  "tracks": [
    {
      "youtubeUrl": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
      "startTime": 15,
      "duration": 30,
      "acceptedAnswers": ["Pokémon", "Pokemon"],
      "displayTitle": "Pokémon - Season 1 Theme",
      "hint": "Gotta catch 'em all"
    }
  ]
}

```

Categories: `cartoon`, `movie`, `videogame`, `anime`, `series`, `pop`, `other`. 1 to 200 tracks, duration 5–120 s. `acceptedAnswers` can be an array of arrays (groups) with `matchMode: "all"` (default) or `"any"`. Import errors are reported track by track.

---

## 14. Deployment

* **Frontend**: Vercel (`apps/web`, environment variable `NEXT_PUBLIC_REALTIME_URL`).
* **Realtime server**: Fly.io / Railway (long-lived process, not serverless): `pnpm --filter @beatdrop/realtime start` (run via `tsx`). Set `NODE_ENV=production` (`Secure` cookies).
* **PostgreSQL**: Neon or similar; run `pnpm db:push` against the production `DATABASE_URL`.
* Update `WEB_URL`, `PUBLIC_API_URL`, and the **redirect URI** in the Twitch console (`[https://api.example.com/auth/twitch/callback](https://api.example.com/auth/twitch/callback)`). Set `ALLOW_FAKE_CHAT=false`.

---

## 15. Troubleshooting

| Symptom | Likely Cause / Fix |
| --- | --- |
| Server exits on startup | Message about an invalid `.env` variable (64-char hex key, etc.) |
| `redirect_mismatch` on Twitch | Redirect URL in the Twitch console must be an *exact* match to `PUBLIC_API_URL + /auth/twitch/callback` |
| CORS error in browser | `WEB_URL` must match the exact frontend origin (`http://localhost:3000`) |
| Dashboard: « Chat : … » error | Re-authenticate (scopes), check `TWITCH_CLIENT_SECRET` |
| No sound | Overlay not connected (check dashboard), or audio not unlocked in browser (click in the page); in OBS check « Control audio via OBS » |
| A track is skipped automatically | Video non-embeddable/deleted: marked `embeddable=false` |
| Points arrive "late" / round feels too short | Recalibrate stream delay |
| `drizzle-kit push` can't reach DB | Run `docker compose ps`, then check `DATABASE_URL` |