import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { htmlToMd, looksLikeMarkdown, mdToHtml } from "../lib/markdown.js";

const AUTOSAVE_MS = 800;

interface RichEditorProps {
  /** Change de valeur => recharge le contenu depuis `initialHtml` (vidéo/onglet/génération). */
  seedKey: string;
  initialHtml: string;
  onSaveHtml: (html: string) => Promise<void>;
  placeholder?: string;
  /** Actions affichées à droite de la barre d'outils (ex. bouton Générer). */
  extraActions?: ReactNode;
}

/**
 * Éditeur riche TipTap réutilisable (notes, résumés) : barre d'outils, copie
 * MD/txt, collage Markdown→HTML, sauvegarde auto (debounce) avec flush au démontage.
 * Ne recharge le contenu que lorsque `seedKey` change (jamais pendant la frappe).
 */
export function RichEditor({
  seedKey,
  initialHtml,
  onSaveHtml,
  placeholder = "…",
  extraActions,
}: RichEditorProps) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const onSaveRef = useRef(onSaveHtml);
  onSaveRef.current = onSaveHtml;
  const initialRef = useRef(initialHtml);
  initialRef.current = initialHtml;

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      const html = pending.current;
      pending.current = null;
      void onSaveRef.current(html);
    }
  };

  const editor = useEditor({
    extensions: [StarterKit, Underline, Placeholder.configure({ placeholder })],
    content: initialHtml,
    editorProps: {
      attributes: { class: "rich-editor" },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (text && looksLikeMarkdown(text)) {
          event.preventDefault();
          editor?.commands.insertContent(mdToHtml(text));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      pending.current = html;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pending.current = null;
        void onSaveRef.current(html)
          .then(() => {
            setStatus("✓ Enregistré");
            setTimeout(() => setStatus(""), 1500);
          })
          .catch(() => setStatus("⚠ Échec de l'enregistrement"));
      }, AUTOSAVE_MS);
    },
  });

  // Reseed UNIQUEMENT sur changement de seedKey (changement de vidéo/onglet/génération),
  // et seulement si le contenu diffère réellement (évite de casser la frappe).
  useEffect(() => {
    if (!editor) return;
    flush();
    const next = initialRef.current || "";
    if (next !== editor.getHTML()) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
    setStatus("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, editor]);

  // Flush au démontage.
  useEffect(() => () => flush(), []);

  if (!editor) return null;

  const btn = (active: boolean) => `btn-sm fmt-btn ${active ? "btn-sm-primary" : ""}`;

  async function copy(text: string, label: string) {
    if (!text.trim()) {
      setStatus("Vide");
      setTimeout(() => setStatus(""), 1200);
      return;
    }
    await navigator.clipboard.writeText(text);
    setStatus(`${label} copié ✓`);
    setTimeout(() => setStatus(""), 1300);
  }

  return (
    <div>
      <div className="pane-head">
        <div className="btn-group">
          <button className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} title="Gras">
            <b>B</b>
          </button>
          <button className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italique">
            <i>I</i>
          </button>
          <button className={btn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Souligné">
            <u>U</u>
          </button>
          <span className="fmt-sep" />
          <button className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Titre">
            H
          </button>
          <button className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Liste à puces">
            • —
          </button>
          <button className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Liste numérotée">
            1.
          </button>
          <button className={btn(editor.isActive("code"))} onClick={() => editor.chain().focus().toggleCode().run()} title="Code">
            {"</>"}
          </button>
        </div>
        <div className="btn-group">
          <button className="btn-sm" onClick={() => void copy(htmlToMd(editor.getHTML()), "MD")}>
            Copier MD
          </button>
          <button className="btn-sm" onClick={() => void copy(editor.getText(), "Texte")}>
            Copier txt
          </button>
          {extraActions}
        </div>
      </div>

      <EditorContent editor={editor} />
      <div className="note-status">{status}</div>
    </div>
  );
}
