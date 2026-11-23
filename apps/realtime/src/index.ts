import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { Server } from "socket.io";
import { env } from "./env";
import { Hubs } from "./hub";
import { apiRoutes } from "./routes/api";
import { authRoutes } from "./routes/auth";
import { setupSocket } from "./socket";

const app = Fastify({ logger: { level: "info" }, trustProxy: true });

await app.register(cors, {
  origin: env.WEB_URL,
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
});
await app.register(cookie);

const io = new Server(app.server, { cors: { origin: env.WEB_URL, credentials: true } });
const hubs = new Hubs(io);
setupSocket(io, hubs);

await authRoutes(app);
await apiRoutes(app, { kickOverlays: (userId) => io.in(`channel:${userId}:overlay`).disconnectSockets(true) });

await app.listen({ port: env.PORT, host: "0.0.0.0" });
console.log(`\n🎵 BeatDrop realtime → http://localhost:${env.PORT}  (front attendu sur ${env.WEB_URL})\n`);
