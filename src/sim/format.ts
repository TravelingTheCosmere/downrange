export function formatT(t: number): string {
  const sign = t < -0.05 ? "-" : "+";
  const a = Math.abs(t);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const s = Math.floor(a % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `T${sign}${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatKm(m: number): string {
  const km = m / 1000;
  if (Math.abs(km) >= 100) return `${km.toFixed(0)} km`;
  if (Math.abs(km) >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}

export function formatMps(v: number): string {
  return `${Math.round(v).toLocaleString("en-US")} m/s`;
}

export function formatKpa(q: number): string {
  return `${(q / 1000).toFixed(1)} kPa`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
