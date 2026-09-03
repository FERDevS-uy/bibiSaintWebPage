import React, { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Modal from "./Modal";
import NuvexSyncPanel from "./NuvexSyncPanel";

interface SyncResult {
  provider: string;
  status: "ok" | "error";
  count: number;
  error?: string;
}

interface SyncResponse {
  results: SyncResult[];
  totalUpserted: number;
  totalErrors: number;
}

interface MartinaPlanItem {
  id: string;
  name: string;
  price: string;
  originalPrice: string | null;
  enOferta: boolean;
  action: "create" | "update" | "unchanged";
}

interface MartinaPreviewResponse {
  ok: boolean;
  error?: string;
  campaign?: {
    code: string;
    countryId: string;
    validFrom: string;
    validTill: string;
    vigente: boolean;
  };
  summary?: { create: number; update: number; unchanged: number };
  plan?: MartinaPlanItem[];
  totalItems?: number;
  changedCount?: number;
  truncated?: boolean;
  hash?: string;
  token?: string;
  writeEnabled?: boolean;
  expiresAt?: number;
}

interface MartinaApplyResponse {
  ok: boolean;
  error?: string;
  upserted?: number;
  errors?: number;
  summary?: { create: number; update: number; unchanged: number };
  campaignCode?: string;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const ACTION_LABEL: Record<MartinaPlanItem["action"], string> = {
  create: "Crear",
  update: "Actualizar",
  unchanged: "Sin cambios",
};

export default function ProvidersPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Flujo Martina: preview obligatorio → apply
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<MartinaPreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<MartinaApplyResponse | null>(null);
  const [martinaError, setMartinaError] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessToken();
      const resp = await fetch("/api/admin/providers/sync", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || `Error del servidor (${resp.status})`);
      }
      const data: SyncResponse = await resp.json();
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Error al sincronizar");
    } finally {
      setLoading(false);
    }
  };

  const handleMartinaPreview = async () => {
    setPreviewing(true);
    setMartinaError(null);
    setApplyResult(null);

    try {
      const token = await getAccessToken();
      const resp = await fetch("/api/admin/providers/martina/preview", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const body: MartinaPreviewResponse = await resp.json();
      if (!resp.ok || !body.ok) {
        throw new Error(body?.error || `Error del servidor (${resp.status})`);
      }
      setPreview(body);
    } catch (e: any) {
      setMartinaError(e?.message || "Error al generar el preview");
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  };

  const handleMartinaApply = async () => {
    if (!preview?.token) return;
    setApplying(true);
    setMartinaError(null);
    setApplyResult(null);

    try {
      const token = await getAccessToken();
      const resp = await fetch("/api/admin/providers/martina/apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ token: preview.token }),
      });
      const body: MartinaApplyResponse = await resp.json();
      if (!resp.ok || !body.ok) {
        throw new Error(body?.error || `Error del servidor (${resp.status})`);
      }
      setApplyResult(body);
    } catch (e: any) {
      setMartinaError(e?.message || "Error al aplicar los cambios");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={wrap}>
      <style>{`
        .providers-hero { margin-bottom: 1.25rem; }
        .provider-action-card, .provider-workflow-card {
          background: var(--admin-surface);
          border: 1px solid var(--admin-border, #e5e7eb);
          border-radius: var(--admin-radius-lg, 16px);
          box-shadow: var(--admin-shadow);
        }
        .provider-action-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.25rem;
          padding: 1rem 1.25rem;
          margin-bottom: 1.5rem;
        }
        .provider-action-copy { display: flex; align-items: center; gap: 0.8rem; }
        .provider-action-icon {
          width: 2.35rem; height: 2.35rem; flex: 0 0 auto;
          display: grid; place-items: center;
          color: var(--admin-accent, #c9301f);
          background: var(--admin-accent-subtle, rgba(201,48,31,.08));
          border-radius: 0.7rem;
        }
        .provider-workflow-card { padding: 1.25rem; margin-top: 1.5rem; }
        .provider-workflow-card .provider-workflow-card { margin-top: 0; box-shadow: none; border: 0; padding: 0; }
        @media (max-width: 640px) {
          .provider-action-card { align-items: stretch; flex-direction: column; }
          .provider-action-card .admin-btn { width: 100%; }
        }
      `}</style>
      <div className="providers-hero" style={headerStyle}>
        <div>
          <h1 style={pageTitle}>Proveedores</h1>
          <p style={pageSub}>Sincronizar productos desde proveedores externos</p>
        </div>
      </div>

      <section className="provider-action-card" aria-label="Sincronización general">
        <div className="provider-action-copy">
          <span className="provider-action-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </span>
          <div>
            <strong style={{ display: "block", fontSize: "0.95rem" }}>Sincronización general</strong>
            <span style={{ color: "var(--admin-text-secondary)", fontSize: "0.8rem" }}>Importa productos de Martina, Kai Deco y Alondra en una sola operación.</span>
          </div>
        </div>
        <button onClick={handleSync} disabled={loading} className="admin-btn admin-btn-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", flexShrink: 0 }}>
          {loading ? <span className="admin-spinner" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "adminSpin 0.6s linear infinite" }} /> : null}
          {loading ? "Sincronizando..." : "Sincronizar todos"}
        </button>
      </section>

      {loading && (
        <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--admin-text-secondary)" }}>
          <div className="admin-skeleton" style={{ height: 14, width: "60%", margin: "0 auto 0.5rem" }} />
          <div className="admin-skeleton" style={{ height: 14, width: "40%", margin: "0 auto" }} />
        </div>
      )}

      <Modal open={!!error} onClose={() => setError(null)} type="error" title="Error de sincronización">
        {error}
      </Modal>

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {result.results.map((r) => (
            <div
              key={r.provider}
              style={{
                background: "var(--admin-surface)",
                borderRadius: "var(--admin-radius)",
                padding: "1rem 1.25rem",
                boxShadow: "var(--admin-shadow)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{r.provider}</strong>
                {r.status === "ok" ? (
                  <span style={{ color: "var(--admin-success)", marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                    {r.count} productos sincronizados
                  </span>
                ) : (
                  <span style={{ color: "var(--admin-danger)", marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                    Error: {r.error}
                  </span>
                )}
              </div>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: r.status === "ok" ? "var(--admin-success)" : "var(--admin-danger)",
                  flexShrink: 0,
                }}
              />
            </div>
          ))}
          <div
            style={{
              background: "var(--admin-surface)",
              borderRadius: "var(--admin-radius)",
              padding: "0.75rem 1.25rem",
              boxShadow: "var(--admin-shadow)",
              fontSize: "0.85rem",
              color: "var(--admin-text-secondary)",
            }}
          >
            Total: {result.totalUpserted} productos upserted
            {result.totalErrors > 0 && `, ${result.totalErrors} errores`}
          </div>
        </div>
      )}

      {!loading && !result && !error && (
        <div style={emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--admin-text-secondary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <p style={{ margin: "0.5rem 0 0", color: "var(--admin-text-secondary)", fontSize: "0.9rem" }}>
            Presiona "Sincronizar todos" para importar productos de Martina, Kai Deco y Alondra.
          </p>
        </div>
      )}

      {/* ---- Martina: campaña + preview/apply ---- */}
      <section className="provider-workflow-card"
        style={{
          marginTop: "1.5rem",
        }}
      >
        <div style={headerStyle}>
          <div>
            <h2 style={{ ...pageTitle, fontSize: "1.3rem", margin: 0 }}>Martina di Trento — Campaña</h2>
            <p style={pageSub}>
              Flujo seguro: generar preview (solo lectura) → revisar → aplicar cambios.
            </p>
          </div>
          <button
            onClick={handleMartinaPreview}
            disabled={previewing || applying}
            className="admin-btn admin-btn-secondary"
          >
            {previewing ? "Generando preview..." : "Generar preview"}
          </button>
        </div>

        {preview?.writeEnabled === false && (
          <div
            style={{
              background: "var(--admin-surface)",
              border: "1px solid #e2b93b",
              borderRadius: "var(--admin-radius)",
              padding: "0.75rem 1.25rem",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              color: "#8a6d1a",
            }}
          >
            La escritura está deshabilitada: <code>MARTINA_SYNC_APPLY_ENABLED</code> no es{" "}
            <code>"true"</code>. Podés generar y revisar el preview, pero no aplicar cambios.
          </div>
        )}

        <Modal open={!!martinaError} onClose={() => setMartinaError(null)} type="error" title="Error Martina">
          {martinaError}
        </Modal>

        {preview?.ok && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div
              style={{
                background: "var(--admin-surface)",
                borderRadius: "var(--admin-radius)",
                padding: "1rem 1.25rem",
                boxShadow: "var(--admin-shadow)",
              }}
            >
              <strong>Campaña {preview.campaign?.code}</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--admin-text-secondary)", marginTop: "0.25rem" }}>
                {preview.campaign?.validFrom} → {preview.campaign?.validTill}
                {preview.campaign?.vigente === false && (
                  <span style={{ color: "#8a6d1a", marginLeft: "0.5rem" }}>(no vigente)</span>
                )}
              </div>
              <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                <span style={{ color: "var(--admin-success)" }}>▲ {preview.summary?.create ?? 0} crear</span>
                <span style={{ color: "var(--admin-primary, #e67e22)" }}>● {preview.summary?.update ?? 0} actualizar</span>
                <span style={{ color: "var(--admin-text-secondary)" }}>= {preview.summary?.unchanged ?? 0} sin cambios</span>
              </div>
              {preview.changedCount !== undefined && preview.changedCount > (preview.plan?.length ?? 0) && (
                <div style={{ fontSize: "0.8rem", color: "var(--admin-text-secondary)", marginTop: "0.5rem" }}>
                  Mostrando {preview.plan?.length ?? 0} de {preview.changedCount} cambios.
                </div>
              )}
            </div>

            {preview.plan && preview.plan.length > 0 && (
              <div
                style={{
                  background: "var(--admin-surface)",
                  borderRadius: "var(--admin-radius)",
                  padding: "0.5rem 1.25rem",
                  boxShadow: "var(--admin-shadow)",
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--admin-text-secondary)" }}>
                      <th style={thStyle}>Acción</th>
                      <th style={thStyle}>Producto</th>
                      <th style={thStyle}>Precio</th>
                      <th style={thStyle}>Antes</th>
                      <th style={thStyle}>Oferta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.plan.map((item) => (
                      <tr key={item.id} style={{ borderTop: "1px solid var(--admin-border, #f1f2f4)" }}>
                        <td style={tdStyle}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: item.action === "create" ? "var(--admin-success)" : item.action === "update" ? "var(--admin-primary, #e67e22)" : "var(--admin-text-secondary)",
                            }}
                          >
                            {ACTION_LABEL[item.action]}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {item.name} <span style={{ color: "var(--admin-text-secondary)" }}>({item.id})</span>
                        </td>
                        <td style={tdStyle}>${item.price}</td>
                        <td style={tdStyle}>
                          {item.originalPrice ? <s>${item.originalPrice}</s> : "—"}
                        </td>
                        <td style={tdStyle}>{item.enOferta ? "Sí" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <button
                onClick={handleMartinaApply}
                disabled={!preview.writeEnabled || applying || previewing}
                className="admin-btn admin-btn-primary"
                title={preview.writeEnabled ? "Aplicar los cambios del preview" : "Escritura deshabilitada"}
              >
                {applying ? "Aplicando..." : "Aplicar cambios"}
              </button>

              {applyResult?.ok && (
                <span style={{ color: "var(--admin-success)", fontSize: "0.85rem" }}>
                  ✓ Aplicado: {applyResult.upserted} productos
                  {(applyResult.errors ?? 0) > 0 && `, ${applyResult.errors} errores`}
                  {applyResult.summary && ` (${applyResult.summary.create} crear, ${applyResult.summary.update} actualizar)`}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="provider-workflow-card">
        <NuvexSyncPanel />
      </section>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  fontWeight: 700,
  textTransform: "uppercase",
  fontSize: "0.72rem",
  letterSpacing: "0.02em",
};

const tdStyle: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  verticalAlign: "top",
};

const wrap: React.CSSProperties = {
  animation: "slideUp 0.35s cubic-bezier(0.23, 1, 0.32, 1)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "1rem",
  flexWrap: "wrap",
  gap: "1rem",
};

const pageTitle: React.CSSProperties = {
  fontFamily: "var(--admin-font-serif)",
  fontSize: "1.6rem",
  fontWeight: 400,
  margin: 0,
  color: "var(--admin-text)",
  lineHeight: 1.2,
};

const pageSub: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--admin-text-secondary)",
  margin: "0.15rem 0 0 0",
};

const emptyState: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "4rem 2rem",
  textAlign: "center",
};
