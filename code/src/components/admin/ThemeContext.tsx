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

  --admin-bg: #f8fafc;
  --admin-surface: #ffffff;
  --admin-text: #0f172a;
  --admin-text-secondary: #64748b;
  --admin-border: #e2e8f0;
  --admin-border-light: #f1f5f9;

  --admin-accent: #4f46e5;
  --admin-accent-hover: #4338ca;
  --admin-accent-subtle: rgba(79, 70, 229, 0.08);

  --admin-sidebar-bg: #0f172a;
  --admin-sidebar-text: #94a3b8;
  --admin-sidebar-hover: rgba(255, 255, 255, 0.06);
  --admin-sidebar-active: #6366f1;

  --admin-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --admin-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --admin-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
  --admin-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);

  --admin-radius-sm: 8px;
  --admin-radius: 12px;
  --admin-radius-lg: 16px;

  --admin-success: #10b981;
  --admin-success-bg: #ecfdf5;
  --admin-error: #ef4444;
  --admin-error-bg: #fef2f2;
  --admin-info: #0ea5e9;
  --admin-info-bg: #f0f9ff;
  --admin-warning-bg: #fffbeb;
  --admin-warning-text: #b45309;

  --admin-chip-bg: #f1f5f9;
  --admin-chip-text: #475569;

  --admin-offer-bg: #fef3c7;
  --admin-offer-text: #d97706;
}

[data-admin-theme="dark"] {
  --admin-bg: #09090b;
  --admin-surface: #18181b;
  --admin-text: #fafafa;
  --admin-text-secondary: #a1a1aa;
  --admin-border: #27272a;
  --admin-border-light: #202023;

  --admin-accent: #818cf8;
  --admin-accent-hover: #93c5fd;
  --admin-accent-subtle: rgba(129, 140, 248, 0.12);

  --admin-sidebar-bg: #09090b;
  --admin-sidebar-text: #71717a;
  --admin-sidebar-hover: rgba(255, 255, 255, 0.04);
  --admin-sidebar-active: #818cf8;

  --admin-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --admin-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5);
  --admin-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -4px rgba(0, 0, 0, 0.6);
  --admin-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7);

  --admin-success: #34d399;
  --admin-success-bg: #064e3b;
  --admin-error: #f87171;
  --admin-error-bg: #451a03;
  --admin-info: #38bdf8;
  --admin-info-bg: #0c4a6e;
  --admin-warning-bg: #78350f;
  --admin-warning-text: #fbbf24;

  --admin-chip-bg: #27272a;
  --admin-chip-text: #e4e4e7;

  --admin-offer-bg: #78350f;
  --admin-offer-text: #fbbf24;
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

/* ── Custom Scrollbar ── */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--admin-border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--admin-text-secondary);
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
  from { opacity: 0; transform: scale(0.97); }
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
  0% { opacity: 0; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1.02); }
  70% { transform: scale(0.99); }
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
  border-radius: 8px;
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
  border-right: 1px solid var(--admin-border);
}

[data-admin-theme="dark"] .admin-sidebar {
  border-right: 1px solid var(--admin-border);
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
  padding: 2.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

/* ── Sidebar nav links ── */

.admin-nav-link {
  text-decoration: none;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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
  width: 3.5px;
  height: 50%;
  background: var(--admin-sidebar-active);
  border-radius: 0 4px 4px 0;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.admin-nav-link:hover {
  background: var(--admin-sidebar-hover);
  color: #fff;
  padding-left: 1.15rem;
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
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.825rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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
  padding-left: 1.15rem;
}

.admin-sidebar-btn:active {
  transform: scale(0.98);
}

/* ── Buttons ── */

.admin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.625rem 1.25rem;
  border: 1px solid transparent;
  border-radius: var(--admin-radius-sm);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: inherit;
  position: relative;
  overflow: hidden;
}

.admin-btn:hover {
  transform: translateY(-1.5px);
}

.admin-btn:active {
  transform: translateY(0) scale(0.97);
}

.admin-btn-primary {
  background: var(--admin-accent);
  color: #fff;
  box-shadow: 0 4px 10px rgba(79, 70, 229, 0.2);
}

.admin-btn-primary:hover {
  background: var(--admin-accent-hover);
  box-shadow: 0 6px 14px rgba(79, 70, 229, 0.3);
}

.admin-btn-secondary {
  background: var(--admin-info-bg);
  color: var(--admin-info);
}

.admin-btn-secondary:hover {
  background: var(--admin-accent-subtle);
  box-shadow: 0 4px 10px rgba(14, 165, 233, 0.1);
}

.admin-btn-ghost {
  background: transparent;
  color: var(--admin-text-secondary);
  border: 1px solid var(--admin-border);
}

.admin-btn-ghost:hover {
  background: var(--admin-border-light);
  color: var(--admin-text);
  border-color: var(--admin-text-secondary);
}

.admin-btn-danger {
  background: var(--admin-error-bg);
  color: var(--admin-error);
  box-shadow: 0 4px 10px rgba(239, 68, 68, 0.08);
}

.admin-btn-danger:hover {
  background: #fca5a5;
  color: #7f1d1d;
  box-shadow: 0 6px 14px rgba(239, 68, 68, 0.15);
}

[data-admin-theme="dark"] .admin-btn-danger:hover {
  background: #f87171;
  color: #1f0202;
}

/* ── Cards ── */

.admin-card {
  background: var(--admin-surface);
  border-radius: var(--admin-radius);
  padding: 1.5rem;
  border: 1px solid var(--admin-border);
  box-shadow: var(--admin-shadow-sm);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.admin-card-hover {
  cursor: pointer;
}

.admin-card-hover:hover {
  box-shadow: var(--admin-shadow-lg);
  transform: translateY(-4px);
  border-color: var(--admin-accent);
}

/* ── Inputs ── */

.admin-input {
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-sm);
  font-size: 0.925rem;
  width: 100%;
  outline: none;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--admin-surface);
  color: var(--admin-text);
  font-family: inherit;
}

.admin-input:focus {
  border-color: var(--admin-accent);
  box-shadow: 0 0 0 4px var(--admin-accent-subtle);
  background: var(--admin-surface);
}

.admin-input::placeholder {
  color: var(--admin-text-secondary);
  opacity: 0.5;
}

select.admin-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.85rem center;
  background-size: 1rem;
  padding-right: 2.25rem;
}

/* ── Chips ── */

.admin-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  background: var(--admin-chip-bg);
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--admin-chip-text);
  animation: scaleIn 0.2s ease;
}

/* ── Overlay ── */

.admin-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
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
  box-shadow: 0 8px 24px rgba(79, 70, 229, 0.3);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  animation: float 3s ease-in-out infinite;
  align-items: center;
  justify-content: center;
}

.admin-fab:hover {
  background: var(--admin-accent-hover);
  transform: translateY(-2px) scale(1.05);
}

.admin-fab:active {
  transform: scale(0.95);
}

/* ── Modal ── */

.admin-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  animation: fadeIn 0.25s ease;
}

.admin-modal {
  background: var(--admin-surface);
  border-radius: var(--admin-radius-lg);
  padding: 2.25rem;
  max-width: 440px;
  width: 100%;
  border: 1px solid var(--admin-border);
  box-shadow: var(--admin-shadow-xl);
  animation: bounceIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  text-align: center;
  position: relative;
}

.admin-modal-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
  transform: scale(1.1);
}

.admin-modal-ok .admin-modal-icon {
  color: var(--admin-success);
}

.admin-modal-error .admin-modal-icon {
  color: var(--admin-error);
}

.admin-modal-title {
  font-family: var(--admin-font-serif);
  font-size: 1.4rem;
  font-weight: 400;
  margin: 0 0 0.65rem;
  color: var(--admin-text);
}

.admin-modal-body {
  font-size: 0.95rem;
  color: var(--admin-text-secondary);
  line-height: 1.6;
  margin-bottom: 1.75rem;
}

.admin-modal-btn {
  min-width: 140px;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  font-size: 0.925rem;
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
    box-shadow: 8px 0 40px rgba(15, 23, 42, 0.35);
  }

  .admin-main-inner {
    padding: 1.25rem;
    padding-top: 5rem;
  }

  .admin-fab {
    display: flex;
  }

  .admin-nav-link {
    font-size: 1rem;
    padding: 0.85rem 1rem;
  }

  .admin-sidebar-btn {
    font-size: 0.95rem;
    padding: 0.85rem 1rem;
  }

  .admin-btn {
    padding: 0.75rem 1.25rem;
    font-size: 0.925rem;
    min-height: 44px;
  }

  .admin-input {
    font-size: 1rem;
    padding: 0.75rem 1rem;
  }

  .admin-card {
    padding: 1.25rem;
  }

  .admin-modal {
    padding: 1.75rem;
    max-width: 350px;
  }

  .admin-page-header {
    flex-direction: column;
    gap: 1rem;
  }

  .admin-header-right {
    width: 100%;
  }

  .admin-header-right .admin-btn {
    flex: 1;
  }

  .admin-search-wrap {
    max-width: 100% !important;
    flex: 1;
  }

  .admin-filter-bar {
    flex-direction: column;
    gap: 0.75rem;
  }

  .admin-filter-group {
    width: 100%;
    min-width: 0 !important;
  }

  .admin-filter-group select {
    width: 100%;
  }

  .admin-pagination {
    gap: 0.35rem;
  }

  .admin-pagination button {
    min-width: 44px;
    min-height: 44px;
    font-size: 0.95rem;
  }

  .admin-gallery-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .admin-color-sizes {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .admin-color-sizes label {
    min-height: 40px;
    min-width: 40px;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .admin-sidebar {
    width: 230px;
    min-width: 230px;
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
