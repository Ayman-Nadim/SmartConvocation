import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered, Heading2, Undo, Redo, User, MapPin, Scale, Hash, Calendar, Building2 } from "lucide-react";

const VARS: { key: string; label: string; icon: React.ElementType; color: string }[] = [
  { key: "nom_destinataire", label: "Nom destinataire", icon: User, color: "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300" },
  { key: "adresse_destinataire", label: "Adresse", icon: MapPin, color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-300" },
  { key: "avocat_bloc", label: "Bloc avocat", icon: Scale, color: "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-300" },
  { key: "numero_dossier", label: "N° dossier", icon: Hash, color: "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-300" },
  { key: "date_decision", label: "Date décision", icon: Calendar, color: "bg-rose-100 text-rose-700 hover:bg-rose-200 border-rose-300" },
  { key: "tribunal", label: "Tribunal", icon: Building2, color: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-300" },
];

export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editorProps: {
      attributes: {
        dir: "rtl",
        lang: "ar",
        class:
          "font-arabic min-h-[260px] max-h-[480px] overflow-y-auto p-4 prose prose-sm max-w-none focus:outline-none text-right leading-loose",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external value changes (e.g. switching templates)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return null;

  const insertVar = (name: string) => {
    editor.chain().focus().insertContent(`{{${name}}}`).run();
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-background shadow-sm">
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-gradient-to-r from-muted/60 to-muted/30">
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="w-4 h-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().undo().run()}>
          <Undo className="w-4 h-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().redo().run()}>
          <Redo className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
        <span className="text-xs font-semibold text-muted-foreground mr-1">📌 Insérer une variable :</span>
        {VARS.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVar(v.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all hover:scale-105 active:scale-95 ${v.color}`}
              title={`Insère {{${v.key}}}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {v.label}
            </button>
          );
        })}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}