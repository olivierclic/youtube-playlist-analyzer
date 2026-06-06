import { useStore } from "../store/useStore.js";
import { RichEditor } from "./RichEditor.js";

export function NotesEditor({ videoId, initialHtml }: { videoId: string; initialHtml: string }) {
  const saveNote = useStore((s) => s.saveNote);
  return (
    <RichEditor
      seedKey={videoId}
      initialHtml={initialHtml}
      onSaveHtml={(html) => saveNote(videoId, html)}
      placeholder="Tes notes…"
    />
  );
}
