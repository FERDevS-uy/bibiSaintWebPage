import React, { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { AuthProvider, useAuth } from "./AuthContext";
import { ThemeProvider, useTheme } from "./ThemeContext";

function LoginFormInner() {
  const { signIn, user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaExpired, setCaptchaExpired] = useState(false);

  if (loading) {
    return (
      <div style={bgStyle}>
        <div style={skeletonCard}>
          <div style={skeletonLogo} />
          <div style={{ ...skeletonLine, width: "60%", margin: "1.5rem auto" }} />
          <div style={skeletonLine} />
          <div style={{ ...skeletonLine, width: "80%" }} />
        </div>
      </div>
    );
  }

  if (user) {
    window.location.href = "/admin";
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const result = await signIn(email, password, captchaToken ?? undefined);
    if (result.error) setError(result.error);
    else window.location.href = "/admin";
    setCaptchaToken(null);
    setCaptchaExpired(false);
  };

  return (
    <div style={bgStyle}>
      <div style={bgPattern} />
      <form onSubmit={handleSubmit} style={card} aria-label="Iniciar sesión">
        <div style={cardInner}>
          <div style={logoBlock}>
            <span style={logoMark}>B</span>
            <div>
              <h1 style={title}>Bibi's</h1>
              <p style={subtitle}>Panel administrativo</p>
            </div>
          </div>

          <div style={fieldsWrap}>
            {error && (
              <div role="alert" style={errorBox}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <div style={fieldWrap}>
              <label htmlFor="login-email" style={label}>Correo electrónico</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tucorreo@ejemplo.com"
                style={input}
                autoComplete="email"
                autoFocus
              />
            </div>

            <div style={fieldWrap}>
              <label htmlFor="login-password" style={label}>Contraseña</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={input}
                autoComplete="current-password"
              />
            </div>

            {import.meta.env.PUBLIC_TURNSTILE_SITE_KEY && (
              <>
                <Turnstile
                  siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
                  onSuccess={(token) => {
                    setCaptchaToken(token);
                    setCaptchaExpired(false);
                  }}
                  onExpire={() => {
                    setCaptchaToken(null);
                    setCaptchaExpired(true);
                  }}
                  onError={() => {
                    setCaptchaToken(null);
                    setCaptchaExpired(true);
                  }}
                  options={{ theme: theme === "dark" ? "dark" : "light" }}
                />
                {captchaExpired && (
                  <p role="alert" style={warningText}>
                    Verificación expirada. Resolviendo nuevo desafío...
                  </p>
                )}
              </>
            )}

            <button type="submit" disabled={!captchaToken} style={{ ...submitBtn, opacity: captchaToken ? 1 : 0.5, cursor: captchaToken ? "pointer" : "not-allowed" }}>Ingresar</button>
          </div>

          <button type="button" onClick={toggleTheme} style={themeBtn}>
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
        </div>
      </form>
    </div>
  );
}

const bgStyle: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--admin-bg)",
  padding: "1rem",
  position: "relative",
  overflow: "hidden",
};

const bgPattern: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: `
    radial-gradient(ellipse at 20% 50%, var(--admin-accent-subtle) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 50%, var(--admin-accent-subtle) 0%, transparent 60%)
  `,
  opacity: 0.5,
  pointerEvents: "none",
};

const card: React.CSSProperties = {
  position: "relative",
  background: "var(--admin-surface)",
  borderRadius: "var(--admin-radius-lg)",
  boxShadow: "var(--admin-shadow-xl)",
  width: "100%",
  maxWidth: 400,
  animation: "slideUp 0.35s ease",
};

const cardInner: React.CSSProperties = {
  padding: "2.5rem",
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
};

const logoBlock: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.85rem",
};

const logoMark: React.CSSProperties = {
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--admin-accent)",
  color: "#fff",
  borderRadius: 12,
  fontFamily: "var(--admin-font-serif)",
  fontSize: "1.3rem",
  fontWeight: 700,
};

const title: React.CSSProperties = {
  fontFamily: "var(--admin-font-serif)",
  fontSize: "1.5rem",
  fontWeight: 400,
  color: "var(--admin-text)",
  margin: 0,
  lineHeight: 1.2,
};

const subtitle: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--admin-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  margin: "0.1rem 0 0 0",
};

const fieldsWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
};

const fieldWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const label: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--admin-text)",
};

const input: React.CSSProperties = {
  padding: "0.7rem 0.9rem",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  fontSize: "0.95rem",
  background: "var(--admin-bg)",
  color: "var(--admin-text)",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
  fontFamily: "inherit",
};

const submitBtn: React.CSSProperties = {
  padding: "0.75rem",
  background: "var(--admin-accent)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--admin-radius-sm)",
  fontSize: "0.95rem",
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.15s, opacity 0.15s",
  marginTop: "0.25rem",
  fontFamily: "inherit",
  opacity: 1,
};

const errorBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.65rem 0.85rem",
  background: "var(--admin-error-bg)",
  color: "var(--admin-error)",
  fontSize: "0.85rem",
  fontWeight: 500,
  borderRadius: "var(--admin-radius-sm)",
};

const themeBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.4rem",
  background: "none",
  border: "1px solid var(--admin-border)",
  color: "var(--admin-text-secondary)",
  padding: "0.5rem",
  borderRadius: "var(--admin-radius-sm)",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 500,
  transition: "all 0.15s",
  fontFamily: "inherit",
  width: "100%",
};

const skeletonCard: React.CSSProperties = {
  background: "var(--admin-surface)",
  borderRadius: "var(--admin-radius-lg)",
  padding: "2.5rem",
  width: "100%",
  maxWidth: 400,
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const skeletonLogo: React.CSSProperties = {
  width: 44,
  height: 44,
  background: "var(--admin-border)",
  borderRadius: 12,
  margin: "0 auto",
  animation: "pulse 1.5s ease-in-out infinite",
};

const skeletonLine: React.CSSProperties = {
  height: 12,
  background: "var(--admin-border)",
  borderRadius: 6,
  animation: "pulse 1.5s ease-in-out infinite",
};

const warningText: React.CSSProperties = {
  color: "#eab308",
  fontSize: "0.8rem",
  margin: 0,
  textAlign: "center",
};

export default function LoginForm() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LoginFormInner />
      </ThemeProvider>
    </AuthProvider>
  );
}
