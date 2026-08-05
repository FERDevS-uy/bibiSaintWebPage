import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string, captchaToken?: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    });
    if (error) return { error: mapSupabaseAuthError(error.message, email) };
    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(() => ({ user, session, loading, signIn, signOut }), [user, session, loading, signIn, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

function mapSupabaseAuthError(raw: string, email: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid email or password") || m.includes("password does not match"))
    return "El correo o la contraseña no son correctos.";
  if (m.includes("email not confirmed"))
    return `El correo ${email} todavía no fue confirmado. Revisá tu bandeja de entrada.`;
  if (m.includes("too many requests") || m.includes("rate limit") || m.includes("security purposes"))
    return "Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.";
  if (m.includes("captcha") || m.includes("robot"))
    return "No pudimos verificar que seas humano. Recargá la página y resolvé el captcha.";
  if (m.includes("network") || m.includes("fetch") || m.includes("timeout"))
    return "No se pudo conectar. Revisá tu internet e intentá de nuevo.";
  if (m.includes("not verified") || m.includes("not allowed"))
    return "Este usuario no tiene permiso para ingresar al panel.";
  return "No se pudo iniciar sesión. Intentá de nuevo.";
}
