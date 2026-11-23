import { config } from "dotenv";
import { z } from "zod";

// .env at the monorepo root (or locally in the app)
config({ path: ["../../.env", ".env"] });

const bool = (def: "true" | "false") =>
  z.enum(["true", "false"]).default(def).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must contain at least 16 characters"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must contain 64 hexadecimal characters"),
  TWITCH_CLIENT_ID: z.string().min(1, "TWITCH_CLIENT_ID manquant"),
  TWITCH_CLIENT_SECRET: z.string().min(1, "TWITCH_CLIENT_SECRET manquant"),
  YOUTUBE_API_KEY: z.string().optional().transform((v) => v || undefined),
  ALLOW_FAKE_CHAT: bool("true"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("\n❌ Configuration invalide (.env) :");
  for (const i of parsed.error.issues) console.error(`   - ${i.path.join(".")}: ${i.message}`);
  console.error("\n→ Copy .env.example to .env at the project root and fill it in (see README).\n");
  process.exit(1);
}
export const env = parsed.data;
