import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { db, schema } from "../db";
import { encrypt } from "../crypto";
import { env } from "../env";
import { signToken, verifyToken } from "../session-token";

const { users, twitchCredentials } = schema;
export const SESSION_COOKIE = "beatdrop_session";
export const TWITCH_SCOPES = ["user:read:chat", "user:write:chat"];

export async function currentUser(req: FastifyRequest) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const id = await verifyToken(token, "session");
  if (!id) return null;
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ?? null;
}
export type User = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

const redirectUri = `${env.PUBLIC_API_URL}/auth/twitch/callback`;
const cookieBase = { httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV === "production", path: "/" };

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/twitch", async (_req, reply) => {
    const state = randomBytes(16).toString("hex");
    reply.setCookie("oauth_state", state, { ...cookieBase, maxAge: 600 });
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.searchParams.set("client_id", env.TWITCH_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", TWITCH_SCOPES.join(" "));
    url.searchParams.set("state", state);
    return reply.redirect(url.toString());
  });

  app.get("/auth/twitch/callback", async (req, reply) => {
    const { code, state, error_description } = req.query as Record<string, string | undefined>;
    const expected = req.cookies.oauth_state;
    reply.clearCookie("oauth_state", { path: "/" });
    if (error_description) return reply.redirect(`${env.WEB_URL}/setup?error=${encodeURIComponent(error_description)}`);
    if (!code || !state || state !== expected) return reply.code(400).send("Invalid OAuth state. Please try logging in again.");

    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      app.log.error({ status: tokenRes.status, body: await tokenRes.text() }, "Twitch code exchange failed");
      return reply.code(502).send("Twitch code exchange failed (check TWITCH_CLIENT_SECRET and redirect_uri).");
    }
    const tok = (await tokenRes.json()) as { access_token: string; refresh_token: string; expires_in: number; scope: string[] };

    const meRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: { Authorization: `Bearer ${tok.access_token}`, "Client-Id": env.TWITCH_CLIENT_ID },
    });
    if (!meRes.ok) return reply.code(502).send("Impossible de lire le profil Twitch.");
    const me = ((await meRes.json()) as { data: { id: string; login: string; display_name: string; profile_image_url: string }[] }).data[0];

    const [user] = await db
      .insert(users)
      .values({
        twitchId: me.id,
        login: me.login,
        displayName: me.display_name,
        avatarUrl: me.profile_image_url,
        overlayToken: randomBytes(24).toString("base64url"),
      })
      .onConflictDoUpdate({
        target: users.twitchId,
        set: { login: me.login, displayName: me.display_name, avatarUrl: me.profile_image_url },
      })
      .returning();

    const creds = {
      accessToken: encrypt(tok.access_token),
      refreshToken: encrypt(tok.refresh_token),
      scopes: tok.scope ?? TWITCH_SCOPES,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
    };
    await db.insert(twitchCredentials).values({ userId: user.id, ...creds }).onConflictDoUpdate({ target: twitchCredentials.userId, set: creds });

    const session = await signToken(user.id, "session", "30d");
    reply.setCookie(SESSION_COOKIE, session, { ...cookieBase, maxAge: 30 * 86400 });
    return reply.redirect(`${env.WEB_URL}/setup`);
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
