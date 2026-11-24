# Render deployment (single Docker service)

BeatDrop is deployed as one Render Web Service from the repository root. Nginx is the public entry point; it forwards the frontend to Next.js and API/OAuth/Socket.IO traffic to Fastify. PostgreSQL remains hosted on Neon.

## Render service

- **Repository:** `Lamachine-code/BeatDrop`
- **Branch:** `development`
- **Runtime:** Docker
- **Root Directory:** leave empty (repository root)
- **Dockerfile Path:** `Dockerfile`
- **Docker Build Context Directory:** leave empty (repository root)
- **Region:** Frankfurt (EU Central), matching the Neon project
- **Instance Type:** Free (suitable for a hobby deployment; resource limits apply)
- **Health Check Path:** `/health`
- Do not set a Node build command or start command. Render uses the Dockerfile.

Render supplies the public `PORT` at runtime. The startup script reserves that port for Nginx and starts Fastify on internal port 4000 and Next.js on internal port 3000.

## Environment variables

Set these in Render's Environment tab. Never commit real secrets to Git.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `WEB_URL` | The service's public HTTPS origin, e.g. `https://beatdrop-example.onrender.com` |
| `PUBLIC_API_URL` | Exactly the same public HTTPS origin as `WEB_URL` |
| `DATABASE_URL` | Neon pooled PostgreSQL connection string |
| `JWT_SECRET` | Random secret, at least 16 characters (32 random bytes recommended) |
| `ENCRYPTION_KEY` | Exactly 64 hexadecimal characters (32 random bytes) |
| `TWITCH_CLIENT_ID` | Twitch application client ID |
| `TWITCH_CLIENT_SECRET` | Twitch application client secret |
| `ALLOW_FAKE_CHAT` | `false` |
| `YOUTUBE_API_KEY` | Optional; omit if unused |

The Docker build argument `NEXT_PUBLIC_REALTIME_URL` intentionally defaults to an empty string. This makes browser API and Socket.IO connections use the same public origin. Do not set it to localhost or to the internal port.

Generate secrets locally with Node.js (run twice and use one output for each secret):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## After the first deploy

1. Copy the public Render URL. Set both `WEB_URL` and `PUBLIC_API_URL` to that exact origin (no trailing slash), then save the environment variables and redeploy if necessary.
2. In the Twitch Developer Console, add this exact OAuth redirect URL: `https://YOUR-SERVICE.onrender.com/auth/twitch/callback`.
3. Apply the Drizzle schema to Neon from a trusted local checkout, using the production Neon connection string as `DATABASE_URL`, then run `pnpm db:push`. Do not paste the connection string into source control or chat.
4. Open `https://YOUR-SERVICE.onrender.com/health`; the expected response is JSON containing `{"ok":true}`.
5. Test Twitch login and the live overlay/Socket.IO connection.

## Free-tier caveats

Render's free service can sleep after inactivity, so the first request after a sleep may take a while. The service has limited memory (512 MB); monitor deploy logs and runtime behavior. If the combined Next.js + Fastify processes exceed the limit, split the services or use a larger instance. Game/session state is in memory, so a restart interrupts active games.
