import { marked } from "marked";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

marked.setOptions({ breaks: true, gfm: true });

/** Convertit du Markdown en HTML (collage, import, rendu de résumé). */
export function mdToHtml(md: string): string {
  return marked.parse(md, { async: false });
}

/** Convertit du HTML en Markdown (boutons « Copier MD », export). */
export function htmlToMd(html: string): string {
  return turndown.turndown(html || "").trim();
}

/** Aplati du HTML en texte brut (sous-texte de la vue liste, bouton « Copier txt »). */
export function htmlToPlain(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html || "";
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/** Aplati du Markdown en texte brut (sous-texte de la vue liste). */
export function mdToPlain(md: string): string {
  return String(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Heuristique : le texte ressemble-t-il à du Markdown ? (collage) */
export function looksLikeMarkdown(s: string): boolean {
  return /(\*\*|__|^#{1,3}\s|^\s*[-*]\s|`[^`]+`)/m.test(s || "");
}
