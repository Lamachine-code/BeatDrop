"use client";
import { useEffect } from "react";
import { api, useMe } from "./api";
import { connectLive } from "./live";

/** Connects the page to the real-time server with the host role (requires Twitch login). */
export function useHostSocket() {
  const { data: me, isLoading } = useMe();
  const userId = me?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    api<{ token: string }>("/api/socket-token").then(({ token }) => {
      if (!cancelled) cleanup = connectLive({ role: "host", token });
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [userId]);
  return { me, loadingMe: isLoading };
}
