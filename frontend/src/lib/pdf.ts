import type { Video } from "../types.js";
import { mdToHtml, htmlToPlain } from "./markdown.js";
import { formatDuration, formatNum, longDate } from "./format.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const hasText = (s: string | null | undefined) => Boolean(s && s.trim());
const noteHasText = (html: string | null) => Boolean(html && htmlToPlain(html));

/**
 * Ouvre une fenêtre imprimable de la fiche vidéo et lance la boîte d'impression
 * du navigateur (→ « Enregistrer en PDF »).
 *
 * Ordre des sections : Notes, Résumé IA, Résumé IA détaillé (chacune si non vide),
 * puis Description uniquement si notes ET résumés sont vides.
 */
export function printVideoSheet(video: Video): void {
  const sections: string[] = [];

  if (noteHasText(video.note_html)) {
    sections.push(`<h2>Notes</h2><div class="content">${video.note_html}</div>`);
  }
  if (hasText(video.summary_md)) {
    sections.push(`<h2>Résumé IA</h2><div class="content">${mdToHtml(video.summary_md!)}</div>`);
  }
  if (hasText(video.summary_detailed_md)) {
    sections.push(
      `<h2>Résumé IA détaillé</h2><div class="content">${mdToHtml(video.summary_detailed_md!)}</div>`,
    );
  }
  // Description seulement si notes ET résumés (standard + détaillé) sont vides.
  const noUserContent =
    !noteHasText(video.note_html) && !hasText(video.summary_md) && !hasText(video.summary_detailed_md);
  if (noUserContent && hasText(video.description)) {
    sections.push(
      `<h2>Description</h2><div class="content desc">${escapeHtml(video.description!).replace(/\n/g, "<br>")}</div>`,
    );
  }

  const meta = [
    video.channel ? escapeHtml(video.channel) : null,
    longDate(video.added_at),
    formatDuration(video.duration_s) + (video.is_short ? " · Short" : ""),
    video.views ? `${formatNum(video.views)} vues` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const doc = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${escapeHtml(video.title ?? "Fiche vidéo")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; line-height: 1.6; max-width: 720px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 18px; border-bottom: 1px solid #ccc; padding-bottom: 12px; }
  h2 { font-size: 16px; margin: 22px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .content { font-size: 14px; }
  .content.desc { white-space: normal; }
  ul, ol { padding-left: 22px; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
  a { color: #1a4d8f; }
  @media print { body { margin: 0; max-width: none; } a { color: #111; text-decoration: none; } }
</style></head>
<body>
  <h1>${escapeHtml(video.title ?? "Sans titre")}</h1>
  <div class="meta">${meta}<br>https://www.youtube.com/watch?v=${escapeHtml(video.id)}</div>
  ${sections.join("\n") || '<p><em>Aucun contenu à imprimer.</em></p>'}
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`;

  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) {
    alert("Le navigateur a bloqué la fenêtre d'impression. Autorise les pop-ups pour ce site.");
    return;
  }
  win.document.open();
  win.document.write(doc);
  win.document.close();
}
