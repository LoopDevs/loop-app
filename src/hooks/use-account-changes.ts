import { useEffect } from "react";

import { ctx } from "@/ctx/client";

type Listener = () => void;

const listeners = new Set<Listener>();
let socket: Promise<() => void> | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;
const coalesceMs = 300;

const accountChanges = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (listeners.size === 1) {
      socket = ctx.watchAccount(() => {
        pending ??= setTimeout(() => {
          pending = null;
          listeners.forEach((notify) => notify());
        }, coalesceMs);
      });
      socket.catch(() => undefined);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        socket?.then((close) => close()).catch(() => undefined);
        socket = null;
        if (pending) {
          clearTimeout(pending);
          pending = null;
        }
      }
    };
  },
};

export function useAccountChanges(listener: Listener, active: boolean): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return accountChanges.subscribe(listener);
  }, [listener, active]);
}
