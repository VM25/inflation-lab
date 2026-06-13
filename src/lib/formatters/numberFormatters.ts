/** Consistent numeric formatting across the desk (01_QUANT_SPEC §26). */

export function fmtPct(decimal: number, digits = 2): string {
  return `${(decimal * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(decimal: number, digits = 2): string {
  const v = decimal * 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function fmtBps(bps: number, signed = true): string {
  const sign = signed && bps > 0 ? "+" : "";
  const v = Number.isInteger(bps) ? bps.toFixed(0) : bps.toFixed(1);
  return `${sign}${v} bps`;
}

export function fmtUsd(value: number, compactBelowCents = true): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const body = abs.toLocaleString("en-US", {
    maximumFractionDigits: compactBelowCents ? 0 : 2,
  });
  return `${sign}$${body}`;
}

export function fmtSignedUsd(value: number): string {
  return `${value > 0 ? "+" : ""}${fmtUsd(value)}`;
}

export function fmtDuration(years: number): string {
  return `${years.toFixed(2)} yrs`;
}

export function fmtConvexity(value: number): string {
  return value.toFixed(1);
}

export function fmtDv01(value: number): string {
  return `${fmtUsd(value)} / bp`;
}

export function fmtWeight(w: number): string {
  return `${Math.round(w * 100)}%`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function fmtMonthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
