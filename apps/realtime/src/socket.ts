import { eq } from "drizzle-orm";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { SettingsSchema } from "@beatdrop/shared";
import { db, schema } from "./db";
import { env } from "./env";
import type { ChannelHub, Hubs } from "./hub";
import { isUuid } from "./playlists";
import { verifyToken } from "./session-token";

type Role = "host" | "overlay";
interface SocketData {
  role: Role;
  userId: string;
}

const CreatePayload = z.object({ playlistId: z.string(), settings: SettingsSchema.partial().optional() });
const FakeChatPayload = z.object({ name: z.string().min(1).max(25), text: z.string().min(1).max(300) });

export function setupSocket(io: Server, hubs: Hubs) {
  io.use(async (socket, next) => {
    const a = socket.handshake.auth as { role?: string; token?: string; overlayToken?: string };
    try {
      if (a.role === "host" && a.token) {
        const userId = await verifyToken(a.token, "socket");
        if (!userId) return next(new Error("unauthorized"));
        socket.data = { role: "host", userId } satisfies SocketData;
        return next();
      }
      if (a.role === "overlay" && a.overlayToken) {
        const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.overlayToken, a.overlayToken));
        if (!u) return next(new Error("invalid_overlay_token"));
        socket.data = { role: "overlay", userId: u.id } satisfies SocketData;
        return next();
      }
      next(new Error("unauthorized"));
    } catch {
      next(new Error("server_error"));
    }
  });

  io.on("connection", (socket) => {
    // Registered synchronously: the client pings immediately after connecting.
    socket.on("time:ping", (cb: unknown) => typeof cb === "function" && cb(Date.now()));

    const { role, userId } = socket.data as SocketData;
    const hubP = hubs.get(userId);

    hubP.then((hub) => {
      if (!hub) return socket.disconnect(true);
      socket.join(hub.room(role));
      if (role === "host") setupHost(socket, hub, hubP);
      else setupOverlay(socket, hub);
    });
  });
}

function setupOverlay(socket: Socket, hub: ChannelHub) {
  hub.overlaySockets.add(socket.id);
  socket.emit("state:sync", hub.session?.snapshot("overlay") ?? null);
  hub.emitPresence();
  socket.on("overlay:error", (p: { videoId?: string }) => {
    if (typeof p?.videoId === "string") void hub.onOverlayError(p.videoId);
  });
  socket.on("disconnect", () => {
    hub.overlaySockets.delete(socket.id);
    hub.emitPresence();
  });
}

function setupHost(socket: Socket, hub: ChannelHub, _hubP: Promise<ChannelHub | null>) {
  hub.hostSockets.add(socket.id);
  socket.emit("state:sync", hub.session?.snapshot("host") ?? null);
  socket.emit("presence", hub.presence());
  void hub.ensureChat();

  let count = 0;
  const reset = setInterval(() => (count = 0), 1000);

  const on = (event: string, fn: (payload: unknown) => void | Promise<void>) =>
    socket.on(event, async (payload: unknown) => {
      if (++count > 20) return; // rate limit des commandes
      try {
        await fn(payload);
      } catch (e) {
        hub.toast("error", e instanceof z.ZodError ? "Commande invalide" : (e as Error).message);
      }
    });

  on("host:session.create", async (p) => {
    const { playlistId, settings } = CreatePayload.parse(p);
    if (!isUuid(playlistId)) throw new Error("Invalid music quiz identifier");
    await hub.createSession(playlistId, settings);
  });
  on("host:next", () => { if (hub.session) hub.session.next(); });
  on("host:stop", () => { if (hub.session) hub.session.stop(); });
  on("host:close", () => hub.closeSession());
  on("host:hint", () => { if (hub.session) hub.session.showHint(); });
  on("host:extend", () => { if (hub.session) hub.session.extend(); });
  on("host:pause", () => { if (hub.session) hub.session.pause(); });
  on("host:settings.update", async (p) => {
    const patch = SettingsSchema.partial().parse(p);
    if (patch.streamDelayMs !== undefined) await hub.saveStreamDelay(patch.streamDelayMs);
    if (hub.session) hub.session.updateSettings(patch);
  });
  on("host:fakechat", (p) => {
    if (!env.ALLOW_FAKE_CHAT) throw new Error("Fake chat is disabled (ALLOW_FAKE_CHAT=false)");
    const { name, text } = FakeChatPayload.parse(p);
    hub.onChat({ id: `fake:${name.toLowerCase()}`, name, isMod: false, isBroadcaster: name.toLowerCase() === hub.user.login }, text);
  });
  on("host:calibrate.start", () => hub.startCalibration());

  socket.on("disconnect", () => {
    clearInterval(reset);
    hub.hostSockets.delete(socket.id);
    hub.scheduleIdleStop();
  });
}
