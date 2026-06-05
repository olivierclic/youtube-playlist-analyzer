import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { useStore } from "../store/useStore.js";
import { htmlToMd, looksLikeMarkdown, mdToHtml } from "../lib/markdown.js";

const AUTOSAVE_MS = 800;

export function NotesEditor({ videoId, initialHtml }: { videoId: string; initialHtml: string }) {
  const saveNote = useStore((s) => s.saveNote);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Garde l'id courant pour éviter une sauvegarde croisée lors d'un changement de vidéo.
  const currentId = useRef(videoId);
  // Sauvegarde en attente (debounce) à vider au démontage.
  const pending = useRef<{ id: string; html: string } | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Underline, Placeholder.configure({ placeholder: "Tes notes…" })],
    content: initialHtml,
    editorProps: {
      attributes: { class: "rich-editor" },
      // Collage : convertit le Markdown en HTML.
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
      if (timer.current) clearTimeout(timer.current);
      const id = currentId.current;
      pending.current = { id, html };
      timer.current = setTimeout(() => {
        pending.current = null;
        void saveNote(id, html)
          .then(() => {
            setStatus("✓ Enregistré");
            setTimeout(() => setStatus(""), 1500);
          })
          .catch(() => setStatus("⚠ Échec de l'enregistrement"));
      }, AUTOSAVE_MS);
    },
  });

  // Au démontage (changement d'onglet/vidéo) : vide une sauvegarde en attente.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const p = pending.current;
      if (p) {
        pending.current = null;
        void saveNote(p.id, p.html);
      }
    };
  }, [saveNote]);

  // Changement de vidéo : recharge le contenu sans déclencher d'autosave.
  useEffect(() => {
    currentId.current = videoId;
    if (timer.current) clearTimeout(timer.current);
    editor?.commands.setContent(initialHtml || "", { emitUpdate: false });
    setStatus("");
  }, [videoId, initialHtml, editor]);

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
          <button
            className={btn(editor.isActive("bold"))}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Gras"
          >
            <b>B</b>
          </button>
          <button
            className={btn(editor.isActive("italic"))}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italique"
          >
            <i>I</i>
          </button>
          <button
            className={btn(editor.isActive("underline"))}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Souligné"
          >
            <u>U</u>
          </button>
          <span className="fmt-sep" />
          <button
            className={btn(editor.isActive("heading", { level: 2 }))}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Titre"
          >
            H
          </button>
          <button
            className={btn(editor.isActive("bulletList"))}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Liste à puces"
          >
            • —
          </button>
          <button
            className={btn(editor.isActive("orderedList"))}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Liste numérotée"
          >
            1.
          </button>
          <button
            className={btn(editor.isActive("code"))}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Code"
          >
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
        </div>
      </div>

      <EditorContent editor={editor} />
      <div className="note-status">{status}</div>
    </div>
  );
}
