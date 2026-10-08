import React from "react";
import { useProducts } from "./hooks/useProducts";
import { useDebounce } from "./hooks/useDebounce";
import { usePendingToast } from "./toastUtils";
import FilterBar from "./FilterBar";
import Pagination from "./Pagination";
import ProductCard from "./ProductCard";
import Modal from "./Modal";
import type { AdminProduct, FeaturedProductSuggestion } from "@utils/adminApi";
import { getFeaturedProducts, getFeaturedSuggestions, saveFeaturedProducts } from "@utils/adminApi";
import { confirmFeaturedRemoval as removeConfirmedFeatured, requestFeaturedRemoval as getPendingRemoval, toggleFeaturedSelection } from "./featuredSelection";

export default function ProductList() {
  const { toast: pendingToast, dismiss: dismissToast } = usePendingToast();
  const {
    products,
    totalCount,
    loading,
    page,
    setPage,
    totalPages,
    filters,
    updateFilter,
    clearFilters,
    toggleActive,
    displayCategories,
    hasFilters,
  } = useProducts();

  // Deactivate confirmation + live result feedback
  const [deactivateTarget, setDeactivateTarget] = React.useState<AdminProduct | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [resultToast, setResultToast] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [suggestions, setSuggestions] = React.useState<FeaturedProductSuggestion[]>([]);
  const [selectedFeatured, setSelectedFeatured] = React.useState<string[]>([]);
  const [selectedFeaturedDetails, setSelectedFeaturedDetails] = React.useState<Record<string, { name: string; imageUrl: string }>>({});
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false);
  const [featuredLoading, setFeaturedLoading] = React.useState(true);
  const [featuredSaving, setFeaturedSaving] = React.useState(false);
  const [featuredError, setFeaturedError] = React.useState<string | null>(null);
  const [featuredMessage, setFeaturedMessage] = React.useState<string | null>(null);
  const [pendingFeaturedRemoval, setPendingFeaturedRemoval] = React.useState<{ id: string; name: string } | null>(null);

  React.useEffect(() => {
    getFeaturedProducts()
      .then(({ ids, products }) => {
        setSelectedFeatured(ids);
        setSelectedFeaturedDetails(Object.fromEntries(products.map((product) => [product.product_id, { name: product.name, imageUrl: product.image_url }])));
      })
      .catch((error: unknown) => setFeaturedError(error instanceof Error ? error.message : "No se pudo cargar la selección editorial."))
      .finally(() => setFeaturedLoading(false));
  }, []);

  const loadSuggestions = async () => {
    setSuggestionsLoading(true);
    setFeaturedError(null);
    setFeaturedMessage(null);
    try {
      setSuggestions(await getFeaturedSuggestions());
    } catch (error) {
      setFeaturedError(error instanceof Error ? error.message : "No se pudieron obtener sugerencias.");
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const toggleFeatured = (id: string) => {
    setSelectedFeatured((current) => toggleFeaturedSelection(current, id));
    setFeaturedMessage(null);
  };

  const requestFeaturedRemoval = (id: string) => {
    const pendingId = getPendingRemoval(selectedFeatured, id);
    if (!pendingId) return;
    const suggestion = suggestions.find((product) => product.id === id);
    setPendingFeaturedRemoval({ id, name: suggestion?.name ?? selectedFeaturedDetails[id]?.name ?? id });
  };

  const confirmFeaturedRemoval = () => {
    if (!pendingFeaturedRemoval) return;
    setSelectedFeatured((current) => removeConfirmedFeatured(current, pendingFeaturedRemoval.id));
    setFeaturedMessage(null);
    setPendingFeaturedRemoval(null);
  };

  const moveFeatured = (index: number, direction: -1 | 1) => {
    setSelectedFeatured((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
  };

  const persistFeatured = async () => {
    if (pendingFeaturedRemoval) return;
    setFeaturedSaving(true);
    setFeaturedError(null);
    setFeaturedMessage(null);
    try {
      const result = await saveFeaturedProducts(selectedFeatured);
      setSelectedFeatured(result.ids);
      setFeaturedMessage("La selección de destacados quedó guardada.");
    } catch (error) {
      setFeaturedError(error instanceof Error ? error.message : "No se pudo guardar la selección.");
    } finally {
      setFeaturedSaving(false);
    }
  };

  // Debounce search input
  const [searchInput, setSearchInput] = React.useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync debounced value to filter
  React.useEffect(() => {
    updateFilter("search", debouncedSearch);
  }, [debouncedSearch, updateFilter]);

  const handleToggle = React.useCallback(
    async (product: AdminProduct) => {
      const ok = await toggleActive(product.id, product.active);
      if (ok) {
        setResultToast({
          type: "ok",
          text: product.active
            ? `"${product.name}" se desactivó. Ya no se muestra en la web.`
            : `"${product.name}" se activó. Ya está visible en la web.`,
        });
      } else {
        setResultToast({
          type: "error",
          text: "No pudimos actualizar el producto. Revisá tu conexión e intentá de nuevo.",
        });
      }
    },
    [toggleActive],
  );

  const handleDeactivateClick = (product: AdminProduct) => {
    setDeactivateTarget(product);
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setConfirming(true);
    await handleToggle(deactivateTarget);
    setConfirming(false);
    setDeactivateTarget(null);
  };

  const resultModal = resultToast ? (
    <Modal
      open={!!resultToast}
      onClose={() => setResultToast(null)}
      type={resultToast.type}
      title={resultToast.type === "ok" ? "Listo" : "Error"}
    >
      {resultToast.text}
    </Modal>
  ) : null;

  const confirmModal = deactivateTarget ? (
    <Modal
      open={!!deactivateTarget}
      onClose={() => setDeactivateTarget(null)}
      type="info"
      title="¿Desactivar producto?"
      showFooter={false}
    >
      <p style={{ margin: "0 0 1rem" }}>
        {`"${deactivateTarget.name}"`} se va a quitar de la tienda web.
        Podés volver a activarlo cuando quieras desde esta misma lista.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
        <button
          className="admin-btn admin-btn-ghost"
          onClick={() => setDeactivateTarget(null)}
          disabled={confirming}
        >
          Cancelar
        </button>
        <button
          className="admin-btn admin-btn-danger"
          onClick={confirmDeactivate}
          disabled={confirming}
          autoFocus
        >
          {confirming ? "Desactivando…" : "Desactivar"}
        </button>
      </div>
    </Modal>
  ) : null;

  return (
    <div style={wrap}>
      {/* Header */}
      <div className="admin-page-header" style={headerStyle}>
        <div>
          <h1 style={pageTitle}>Productos</h1>
          <p style={pageSub}>
            {totalCount} resultado{totalCount !== 1 ? "s" : ""}
            {totalPages > 1 && ` · Página ${page + 1} de ${totalPages}`}
          </p>
        </div>
        <div className="admin-header-right" style={headerRight}>
          <a href="/admin/productos/nuevo" className="admin-btn admin-btn-primary" style={{ textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo producto
          </a>
          <div className="admin-search-wrap" style={searchWrap}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--admin-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Buscar por nombre o ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={searchInputStyle}
              aria-label="Buscar productos"
            />
          </div>
        </div>
      </div>

      {/* Pending toast from redirect */}
      {pendingToast && (
        <Modal
          open={!!pendingToast}
          onClose={dismissToast}
          type={pendingToast.type}
          title={pendingToast.type === "ok" ? "Éxito" : "Error"}
        >
          {pendingToast.text}
        </Modal>
      )}

      {/* Live result feedback */}
      {resultModal}
      {/* Deactivate confirmation */}
      {confirmModal}
      {pendingFeaturedRemoval && (
        <Modal open onClose={() => setPendingFeaturedRemoval(null)} type="info" title="¿Quitar de destacados?" showFooter={false}>
          <p style={{ margin: "0 0 1rem" }}>
            {`¿Querés quitar “${pendingFeaturedRemoval.name}” de la selección actual?`}
            {" "}El cambio queda pendiente hasta que elijas Guardar selección.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="admin-btn admin-btn-ghost" onClick={() => setPendingFeaturedRemoval(null)} autoFocus>Cancelar</button>
            <button className="admin-btn admin-btn-danger" onClick={confirmFeaturedRemoval}>Quitar</button>
          </div>
        </Modal>
      )}

      <style>{`
        @keyframes featuredIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .featured-panel__results {
          display: grid;
          grid-template-columns: var(--featured-cols, minmax(0, 1fr));
          grid-auto-rows: minmax(min-content, max-content);
          align-items: start;
          gap: 0.55rem;
          max-height: 360px;
          overflow-y: auto;
          padding: 2px;
          scrollbar-color: var(--admin-text-secondary) var(--admin-bg, #f7f6f2);
        }
        .featured-panel__suggestion { min-width: 0; transition: background-color 150ms ease, box-shadow 150ms ease; }
        .featured-panel__suggestion[aria-checked="true"] { box-shadow: inset 0 0 0 2px var(--admin-accent); background: color-mix(in srgb, var(--admin-accent) 7%, var(--admin-surface)); }
        .featured-panel__suggestion:focus-within { outline: 2px solid var(--admin-text); outline-offset: 2px; }
        .featured-panel__image { width: 64px; height: 64px; flex: 0 0 64px; object-fit: contain; }
        .featured-panel__suggestion { flex-direction: row; align-items: center; gap: 0.65rem; padding: 0.5rem; }
        .featured-panel__suggestion > .featured-panel__image { width: 64px; height: 64px; aspect-ratio: auto; flex: 0 0 64px; }
        .featured-panel__info { min-width: 0; overflow-wrap: anywhere; }
        .featured-panel__rank { color: var(--admin-text-secondary); font-size: 0.78rem; font-weight: 600; }
        .featured-panel__name { min-width: 0; color: var(--admin-text); font-size: 0.95rem; line-height: 1.35; overflow-wrap: anywhere; }
        .featured-panel__checkbox { width: 1rem; height: 1rem; accent-color: var(--admin-accent); }
        .featured-panel__limit { color: var(--admin-text-secondary); font-size: 0.75rem; }
        .featured-panel__actions {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
          gap: .5rem;
        }
        .featured-panel__actions > button { min-width: 0; }
        .featured-panel { min-width: 0; width: 100%; container-type: inline-size; --featured-row: row; --featured-thumb: 64px; --featured-thumb-height: 64px; --featured-thumb-ratio: auto; --featured-object-fit: contain; --featured-info-gap: 0.2rem; --featured-info-padding: 0; }
        .featured-panel__chosen { min-width: 0; width: 100%; margin-block: 0.9rem; }
        .featured-selection-grid { display: grid; grid-template-columns: 1fr; gap: 0.5rem; min-width: 0; width: 100%; }
        .featured-selection-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto auto auto; align-items: center; gap: 0.5rem; min-width: 0; width: 100%; }
        .featured-selection-image { width: 44px; height: 44px; flex: 0 0 44px; object-fit: cover; border-radius: 6px; }
        .featured-selection-name { min-width: 0; color: var(--admin-text); font-size: 0.9rem; line-height: 1.3; overflow-wrap: anywhere; }
        .featured-selection-control { min-width: 34px !important; min-height: 34px !important; width: auto; padding: 0 0.45rem !important; font-size: 0.8rem !important; line-height: 1; }
        .featured-selection-remove { min-width: 0 !important; padding-inline: 0.55rem !important; }
        @container (min-width: 760px) {
          .featured-selection-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 420px) {
          .featured-panel__actions { grid-template-columns: 1fr; }
        }
        @media (min-width: 1000px) {
          .featured-panel {
            --featured-cols: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
            --featured-row: row;
            --featured-thumb: 64px;
            --featured-thumb-height: 64px;
            --featured-thumb-ratio: auto;
            --featured-object-fit: contain;
            --featured-info-gap: 0.2rem;
            --featured-info-padding: 0;
            --featured-results-height: 360px;
            --featured-skeleton-height: 52px;
          }
          .featured-panel__heading { align-items: center; }
          .featured-panel__results {
            max-height: var(--featured-results-height);
            overflow-y: auto;
            padding: 2px;
            scrollbar-color: var(--admin-text-secondary) var(--admin-bg, #f7f6f2);
          }
          .featured-panel__suggestion {
            flex-direction: var(--featured-row);
            align-items: center;
            gap: 0.65rem;
            padding: 0.5rem;
          }
          .featured-panel__image { flex: 0 0 auto; }
          .featured-panel__info { min-width: 0; }
          .featured-panel__skeleton {
            display: flex;
            align-items: center;
            gap: 0.65rem;
            padding: 0.5rem;
          }
          .featured-panel__skeleton-image {
            width: 52px;
            height: var(--featured-skeleton-height);
            flex: 0 0 auto;
            margin: 0;
          }
          .featured-panel__skeleton-copy {
            display: grid;
            flex: 1;
            gap: 0.35rem;
          }
          .featured-panel__skeleton-copy > * { margin: 0 !important; }
          .featured-panel__suggestion:focus-within {
            outline: 2px solid var(--admin-text);
            outline-offset: 2px;
          }
        }
        @media (min-width: 1280px) {
          .featured-panel {
            --featured-cols: repeat(2, minmax(0, 1fr));
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .featured-suggestion-motion, .featured-panel__chevron { animation: none !important; transition: none !important; }
        }
        .featured-v1 { display: block; padding: 0.4rem 0.75rem; background: var(--admin-surface); border: 1px solid var(--admin-border); border-radius: 14px; color: var(--admin-text); }
        .featured-panel__disclosure { min-width: 0; }
        .featured-panel__summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 44px; width: 100%; cursor: pointer; list-style: none; }
        .featured-panel__summary::-webkit-details-marker { display: none; }
        .featured-panel__summary::marker { content: ""; }
        .featured-panel__summary:focus-visible { outline: 2px solid var(--admin-text); outline-offset: 3px; border-radius: 4px; }
        .featured-panel__chevron { width: 18px; height: 18px; flex: 0 0 18px; transition: transform 180ms ease; }
        .featured-panel__disclosure[open] .featured-panel__chevron { transform: rotate(180deg); }
        .featured-panel__body { display: grid; gap: 1rem; padding-top: 0.75rem; }
        .v1-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--admin-border); }
        .v1-title { margin: 0; color: var(--admin-text); font: 500 1.35rem/1.2 var(--admin-font-serif); }
        .v1-copy { max-width: 48ch; margin: .4rem 0 0; color: var(--admin-text-secondary); font-size: .88rem; line-height: 1.5; }
        .v1-section-label { display: flex; justify-content: space-between; align-items: center; gap: .75rem; margin: .2rem 0 .65rem; color: var(--admin-text); font-size: .9rem; font-weight: 650; }
        .v1-count { color: var(--admin-accent); font-variant-numeric: tabular-nums; }
        .v1-picked { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .45rem; }
        .v1-row { display: flex; align-items: center; gap: .45rem; min-width: 0; padding: .5rem; border: 1px solid var(--admin-border); border-radius: 9px; }
        .v1-row img { width: 36px; height: 36px; flex: 0 0 36px; object-fit: cover; border-radius: 6px; }
        .v1-name { flex: 1; min-width: 0; overflow: hidden; color: var(--admin-text); font-size: .78rem; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 720px) { .v1-head { align-items: flex-start; flex-direction: column; } .v1-picked { grid-template-columns: 1fr; } }
      `}</style>
        <section className="featured-panel featured-v1" style={featuredPanel}>
          <details className="featured-panel__disclosure">
            <summary className="featured-panel__summary">
              <h2 id="featured-v1-title" className="v1-title">Sugerencias de productos destacados</h2>
              <svg className="featured-panel__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <div className="featured-panel__body">
              <div className="v1-head">
                <p className="v1-copy">Elegí hasta 8 productos y ordenalos como querés que aparezcan en la tienda.</p>
                <div className="featured-panel__actions">
                  <button className="admin-btn admin-btn-ghost" onClick={loadSuggestions} disabled={suggestionsLoading}>
                    {suggestionsLoading ? "Buscando…" : "✨ Obtener sugerencias"}
                  </button>
                  <button className="admin-btn admin-btn-primary" onClick={persistFeatured} disabled={featuredSaving || featuredLoading || !!pendingFeaturedRemoval}>
                    {featuredSaving ? "Guardando…" : "Guardar selección"}
                  </button>
                </div>
              </div>

          {featuredLoading && <p role="status" style={featuredHint}>Cargando selección editorial…</p>}
          {featuredError && <p role="alert" style={featuredErrorStyle}>{featuredError}</p>}
          {featuredMessage && <p role="status" style={featuredSuccess}>{featuredMessage}</p>}

          {selectedFeatured.length > 0 && (
            <section className="featured-panel__chosen" style={featuredChosen} aria-label="Orden de productos destacados">
              <h3 className="v1-section-label">
                Selección actual <span className="v1-count">{selectedFeatured.length}/8</span>
              </h3>
              <div className="featured-selection-grid">
                {selectedFeatured.map((id, index) => {
                  const product = suggestions.find((suggestion) => suggestion.id === id);
                  const details = selectedFeaturedDetails[id];
                  const name = product?.name ?? details?.name ?? id;
                  const imageUrl = product?.imageUrl ?? details?.imageUrl;
                  return (
                    <div className="featured-selection-row" key={id}>
                      {imageUrl ? <img className="featured-selection-image" src={imageUrl} alt="" /> : <span className="featured-selection-image" aria-hidden="true" />}
                      <span className="featured-selection-name">{name}</span>
                      <button className="admin-btn admin-btn-ghost featured-selection-control" onClick={() => moveFeatured(index, -1)} disabled={index === 0} aria-label={`Mover ${name} hacia arriba`}>↑</button>
                      <button className="admin-btn admin-btn-ghost featured-selection-control" onClick={() => moveFeatured(index, 1)} disabled={index === selectedFeatured.length - 1} aria-label={`Mover ${name} hacia abajo`}>↓</button>
                      <button className="admin-btn admin-btn-ghost featured-selection-control featured-selection-remove" onClick={() => requestFeaturedRemoval(id)}>Quitar</button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {!suggestionsLoading && suggestions.length > 0 && <h3 className="v1-section-label" style={{ marginTop: "0.35rem" }}>Productos sugeridos <span className="v1-count">{suggestions.length}</span></h3>}
          {suggestionsLoading && <div className="featured-panel__results" style={suggestionGrid} aria-label="Cargando sugerencias" aria-busy="true">{[0, 1, 2, 3].map((index) => <div key={index} className="featured-panel__skeleton" style={suggestionSkeleton}><div className="admin-skeleton featured-panel__skeleton-image" style={{ height: "var(--featured-skeleton-height, 120px)", borderRadius: "var(--admin-radius-sm)" }} /><div className="featured-panel__skeleton-copy"><div className="admin-skeleton" style={{ height: 14, width: "70%", marginTop: 10 }} /><div className="admin-skeleton" style={{ height: 12, width: "35%", marginTop: 8 }} /></div></div>)}</div>}
          {!suggestionsLoading && suggestions.length > 0 && <div className="featured-panel__results" style={suggestionGrid}>{suggestions.map((product, index) => { const chosen = selectedFeatured.includes(product.id); const atLimit = !chosen && selectedFeatured.length >= 8; return <label key={product.id} aria-checked={chosen} className="featured-suggestion-motion featured-panel__suggestion" style={{ ...suggestionCard, animationDelay: `${Math.min(index, 8) * 35}ms` }}><img src={product.imageUrl} alt="" className="featured-panel__image" style={suggestionImage} loading="lazy" /><span className="featured-panel__info" style={suggestionInfo}><strong className="featured-panel__name">{product.name}</strong><span className="featured-panel__rank">Puesto {index + 1}</span><span style={featuredHint}>{product.visits.toLocaleString("es-UY")} visitas · últimos 30 días</span><span style={suggestionToggle}><input className="featured-panel__checkbox" type="checkbox" checked={chosen} disabled={atLimit} aria-label={`Seleccionar ${product.name}`} title={atLimit ? "Límite de 8 destacados alcanzado; quitá uno para sumar otro." : undefined} onChange={() => chosen ? requestFeaturedRemoval(product.id) : toggleFeatured(product.id)} /> {chosen ? "Seleccionado" : atLimit ? "Límite de 8 alcanzado" : "Sumar a destacados"}</span></span></label>; })}</div>}
          {!suggestionsLoading && suggestions.length === 0 && !featuredError && !featuredLoading && <p style={featuredHint}>Las sugerencias aparecen acá cuando las pedís. La consulta de Analytics no se ejecuta antes del clic.</p>}
            </div>
          </details>
        </section>

      {/* Filters */}
      <FilterBar
        filters={filters}
        displayCategories={displayCategories}
        onFilterChange={updateFilter}
        onClear={clearFilters}
        hasFilters={hasFilters}
        totalCount={totalCount}
      />

      {/* Loading skeleton */}
      {loading && products.length === 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.85rem" }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ background: "var(--admin-surface)", borderRadius: "var(--admin-radius)", padding: "1.25rem", boxShadow: "var(--admin-shadow)" }}>
              <div className="admin-skeleton" style={{ height: 12, width: "50%", marginBottom: "0.5rem" }} />
              <div className="admin-skeleton" style={{ height: 10, width: "80%", marginBottom: "0.5rem" }} />
              <div className="admin-skeleton" style={{ height: 14, width: "30%" }} />
            </div>
          ))}
        </div>
      )}

      {/* Product grid */}
      {(!loading || products.length > 0) && (
        <div style={gridStyle}>
          {products.map((p, idx) => (
            <ProductCard
              key={p.id}
              product={p}
              index={idx}
              onDeactivate={handleDeactivateClick}
              onActivate={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && products.length === 0 && (
        <div style={emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--admin-text-secondary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p style={{ margin: "0.5rem 0 0", color: "var(--admin-text-secondary)", fontSize: "0.9rem" }}>
            {hasFilters || searchInput ? "No se encontraron productos con esos filtros." : "No hay productos todavía."}
          </p>
          {(hasFilters || searchInput) && (
            <button
              onClick={() => { clearFilters(); setSearchInput(""); }}
              className="admin-btn admin-btn-ghost"
              style={{ marginTop: "0.75rem" }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

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

const headerRight: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  alignItems: "center",
  flexWrap: "wrap",
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

const searchWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.55rem 0.85rem",
  background: "var(--admin-surface)",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  boxShadow: "var(--admin-shadow-sm)",
  width: "100%",
  maxWidth: 280,
  transition: "border-color 0.2s, box-shadow 0.2s",
};

const searchInputStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  outline: "none",
  fontSize: "0.9rem",
  color: "var(--admin-text)",
  width: "100%",
  fontFamily: "inherit",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "0.85rem",
};

const emptyState: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "4rem 2rem",
  textAlign: "center",
};

const featuredPanel: React.CSSProperties = {
  marginBottom: "1.25rem",
  padding: "0.4rem 0.75rem",
  background: "var(--admin-surface)",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius)",
};
const featuredHeading: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.9rem" };
const featuredTitle: React.CSSProperties = { margin: 0, color: "var(--admin-text)", fontFamily: "var(--admin-font-serif)", fontSize: "1.2rem", fontWeight: 500 };
const featuredActions: React.CSSProperties = { display: "flex", gap: "0.5rem", flexWrap: "wrap" };
const featuredHint: React.CSSProperties = { margin: 0, color: "var(--admin-text-secondary)", fontSize: "0.78rem" };
const featuredErrorStyle: React.CSSProperties = { margin: "0.5rem 0", color: "var(--admin-danger, #b42318)", fontSize: "0.85rem" };
const featuredSuccess: React.CSSProperties = { margin: "0.5rem 0", color: "var(--admin-success, #287a3d)", fontSize: "0.85rem" };
const featuredChosen: React.CSSProperties = { marginBlock: "0.9rem" };
const featuredSubheading: React.CSSProperties = { margin: "0 0 0.55rem", color: "var(--admin-text)", fontSize: "0.85rem" };
const chosenRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.45rem", paddingBlock: "0.3rem", borderBottom: "1px solid var(--admin-border)" };
const chosenImage: React.CSSProperties = { width: 38, height: 38, objectFit: "cover", borderRadius: "var(--admin-radius-sm)" };
const chosenName: React.CSSProperties = { flex: 1, minWidth: 0, color: "var(--admin-text)", fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const suggestionGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "var(--featured-cols, repeat(auto-fill, minmax(min(100%, 190px), 1fr)))", gap: "0.65rem", marginTop: "0.75rem" };
const suggestionCard: React.CSSProperties = { display: "flex", flexDirection: "var(--featured-row, column)" as "column", overflow: "hidden", border: "1px solid var(--admin-border)", borderRadius: "var(--admin-radius-sm)", background: "var(--admin-surface)", animation: "featuredIn 0.28s ease-out both" };
const suggestionImage: React.CSSProperties = { width: "var(--featured-thumb, 100%)", height: "var(--featured-thumb-height, auto)", aspectRatio: "var(--featured-thumb-ratio, 1 / 1)", objectFit: "var(--featured-object-fit, cover)" as "cover", background: "var(--admin-bg, #f7f6f2)" };
const suggestionInfo: React.CSSProperties = { display: "grid", gap: "var(--featured-info-gap, 0.35rem)", padding: "var(--featured-info-padding, 0.65rem)" };
const suggestionName: React.CSSProperties = { color: "var(--admin-text)", fontSize: "0.85rem", lineHeight: 1.25 };
const suggestionToggle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--admin-text)", fontSize: "0.78rem", cursor: "pointer" };
const suggestionSkeleton: React.CSSProperties = { padding: "0.55rem", border: "1px solid var(--admin-border)", borderRadius: "var(--admin-radius-sm)" };
