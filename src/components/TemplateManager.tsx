import { useState, useEffect } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "./RichTextEditor";
import { DEFAULT_TEMPLATE_HTML, type ConvocationTemplate } from "@/lib/templates";
import { toast } from "sonner";

export function TemplateManager({
  open,
  onOpenChange,
  editing,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ConvocationTemplate | null;
  onSave: (name: string, content: string, id?: string) => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState(DEFAULT_TEMPLATE_HTML);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setContent(editing?.content ?? DEFAULT_TEMPLATE_HTML);
    }
  }, [open, editing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le modèle" : "Nouveau modèle"}</DialogTitle>
          <DialogDescription>
            Utilisez les variables{" "}
            <code className="text-xs">
              {"{{nom}} {{adresse}} {{numeroDossier}} {{date}}"}
            </code>{" "}
            — elles seront remplacées automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nom du modèle</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Convocation expertise immobilière" />
          </div>
          <div>
            <Label className="mb-1 block">Contenu (arabe, RTL)</Label>
            <RichTextEditor value={content} onChange={setContent} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) return toast.error("Donnez un nom au modèle.");
              onSave(name.trim(), content, editing?.id);
              onOpenChange(false);
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}