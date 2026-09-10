// Worker-safe bounded CSV fallback primitives. This module deliberately has no
// Node filesystem dependency: callers provide already-authorized CSV content.

export const MAX_CSV_FALLBACK_ROWS = 512;

export class CsvFallbackLimitError extends Error {
  readonly code = "CSV_FALLBACK_LIMIT";
  readonly rowCount: number;

  constructor(rowCount: number) {
    super(`CSV fallback exceeds the ${MAX_CSV_FALLBACK_ROWS}-row safety limit`);
    this.name = "CsvFallbackLimitError";
    this.rowCount = rowCount;
  }
}

/**
 * Parses at most 512 non-empty data lines using an injected row parser.
 * The injected parser keeps CSV format policy at the caller while this module
 * owns the Worker-safe hard limit and observable failure boundary.
 */
export function parseBoundedCsvFallback<T>(
  source: string,
  parseRow: (row: string, rowNumber: number) => T,
): T[] {
  const rows = source.split(/\r?\n/).filter((row) => row.trim().length > 0);
  const dataRows = rows.slice(1); // CSV fixtures always include a header row.
  if (dataRows.length > MAX_CSV_FALLBACK_ROWS) {
    throw new CsvFallbackLimitError(dataRows.length);
  }
  return dataRows.map((row, index) => parseRow(row, index + 2));
}
