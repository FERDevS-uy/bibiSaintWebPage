import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);

function getInitialTheme(): Theme {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("admin-theme") as Theme | null;
    if (stored === "dark" || stored === "light") return stored;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    localStorage.setItem("admin-theme", theme);
    document.documentElement.setAttribute("data-admin-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <GlobalStyles />
      {children}
    </ThemeContext.Provider>
  );
}

function GlobalStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700;800&display=swap');

:root {
  --admin-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --admin-font-serif: 'DM Serif Display', Georgia, 'Times New Roman', serif;

  --admin-bg: #f6f4f0;
  --admin-surface: #ffffff;
  --admin-text: #1a1614;
  --admin-text-secondary: #8a8682;
  --admin-border: #e2ddd8;
  --admin-border-light: #f0ede9;

  --admin-accent: #b83a2a;
  --admin-accent-hover: #9a2e20;
  --admin-accent-subtle: #fdf0ed;

  --admin-sidebar-bg: #1a1513;
  --admin-sidebar-text: #b5afaa;
  --admin-sidebar-hover: rgba(255,255,255,0.07);
  --admin-sidebar-active: #b83a2a;

  --admin-shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --admin-shadow: 0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --admin-shadow-lg: 0 4px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
  --admin-shadow-xl: 0 8px 40px rgba(0,0,0,0.1);

  --admin-radius-sm: 6px;
  --admin-radius: 10px;
  --admin-radius-lg: 14px;

  --admin-success: #2d7d46;
  --admin-success-bg: #edf7f0;
  --admin-error: #b83a2a;
  --admin-error-bg: #fdf0ed;
  --admin-info: #3a6a8a;
  --admin-info-bg: #edf3f7;
  --admin-warning-bg: #fcf6ed;
  --admin-warning-text: #8a6a3a;

  --admin-chip-bg: #edf1f5;
  --admin-chip-text: #3a5a7a;

  --admin-offer-bg: #fcf6ed;
  --admin-offer-text: #8a6a3a;
}

[data-admin-theme="dark"] {
  --admin-bg: #0e0c0b;
  --admin-surface: #1a1615;
  --admin-text: #e8e4e0;
  --admin-text-secondary: #8a8682;
  --admin-border: #2a2624;
  --admin-border-light: #1e1c1a;

  --admin-accent: #e8604a;
  --admin-accent-hover: #f07862;
  --admin-accent-subtle: #2e1a16;

  --admin-sidebar-bg: #080606;
  --admin-sidebar-text: #8a8682;
  --admin-sidebar-hover: rgba(255,255,255,0.06);
  --admin-sidebar-active: #e8604a;

  --admin-shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --admin-shadow: 0 1px 4px rgba(0,0,0,0.3);
  --admin-shadow-lg: 0 4px 24px rgba(0,0,0,0.4);
  --admin-shadow-xl: 0 8px 40px rgba(0,0,0,0.5);

  --admin-success: #4caf7a;
  --admin-success-bg: #1a2e22;
  --admin-error: #e8604a;
  --admin-error-bg: #2e1a16;
  --admin-info: #6a9aba;
  --admin-info-bg: #16222e;
  --admin-warning-bg: #2e2616;
  --admin-warning-text: #daaa6a;

  --admin-chip-bg: #1e2226;
  --admin-chip-text: #7aaada;

  --admin-offer-bg: #2e2616;
  --admin-offer-text: #daaa6a;
}

html {
  transition: background 0.3s ease, color 0.3s ease;
}

body {
  margin: 0;
  background: var(--admin-bg);
  color: var(--admin-text);
  font-family: var(--admin-font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after {
  box-sizing: border-box;
}

:focus-visible {
  outline: 2px solid var(--admin-accent);
  outline-offset: 2px;
}

::selection {
  background: var(--admin-accent);
  color: #fff;
}

/* ── Keyframes ── */

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-24px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes bounceIn {
  0% { opacity: 0; transform: scale(0.3); }
  50% { opacity: 1; transform: scale(1.05); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

@keyframes ripple {
  to { transform: scale(4); opacity: 0; }
}

/* ── Skeleton shimmer ── */

.admin-skeleton {
  background: linear-gradient(
    90deg,
    var(--admin-border-light) 25%,
    var(--admin-border) 50%,
    var(--admin-border-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.8s ease-in-out infinite;
  border-radius: 6px;
}

/* ── Responsive hamburger ── */

.admin-hamburger {
  display: none;
}

/* ── Admin layout responsive ── */

.admin-layout {
  display: flex;
  min-height: 100dvh;
}

.admin-sidebar {
  width: 260px;
  min-width: 260px;
  background: var(--admin-sidebar-bg);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 50;
}

.admin-sidebar-inner {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100dvh;
  position: sticky;
  top: 0;
  padding: 1.5rem 0;
}

.admin-main {
  flex: 1;
  min-height: 100dvh;
  overflow-y: auto;
  animation: fadeIn 0.35s ease;
}

.admin-main-inner {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

/* ── Sidebar nav links ── */

.admin-nav-link {
  text-decoration: none;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  background: transparent;
  cursor: pointer;
  width: 100%;
  text-align: left;
  color: var(--admin-sidebar-text);
  position: relative;
  overflow: hidden;
}

.admin-nav-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 3px;
  height: 60%;
  background: var(--admin-accent);
  border-radius: 0 3px 3px 0;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.admin-nav-link:hover {
  background: var(--admin-sidebar-hover);
  color: #fff;
}

.admin-nav-link:active {
  transform: scale(0.98);
}

.admin-nav-link.active {
  background: var(--admin-sidebar-hover);
  color: #fff;
  font-weight: 600;
}

.admin-nav-link.active::before {
  transform: translateY(-50%) scaleY(1);
}

/* ── Sidebar buttons ── */

.admin-sidebar-btn {
  text-decoration: none;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  background: transparent;
  cursor: pointer;
  width: 100%;
  text-align: left;
  color: var(--admin-sidebar-text);
}

.admin-sidebar-btn:hover {
  background: var(--admin-sidebar-hover);
  color: #fff;
}

.admin-sidebar-btn:active {
  transform: scale(0.98);
}

/* ── Buttons ── */

.admin-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: var(--admin-radius-sm);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: inherit;
  position: relative;
  overflow: hidden;
}

.admin-btn:active {
  transform: scale(0.96);
}

.admin-btn-primary {
  background: var(--admin-accent);
  color: #fff;
}

.admin-btn-primary:hover {
  background: var(--admin-accent-hover);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.admin-btn-secondary {
  background: var(--admin-info-bg);
  color: var(--admin-info);
}

.admin-btn-secondary:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.admin-btn-ghost {
  background: transparent;
  color: var(--admin-text-secondary);
  border: 1px solid var(--admin-border);
}

.admin-btn-ghost:hover {
  background: var(--admin-border-light);
  border-color: var(--admin-border);
}

.admin-btn-danger {
  background: var(--admin-error-bg);
  color: var(--admin-error);
}

.admin-btn-danger:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

/* ── Cards ── */

.admin-card {
  background: var(--admin-surface);
  border-radius: var(--admin-radius);
  padding: 1.5rem;
  box-shadow: var(--admin-shadow);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.admin-card-hover:hover {
  box-shadow: var(--admin-shadow-lg);
  transform: translateY(-2px);
}

/* ── Inputs ── */

.admin-input {
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-sm);
  font-size: 0.95rem;
  width: 100%;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background: var(--admin-bg);
  color: var(--admin-text);
  font-family: inherit;
}

.admin-input:focus {
  border-color: var(--admin-accent);
  box-shadow: 0 0 0 3px var(--admin-accent-subtle);
}

.admin-input::placeholder {
  color: var(--admin-text-secondary);
  opacity: 0.6;
}

/* ── Notification ── */

.admin-notif {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 1rem;
  border-radius: var(--admin-radius-sm);
  font-size: 0.85rem;
  font-weight: 600;
  animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.admin-notif-ok {
  background: var(--admin-success-bg);
  color: var(--admin-success);
}

.admin-notif-error {
  background: var(--admin-error-bg);
  color: var(--admin-error);
}

/* ── Chips ── */

.admin-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.5rem;
  background: var(--admin-chip-bg);
  border-radius: var(--admin-radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--admin-chip-text);
  animation: scaleIn 0.2s ease;
}

/* ── Overlay ── */

.admin-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 48;
  animation: fadeIn 0.2s ease;
}

/* ── FAB (mobile) ── */

.admin-fab {
  display: none;
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--admin-accent);
  color: #fff;
  border: none;
  cursor: pointer;
  z-index: 40;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  animation: float 3s ease-in-out infinite;
  align-items: center;
  justify-content: center;
}

.admin-fab:active {
  transform: scale(0.9);
}

/* ── Responsive ── */

@media (max-width: 768px) {
  .admin-hamburger {
    display: flex;
  }

  .admin-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;
    z-index: 100;
  }

  .admin-sidebar.open {
    transform: translateX(0);
    box-shadow: 8px 0 40px rgba(0,0,0,0.3);
  }

  .admin-main-inner {
    padding: 1rem;
    padding-top: 4.5rem;
  }

  .admin-fab {
    display: flex;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .admin-sidebar {
    width: 220px;
    min-width: 220px;
  }
}

@media (min-width: 769px) {
  .admin-sidebar {
    position: sticky;
    top: 0;
  }
}
    `}</style>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de ThemeProvider");
  return ctx;
}
