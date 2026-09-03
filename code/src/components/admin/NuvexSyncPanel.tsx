import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Modal from "./Modal";

// ----- Tipos (alineados con nuvexSync.ts) -----

type NuvexAction = "create" | "update" | "unchanged" | "absent";

interface NuvexPlanItem {
  id: string;
  externalId: string;
  name: string;
  price: string;
  originalPrice: string | null;
  enOferta: boolean;
  action: NuvexAction;
  priceReason: string;
  matchedBy: "id" | "name" | null;
  inferredMatchId?: string;
  imageChanged: boolean;
  descriptionChanged: boolean;
  categoryChanged: boolean;
  newImages: string[];
  oldImages: string[];
}

interface NuvexPreviewResponse {
  ok: boolean;
  error?: string;
  summary?: { create: number; update: number; unchanged: number; absent: number; warnings: number };
  plan?: NuvexPlanItem[];
  hash?: string;
  token?: string;
  writeEnabled?: boolean;
  expiresAt?: number;
  totalIncoming?: number;
}

interface ApplyDecisionSet {
  confirmedUpdates: string[];
  confirmedNameMatches: Record<string, string>;
  temporaryPrices: Record<string, string>;
  deactivateIds: string[];
}

interface NuvexApplyResponse {
  ok: boolean;
  error?: string;
  upserted?: number;
  deactivated?: number;
  errors?: number;
}

const ACTION_LABEL: Record<NuvexAction, string> = {
  create: "Crear",
  update: "Actualizar",
  unchanged: "Sin cambios",
  absent: "Ausente",
};

const REASON_LABEL: Record<string, string> = {
  nuevo: "Producto nuevo",
  aumento_proveedor: "Aumento de proveedor",
  inicio_oferta: "Inicio de oferta",
  fin_oferta: "Fin de oferta",
  cambio_oferta: "Cambio de precio de oferta",
  precio_faltante: "Precio no disponible",
  manual_temporal: "Precio manual temporal",
  unchanged: "Sin cambios",
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const th: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  fontWeight: 700,
  textTransform: "uppercase",
  fontSize: "0.72rem",
  letterSpacing: "0.02em",
  color: "var(--admin-text-secondary)",
  textAlign: "left",
};

const td: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  verticalAlign: "top",
};

export default function NuvexSyncPanel() {
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<NuvexPreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<NuvexApplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Decisiones del usuario sobre el plan
  const [temporaryPrices, setTemporaryPrices] = useState<Record<string, string>>({});
  const [deactivateIds, setDeactivateIds] = useState<Set<string>>(new Set());
  const [nameMatches, setNameMatches] = useState<Record<string, string>>({});
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [catalogEnabled, setCatalogEnabled] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogUpdating, setCatalogUpdating] = useState(false);
  const [catalogConfirmOpen, setCatalogConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const resp = await fetch("/api/admin/providers/catalog-settings", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const body = await resp.json();
        if (!cancelled && resp.ok && body.ok) setCatalogEnabled(body.nuvexEnabled !== false);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateCatalog = async (next: boolean) => {
    setCatalogUpdating(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const resp = await fetch("/api/admin/providers/catalog-settings", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await resp.json();
      if (!resp.ok || !body.ok) throw new Error(body?.error || `Error del servidor (${resp.status})`);
      setCatalogEnabled(next);
      setPreview(null);
    } catch (e: any) {
      setError(e?.message || "No se pudo cambiar el estado del catálogo");
    } finally {
      setCatalogUpdating(false);
    }
  };

  const requestCatalogToggle = () => {
    if (catalogEnabled) {
      setCatalogConfirmOpen(true);
      return;
    }
    void updateCatalog(true);
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);
    setApplyResult(null);
    setTemporaryPrices({});
    setDeactivateIds(new Set());
    setNameMatches({});
    try {
      const token = await getAccessToken();
      const resp = await fetch("/api/admin/providers/nuvex/preview", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body: NuvexPreviewResponse = await resp.json();
      if (!resp.ok || !body.ok) {
        throw new Error(body?.error || `Error del servidor (${resp.status})`);
      }
      setPreview(body);
    } catch (e: any) {
      setError(e?.message || "Error al generar el preview");
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!preview?.token) return;
    setApplying(true);
    setError(null);
    setApplyResult(null);
    try {
      const decisionSet: ApplyDecisionSet = {
        confirmedUpdates: (preview.plan ?? [])
          .filter((p) => p.action === "update" && p.matchedBy === "id")
          .map((p) => p.id),
        confirmedNameMatches: nameMatches,
        temporaryPrices,
        deactivateIds: Array.from(deactivateIds),
      };
      const token = await getAccessToken();
      const resp = await fetch("/api/admin/providers/nuvex/apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ token: preview.token, decisionSet }),
      });
      const body: NuvexApplyResponse = await resp.json();
      if (!resp.ok || !body.ok) {
        throw new Error(body?.error || `Error del servidor (${resp.status})`);
      }
      setApplyResult(body);
      setPreview(null); // limpiar preview tras aplicar
    } catch (e: any) {
      setError(e?.message || "Error al aplicar los cambios");
    } finally {
      setApplying(false);
    }
  };

  const warnings = (preview?.plan ?? []).filter((p) => p.priceReason === "precio_faltante");
  const absentItems = (preview?.plan ?? []).filter((p) => p.action === "absent");
  const nameMatchItems = (preview?.plan ?? []).filter((p) => p.matchedBy === "name");

  const toggleDeactivate = (id: string) => {
    setDeactivateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ marginTop: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontFamily: "var(--admin-font-serif)", fontSize: "1.3rem", margin: 0, color: "var(--admin-text)" }}>
            Nuvex — Sync
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--admin-text-secondary)", margin: "0.15rem 0 0 0" }}>
            Preview (solo lectura) → revisar → aplicar. El login se hace server-side.
          </p>
        </div>
        <button onClick={handlePreview} disabled={previewing || applying} className="admin-btn admin-btn-secondary">
          {previewing ? "Generando preview..." : "Generar preview"}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", background: "var(--admin-surface)", border: "1px solid var(--admin-border, #e5e7eb)", borderRadius: "var(--admin-radius)", padding: "1rem 1.15rem", marginBottom: "1rem" }}>
        <div>
          <strong style={{ display: "block", fontSize: "0.95rem" }}>Catálogo Nuvex</strong>
          <div style={{ fontSize: "0.8rem", color: "var(--admin-text-secondary)", marginTop: "0.2rem" }}>
            {catalogEnabled ? "Visible y habilitado para sincronizar." : "Apagado: sus productos numéricos están ocultos."}
          </div>
        </div>
        <button onClick={requestCatalogToggle} disabled={catalogLoading || catalogUpdating} className={`admin-btn ${catalogEnabled ? "admin-btn-danger" : "admin-btn-primary"}`}>
          {catalogUpdating ? "Actualizando..." : catalogEnabled ? "Desactivar catálogo" : "Activar catálogo"}
        </button>
      </div>

      <Modal open={!!error} onClose={() => setError(null)} type="error" title="Error Nuvex">
        {error}
      </Modal>

      <Modal open={catalogConfirmOpen} onClose={() => setCatalogConfirmOpen(false)} type="info" title="Desactivar catálogo Nuvex" showFooter={false}>
        <p style={{ margin: "0 0 1rem", lineHeight: 1.55 }}>
          Se ocultarán todos los productos de Nuvex y no se podrán sincronizar mientras el catálogo esté desactivado. ¿Querés continuar?
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
          <button className="admin-btn admin-btn-secondary" onClick={() => setCatalogConfirmOpen(false)}>Cancelar</button>
          <button className="admin-btn admin-btn-danger" onClick={() => { setCatalogConfirmOpen(false); void updateCatalog(false); }}>Sí, desactivar</button>
        </div>
      </Modal>

      {preview?.ok && preview.summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {preview.writeEnabled === false && (
            <div style={{ background: "var(--admin-surface)", border: "1px solid #e2b93b", borderRadius: "var(--admin-radius)", padding: "0.75rem 1.25rem", fontSize: "0.85rem", color: "#8a6d1a" }}>
              La escritura está deshabilitada: <code>NUVEX_SYNC_APPLY_ENABLED</code> no es <code>"true"</code>. Podés revisar el preview pero no aplicar.
            </div>
          )}

          <div style={{ background: "var(--admin-surface)", borderRadius: "var(--admin-radius)", padding: "1rem 1.25rem", boxShadow: "var(--admin-shadow)", display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <span style={{ color: "var(--admin-success)" }}>▲ {preview.summary.create} crear</span>
            <span style={{ color: "var(--admin-primary, #e67e22)" }}>● {preview.summary.update} actualizar</span>
            <span style={{ color: "var(--admin-text-secondary)" }}>= {preview.summary.unchanged} sin cambios</span>
            <span style={{ color: "var(--admin-danger)" }}>◌ {preview.summary.absent} ausentes</span>
            <span style={{ color: "#8a6d1a" }}>! {preview.summary.warnings} advertencias</span>
          </div>

          {/* Tabla de cambios */}
          <div style={{ background: "var(--admin-surface)", borderRadius: "var(--admin-radius)", padding: "0.5rem 1.25rem", boxShadow: "var(--admin-shadow)", maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Acción</th>
                  <th style={th}>Producto</th>
                  <th style={th}>Precio</th>
                  <th style={th}>Oferta</th>
                  <th style={th}>Motivo</th>
                  <th style={th}>Match</th>
                </tr>
              </thead>
              <tbody>
                {(preview.plan ?? []).map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--admin-border, #f1f2f4)" }}>
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: item.action === "create" ? "var(--admin-success)" : item.action === "update" ? "var(--admin-primary, #e67e22)" : item.action === "absent" ? "var(--admin-danger)" : "var(--admin-text-secondary)" }}>
                        {ACTION_LABEL[item.action]}
                      </span>
                    </td>
                    <td style={td}>
                      {item.name} <span style={{ color: "var(--admin-text-secondary)" }}>({item.id})</span>
                      {item.imageChanged && (
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem", alignItems: "center" }}>
                          {item.oldImages?.[0] && (
                            <img src={item.oldImages[0]} alt="anterior" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, opacity: 0.6 }} />
                          )}
                          {item.newImages?.[0] && (
                            <img src={item.newImages[0]} alt="nueva" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                          )}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {item.price ? `$${item.price}` : <span style={{ color: "#8a6d1a" }}>sin precio</span>}
                      {item.originalPrice ? <div style={{ fontSize: "0.72rem", color: "var(--admin-text-secondary)" }}><s>${item.originalPrice}</s></div> : null}
                    </td>
                    <td style={td}>{item.enOferta ? "Sí" : "No"}</td>
                    <td style={td}>{REASON_LABEL[item.priceReason] || item.priceReason}</td>
                    <td style={td}>
                      {item.matchedBy === "name" ? (
                        <button
                          className="admin-btn admin-btn-secondary"
                          onClick={() =>
                            setNameMatches((prev) => {
                              const next = { ...prev };
                              if (next[item.id] === item.inferredMatchId) delete next[item.id];
                              else if (item.inferredMatchId) next[item.id] = item.inferredMatchId;
                              return next;
                            })
                          }
                        >
                          {nameMatches[item.id] ? "✓ Confirmado" : "Confirmar"}
                        </button>
                      ) : item.matchedBy === "id" ? (
                        "Por ID"
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Coincidencias por nombre: aviso */}
          {nameMatchItems.length > 0 && (
            <div style={{ fontSize: "0.8rem", color: "var(--admin-text-secondary)" }}>
              {nameMatchItems.length} coincidencia(s) por nombre requieren confirmación explícita antes de aplicarse.
            </div>
          )}

          {/* Ausentes */}
          {absentItems.length > 0 && (
            <div style={{ background: "var(--admin-surface)", borderRadius: "var(--admin-radius)", padding: "0.75rem 1.25rem", boxShadow: "var(--admin-shadow)" }}>
              <strong>Ausentes en Nuvex ({absentItems.length})</strong>
              <div style={{ fontSize: "0.8rem", color: "var(--admin-text-secondary)", margin: "0.25rem 0 0.5rem" }}>
                No se desactivan automáticamente. Confirmá los que querés desactivar.
              </div>
              {absentItems.map((item) => (
                <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0" }}>
                  <input type="checkbox" checked={deactivateIds.has(item.id)} onChange={() => toggleDeactivate(item.id)} />
                  <span>{item.name} <span style={{ color: "var(--admin-text-secondary)" }}>({item.id})</span></span>
                </label>
              ))}
              {deactivateIds.size > 0 && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--admin-danger)" }}>
                  Se desactivarán {deactivateIds.size} producto(s).
                </div>
              )}
            </div>
          )}

          {/* Precios faltantes */}
          {warnings.length > 0 && (
            <div>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => setPriceModalOpen(true)}
                disabled={applying || previewing}
              >
                Cargar precios faltantes ({warnings.length})
              </button>
              <NuvexPriceModal
                open={priceModalOpen}
                onClose={() => setPriceModalOpen(false)}
                warnings={warnings}
                temporaryPrices={temporaryPrices}
                setTemporaryPrices={setTemporaryPrices}
              />
            </div>
          )}

          {/* Apply */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <button
              onClick={handleApply}
              disabled={!preview.writeEnabled || applying || previewing}
              className="admin-btn admin-btn-primary"
              title={preview.writeEnabled ? "Aplicar los cambios del preview" : "Escritura deshabilitada"}
            >
              {applying ? "Aplicando..." : "Aplicar cambios"}
            </button>
            {applyResult?.ok && (
              <span style={{ color: "var(--admin-success)", fontSize: "0.85rem" }}>
                ✓ Aplicado: {applyResult.upserted} productos, {applyResult.deactivated} desactivados
                {(applyResult.errors ?? 0) > 0 && `, ${applyResult.errors} errores`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Modal responsive de precios faltantes -----

interface PriceModalProps {
  open: boolean;
  onClose: () => void;
  warnings: NuvexPlanItem[];
  temporaryPrices: Record<string, string>;
  setTemporaryPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

function NuvexPriceModal({ open, onClose, warnings, temporaryPrices, setTemporaryPrices }: PriceModalProps) {
  if (!open) return null;
  return (
    <>
      <style>{`
        .nuvex-price-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          padding: 0;
        }
        .nuvex-price-dialog {
          background: var(--admin-surface, #fff);
          border-radius: 12px;
          width: 100%; height: 100%;
          max-width: 100vw; max-height: 100vh;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        @media (min-width: 768px) {
          .nuvex-price-overlay { padding: 2rem; }
          .nuvex-price-dialog {
            width: min(900px, 90vw);
            height: auto; max-height: 85vh;
            border-radius: 16px;
          }
        }
      `}</style>
      <div className="nuvex-price-overlay" onClick={onClose}>
        <div className="nuvex-price-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Precios no disponibles">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid var(--admin-border, #e5e7eb)" }}>
            <strong>Precios no disponibles ({warnings.length})</strong>
            <button className="admin-btn admin-btn-secondary" onClick={onClose}>Cerrar</button>
          </div>
          <div style={{ padding: "0 1.25rem 1rem", overflowY: "auto", flex: 1 }}>
            <p style={{ fontSize: "0.8rem", color: "var(--admin-text-secondary)" }}>
              Nuvex no expone precio para estos productos. Cargá un precio manual temporal; el próximo precio válido de Nuvex lo reemplazará.
            </p>
            <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Producto</th>
                  <th style={{ ...th, width: 180 }}>Precio manual (UYU)</th>
                </tr>
              </thead>
              <tbody>
                {warnings.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--admin-border, #f1f2f4)" }}>
                    <td style={td}>
                      {item.name} <span style={{ color: "var(--admin-text-secondary)" }}>({item.id})</span>
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        min={1}
                        value={temporaryPrices[item.id] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTemporaryPrices((prev) => ({ ...prev, [item.id]: v }));
                        }}
                        placeholder="Ingresá un precio"
                        style={{ width: "100%", boxSizing: "border-box", padding: "0.35rem 0.5rem" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", padding: "1rem 1.25rem", borderTop: "1px solid var(--admin-border, #e5e7eb)" }}>
            <button className="admin-btn admin-btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="admin-btn admin-btn-primary" onClick={onClose}>Aceptar precios</button>
          </div>
        </div>
      </div>
    </>
  );
}
