import { useState, useEffect, useCallback } from "react";

export interface AdminToast {
  type: "ok" | "error";
  text: string;
}

export function setPendingToast(toast: AdminToast) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem("admin-toast", JSON.stringify({ ...toast, timestamp: Date.now() }));
}

export function getPendingToast(): AdminToast | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem("admin-toast");
    if (!raw) return null;
    sessionStorage.removeItem("admin-toast");
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > 10000) return null;
    return { type: parsed.type, text: parsed.text };
  } catch {
    return null;
  }
}

export function usePendingToast() {
  const [toast, setToast] = useState<AdminToast | null>(null);

  useEffect(() => {
    const t = getPendingToast();
    if (t) setToast(t);
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, dismiss };
}
