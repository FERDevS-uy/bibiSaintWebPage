"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPriceNumber = formatPriceNumber;
exports.parsePrice = parsePrice;
function formatPriceNumber(n) {
    if (!isFinite(n))
        return '';
    const absValue = Math.abs(n);
    const baseInteger = Math.trunc(absValue);
    const decimalPart = absValue - baseInteger;
    const roundedInteger = decimalPart + 1e-9 >= 0.6 ? baseInteger + 1 : baseInteger;
    const integerPart = n < 0 ? -roundedInteger : roundedInteger;
    return integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function parsePrice(value, multiplier = 1) {
    if (value === null || value === undefined)
        return '';
    const raw = String(value).trim();
    if (!raw)
        return '';
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
            if (normalized.endsWith('.00'))
                normalized = normalized.slice(0, -3);
        }
        else {
            // Ejemplo: 3.399,00 -> punto miles, coma decimal
            normalized = normalized.replace(/\./g, '');
            normalized = normalized.replace(/,/g, '.');
            if (normalized.endsWith('.00'))
                normalized = normalized.slice(0, -3);
        }
    }
    else if (hasComma) {
        const commaIndex = normalized.lastIndexOf(',');
        const decimals = normalized.length - commaIndex - 1;
        if (decimals === 3) {
            // 2,699 -> separador de miles
            return normalized.replace(/,/g, '.');
        }
        normalized = normalized.replace(/,/g, '.');
        if (normalized.endsWith('.00'))
            normalized = normalized.slice(0, -3);
    }
    else if (hasDot) {
        const dotIndex = normalized.lastIndexOf('.');
        const decimals = normalized.length - dotIndex - 1;
        if (decimals === 3) {
            // 2.699 -> separador de miles
            return normalized;
        }
        if (normalized.endsWith('.00'))
            normalized = normalized.slice(0, -3);
    }
    const valueNumber = parseFloat(normalized);
    if (Number.isNaN(valueNumber))
        return '';
    const adjusted = valueNumber * (Number.isFinite(multiplier) ? multiplier : 1);
    return formatPriceNumber(adjusted);
}
