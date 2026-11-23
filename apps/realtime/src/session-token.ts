import { jwtVerify, SignJWT } from "jose";
import { env } from "./env";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export type Audience = "session" | "socket";

export const signToken = (userId: string, aud: Audience, ttl: string) =>
  new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setAudience(aud).setIssuedAt().setExpirationTime(ttl).sign(secret);

export async function verifyToken(token: string, aud: Audience): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: aud });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
