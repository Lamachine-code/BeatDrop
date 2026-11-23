import { ApiClient } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "./crypto";
import { db, schema } from "./db";
import { env } from "./env";
import type { ChatUser } from "./game/engine";

export interface ChatHandle {
  send(message: string): Promise<void>;
  stop(): void;
}

interface OpenChatOpts {
  userId: string; // id interne
  twitchId: string;
  onMessage(u: ChatUser, text: string): void;
  onStatus(state: "connecting" | "connected" | "error", error?: string): void;
}

/**
 * Reads the channel chat through EventSub WebSocket (channel.chat.message) using the streamer token.
 * Bot messages are sent through the Helix "Send Chat Message" API.
 */
export async function openChat(o: OpenChatOpts): Promise<ChatHandle> {
  o.onStatus("connecting");
  const [c] = await db.select().from(schema.twitchCredentials).where(eq(schema.twitchCredentials.userId, o.userId));
  if (!c) throw new Error('No Twitch token: reconnect via "Log in with Twitch".');
  if (!c.scopes.includes("user:read:chat")) throw new Error("Missing user:read:chat scope: reconnect.");

  const authProvider = new RefreshingAuthProvider({ clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET });
  authProvider.onRefresh(async (_uid, t) => {
    await db
      .update(schema.twitchCredentials)
      .set({
        accessToken: encrypt(t.accessToken),
        refreshToken: encrypt(t.refreshToken ?? ""),
        scopes: t.scope,
        expiresAt: new Date((t.obtainmentTimestamp ?? Date.now()) + (t.expiresIn ?? 3600) * 1000),
      })
      .where(eq(schema.twitchCredentials.userId, o.userId));
  });
  await authProvider.addUser(o.twitchId, {
    accessToken: decrypt(c.accessToken),
    refreshToken: decrypt(c.refreshToken),
    expiresIn: Math.max(0, Math.round((c.expiresAt.getTime() - Date.now()) / 1000)),
    obtainmentTimestamp: Date.now(),
    scope: c.scopes,
  });

  const api = new ApiClient({ authProvider });
  const listener = new EventSubWsListener({ apiClient: api });
  const sentByUs = new Set<string>();

  listener.onChannelChatMessage(o.twitchId, o.twitchId, (e) => {
    const text = e.messageText;
    // Ignore messages posted by our own application (bot responses).
    if (e.chatterId === o.twitchId && sentByUs.delete(text)) return;
    const badges = (e as unknown as { badges?: Record<string, string> }).badges ?? {};
    const isBroadcaster = e.chatterId === o.twitchId || "broadcaster" in badges;
    o.onMessage({ id: e.chatterId, name: e.chatterDisplayName || e.chatterName, isMod: "moderator" in badges, isBroadcaster }, text);
  });
  listener.onSubscriptionCreateSuccess(() => o.onStatus("connected"));
  listener.onSubscriptionCreateFailure((_sub, err) => o.onStatus("error", err.message));
  listener.start();

  return {
    async send(message: string) {
      const text = message.slice(0, 480);
      sentByUs.add(text);
      setTimeout(() => sentByUs.delete(text), 30_000);
      await api.asUser(o.twitchId, (ctx) => ctx.chat.sendChatMessage(o.twitchId, text));
    },
    stop() {
      listener.stop();
    },
  };
}
