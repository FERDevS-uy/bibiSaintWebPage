import React, { useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";

function LoginFormInner() {
  const { signIn, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (loading) return <p>Cargando...</p>;

  if (user) {
    window.location.href = "/admin";
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const result = await signIn(email, password);
    if (result.error) setError(result.error);
    else window.location.href = "/admin";
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h1 style={styles.title}>Bibi's Admin</h1>
      <p style={styles.subtitle}>Iniciar sesión</p>

      {error && <p style={styles.error}>{error}</p>}

      <label style={styles.label}>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={styles.input}
        />
      </label>

      <label style={styles.label}>
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={styles.input}
        />
      </label>

      <button type="submit" style={styles.button}>
        Ingresar
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    background: "#fff",
    padding: "2rem",
    borderRadius: 12,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    width: "100%",
    maxWidth: 380,
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 800,
    textAlign: "center",
    color: "#1a1a1a",
  },
  subtitle: {
    textAlign: "center",
    color: "#666",
    fontSize: "0.9rem",
    marginBottom: "0.5rem",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#333",
  },
  input: {
    padding: "0.6rem 0.8rem",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: "1rem",
  },
  button: {
    padding: "0.7rem",
    background: "#d32f2f",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  error: {
    color: "#d32f2f",
    fontSize: "0.85rem",
    textAlign: "center",
    background: "#fdecea",
    padding: "0.5rem",
    borderRadius: 6,
  },
};

export default function LoginForm() {
  return (
    <AuthProvider>
      <LoginFormInner />
    </AuthProvider>
  );
}
