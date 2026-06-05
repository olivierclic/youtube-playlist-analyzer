// Helpers d'affichage — repris du PROTOTYPE.html.

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

/** Formate un nombre de vues/likes : 1.2M, 12k, 999. */
export function formatNum(n: number | null): string {
  if (!n) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return n.toLocaleString("fr-FR");
}

/** Date relative en français à partir d'une date ISO. */
export function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return `Il y a ${diff} jours`;
  if (diff < 30) return `Il y a ${Math.floor(diff / 7)} sem.`;
  if (diff < 365) return `Il y a ${Math.floor(diff / 30)} mois`;
  const y = Math.floor(diff / 365);
  return `Il y a ${y} an${y > 1 ? "s" : ""}`;
}

/** Vrai si la vidéo a moins de 7 jours (badge « Nouveau »). */
export function isNew(iso: string | null): boolean {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) / 86400000 < 7;
}

/** Date longue lisible (panneau de détail). */
export function longDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
