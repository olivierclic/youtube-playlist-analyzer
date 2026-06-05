/** Formate une durée en secondes vers "h:mm:ss" ou "m:ss". */
export function formatDuration(totalSeconds: number | null): string {
  const t = totalSeconds ?? 0;
  const h = Math.floor(t / 3600);
  const mi = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0
    ? `${h}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${mi}:${String(s).padStart(2, "0")}`;
}
