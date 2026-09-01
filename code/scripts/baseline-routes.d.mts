// Declaración de tipos para scripts/baseline-routes.mjs
// Permite importar la función pura `percentiles` desde tests TS sin que
// `astro check` (tsc) reporte "Could not find a declaration file".
export function percentiles(sorted: number[], qs: number[]): number[];