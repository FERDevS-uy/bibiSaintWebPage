export function formatPriceNumber(n: number): string {
  if (!isFinite(n)) return '';
  const integerPart = Math.trunc(n);
  return integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function parsePrice(value: string | number): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  let normalized = raw.replace(/\s+/g, '');
  normalized = normalized.replace(/[^0-9,.-]/g, '');

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastDot > lastComma) {
      // Ejemplo: 3,399.00 -> coma miles, punto decimal
      normalized = normalized.replace(/,/g, '');
      if (normalized.endsWith('.00')) normalized = normalized.slice(0, -3);
    } else {
      // Ejemplo: 3.399,00 -> punto miles, coma decimal
      normalized = normalized.replace(/\./g, '');
      normalized = normalized.replace(/,/g, '.');
      if (normalized.endsWith('.00')) normalized = normalized.slice(0, -3);
    }
  } else if (hasComma) {
    const commaIndex = normalized.lastIndexOf(',');
    const decimals = normalized.length - commaIndex - 1;
    if (decimals === 3) {
      // 2,699 -> separador de miles
      return normalized.replace(/,/g, '.');
    }
    normalized = normalized.replace(/,/g, '.');
    if (normalized.endsWith('.00')) normalized = normalized.slice(0, -3);
  } else if (hasDot) {
    const dotIndex = normalized.lastIndexOf('.');
    const decimals = normalized.length - dotIndex - 1;
    if (decimals === 3) {
      // 2.699 -> separador de miles
      return normalized;
    }
    if (normalized.endsWith('.00')) normalized = normalized.slice(0, -3);
  }

  const valueNumber = parseFloat(normalized);
  if (Number.isNaN(valueNumber)) return '';
  return formatPriceNumber(valueNumber);
}
