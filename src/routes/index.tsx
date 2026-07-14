import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Loader2, FileText, CheckCircle2, Printer, Download, ArrowRight, ArrowLeft, Plus, Pencil, Trash2, UserPlus, Sparkles, Zap, ShieldCheck, Wand2, Rocket, Languages } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster } from "@/components/ui/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { extractDocument, type ExtractedData } from "@/lib/extract.functions";
import { ConvocationSheet } from "@/components/ConvocationSheet";
import { TemplateManager } from "@/components/TemplateManager";
import { useTemplates, renderTemplate, type ConvocationTemplate } from "@/lib/templates";
import { RichTextEditor } from "@/components/RichTextEditor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IDP — Convocation d'Expert" },
      { name: "description", content: "Extraction IA d'arrêts judiciaires et génération automatique de convocations d'expert." },
    ],
  }),
  component: Index,
});

type Step = 1 | 2 | 3;

type Avocat = { id: string; nom: string; adresse: string };
type PartyRow = {
  id: string;
  nom_complet: string;
  adresse: string;
  avocatId: string | null;
  source: "party" | "presence";
  role?: string;
};

const NO_AVOCAT = "__none__";

const DEFAULT_MISSION: string[] = [
  "استدعاء الأطراف و وكلائهم بصفة قانونية.",
  "الإنتقال إلى العقار المذكور أعلاه و معاينته.",
  "الاطلاع على وثائق الملف و كذا الرخص و التصاميم المتعلقة بموضوع النزاع.",
  "تحديد الكميات المستخرجة و مقارنتها بالرسوم المؤداة، و تحديد ما إذا كانت الكميات المصرح بها موضوع التضريب حقيقية.",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalize(res: ExtractedData): { avocats: Avocat[]; parties: PartyRow[] } {
  const avocats: Avocat[] = [];
  const parties: PartyRow[] = [];
  for (const g of res.groupes_parties) {
    let avocatId: string | null = null;
    if (g.avocat_nom.trim()) {
      const av = { id: uid(), nom: g.avocat_nom.trim(), adresse: "" };
      avocats.push(av);
      avocatId = av.id;
    }
    for (const p of g.parties_representees) {
      parties.push({
        id: uid(),
        nom_complet: p.nom_complet,
        adresse: p.adresse,
        avocatId,
        source: "party",
      });
    }
  }
  for (const x of res.presence_autres) {
    parties.push({
      id: uid(),
      nom_complet: x.nom_complet,
      adresse: x.adresse,
      avocatId: null,
      source: "presence",
      role: x.role,
    });
  }
  return { avocats, parties };
}

function buildAvocatBloc(
  party: PartyRow,
  parties: PartyRow[],
  avocats: Avocat[],
  selected: Set<string>,
): string {
  if (!party.avocatId) return "";
  const avocat = avocats.find((a) => a.id === party.avocatId);
  if (!avocat) return "";
  const siblings = parties.filter(
    (p) => p.avocatId === party.avocatId && selected.has(p.id),
  );
  if (siblings.length === 0) return "";
  if (siblings.length <= 2) {
    const names = siblings.map((s) => s.nom_complet).join(" و ");
    return `${avocat.nom} ينوب عن ${names}`;
  }
  return `${avocat.nom} ومن معه`;
}

function todayFr() {
  return new Date().toLocaleDateString("fr-FR");
}

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: "Importation & Analyse" },
    { n: 2, label: "Validation" },
    { n: 3, label: "Aperçu & Impression" },
  ];
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8">
      {items.map((it, i) => {
        const active = step === it.n;
        const done = step > it.n;
        return (
          <div key={it.n} className="flex items-center gap-2 sm:gap-4">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : done
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  active ? "bg-primary-foreground/20" : done ? "bg-emerald-500/20" : "bg-background"
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : it.n}
              </span>
              <span className="text-sm font-medium hidden sm:inline">{it.label}</span>
            </div>
            {i < items.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

function Index() {
  const [showLanding, setShowLanding] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExtractedData | null>(null);
  const [avocats, setAvocats] = useState<Avocat[]>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedAvocats, setSelectedAvocats] = useState<Set<string>>(new Set());
  const [mission, setMission] = useState<string[]>(DEFAULT_MISSION);
  const sheetRef = useRef<HTMLDivElement>(null);
  const extract = useServerFn(extractDocument);

  const { templates, create, update, remove } = useTemplates();
  const [templateId, setTemplateId] = useState<string>("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ConvocationTemplate | null>(null);

  const currentTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? templates[0],
    [templates, templateId],
  );

  const onFile = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPages([]);
    try {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        toast.info("Conversion du PDF en images…");
        const imgs = await pdfToImages(f);
        setPages(imgs);
      } else if (f.type.startsWith("image/")) {
        const url: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        setPages([url]);
      } else {
        toast.error("Format non supporté. Importez un PDF, PNG ou JPG.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de lecture du fichier");
    }
  };

  const runAnalysis = async () => {
    if (!pages.length) return toast.error("Importez d'abord un document.");
    setLoading(true);
    try {
      const res = await extract({ data: { images: pages } });
      const norm = normalize(res);
      if (!norm.parties.length) toast.warning("Aucune partie détectée. Vous pouvez les saisir manuellement.");
      setData(res);
      setAvocats(norm.avocats);
      setParties(norm.parties);
      setSelected(new Set(norm.parties.slice(0, 1).map((p) => p.id)));
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'analyse");
    } finally {
      setLoading(false);
    }
  };

  const updateParty = (id: string, patch: Partial<PartyRow>) => {
    setParties((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const addParty = () => {
    const p: PartyRow = { id: uid(), nom_complet: "", adresse: "", avocatId: null, source: "party" };
    setParties((prev) => [...prev, p]);
    setSelected((prev) => new Set([...prev, p.id]));
  };

  const removeParty = (id: string) => {
    setParties((prev) => prev.filter((p) => p.id !== id));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const addAvocat = () => {
    const nom = prompt("Nom de l'avocat (ex: الأستاذ محمد سيباري)");
    if (!nom?.trim()) return;
    setAvocats((prev) => [...prev, { id: uid(), nom: nom.trim(), adresse: "" }]);
  };

  const updateAvocat = (id: string, patch: Partial<Avocat>) => {
    setAvocats((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const removeAvocat = (id: string) => {
    setAvocats((prev) => prev.filter((a) => a.id !== id));
    setParties((prev) => prev.map((p) => (p.avocatId === id ? { ...p, avocatId: null } : p)));
    setSelectedAvocats((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const toggleSelectAvocat = (id: string) => {
    setSelectedAvocats((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const downloadPdf = async () => {
    if (!sheetRef.current) return;
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: 0,
        filename: `convocation-${data?.numero_dossier || "document"}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(sheetRef.current)
      .save();
  };

  const selectedParties = parties.filter((p) => selected.has(p.id));
  const avocatSheets = avocats
    .filter((a) => selectedAvocats.has(a.id))
    .map((a) => {
      const represented = parties.filter((p) => p.avocatId === a.id);
      const names = represented.map((p) => p.nom_complet).filter(Boolean);
      const manyMode = names.length > 2;
      const destinataire = manyMode ? `${a.nom} ومن معه` : a.nom;
      const sousTitre =
        names.length === 0 || manyMode
          ? ""
          : `نيابة عن ${names.join(" و ")}`;
      return { avocat: a, destinataire, sousTitre };
    });
  const totalSheets = selectedParties.length + avocatSheets.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50">
      <Toaster richColors position="top-center" />

      {showLanding && <Landing onStart={() => setShowLanding(false)} />}

      {!showLanding && (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <header className="text-center mb-10 animate-fade-in">
          <button
            onClick={() => setShowLanding(true)}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-semibold mb-3 shadow-md hover:shadow-lg transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" /> IDP Juridique — Accueil
          </button>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-500 bg-clip-text text-transparent">
            De l'arrêt judiciaire à la convocation d'expert
          </h1>
          <p className="text-muted-foreground mt-2">
            Importez, extrayez avec l'IA, validez et générez la convocation en un clic.
          </p>
        </header>

        <Stepper step={step} />

        {step === 1 && (
          <Card className="p-8">
            <label
              htmlFor="file-input"
              className="block border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="font-medium mb-1">
                {file ? file.name : "Glissez-déposez le document ici"}
              </p>
              <p className="text-sm text-muted-foreground">PDF, PNG ou JPG (arrêt de cour d'appel)</p>
              <input
                id="file-input"
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {pages.length > 0 && (
              <div className="mt-6 flex flex-col sm:flex-row gap-4 items-start">
                <div className="flex gap-2 overflow-x-auto max-w-full">
                  {pages.map((p, i) => (
                    <img key={i} src={p} alt={`Page ${i + 1}`} className="h-64 rounded-lg border" />
                  ))}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-3">
                    {pages.length} page(s) prête(s). Lancez l'analyse IA (Gemini) pour extraire les parties.
                  </p>
                  <Button onClick={runAnalysis} disabled={loading} size="lg">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyse en cours…
                      </>
                    ) : (
                      "Lancer l'analyse automatique"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {step === 2 && data && (
          <Card className="p-6 sm:p-8">
            {/* 1. Date de décision */}
            <div className="mb-4">
              <Label>Date de la décision</Label>
              <Input
                value={data.date_decision}
                onChange={(e) => setData({ ...data, date_decision: e.target.value })}
                className="font-arabic text-right"
                dir="rtl"
              />
            </div>

            {/* 2. Numéro de dossier */}
            <div className="mb-4">
              <Label>Numéro de dossier</Label>
              <Input
                value={data.numero_dossier}
                onChange={(e) => setData({ ...data, numero_dossier: e.target.value })}
                className="font-arabic text-right"
                dir="rtl"
              />
            </div>

            <div className="mb-6">
              <Label>Tribunal</Label>
              <Input
                value={data.tribunal}
                onChange={(e) => setData({ ...data, tribunal: e.target.value })}
                className="font-arabic text-right"
                dir="rtl"
              />
            </div>

            {/* 3. Mission (unifiée ici) */}
            <div className="mb-6">
              <Label>Mission (المهمة) — une ligne par tâche</Label>
              <Textarea
                value={mission.join("\n")}
                onChange={(e) => setMission(e.target.value.split("\n"))}
                className="font-arabic text-right min-h-[160px]"
                dir="rtl"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Cette mission apparaîtra en bas de chaque convocation (parties et avocats).
              </p>
            </div>

            {/* 4. Avocats */}
            {avocats.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Avocats ({avocats.length})</h3>
                  <Button size="sm" variant="outline" onClick={addAvocat}>
                    <UserPlus className="w-4 h-4 mr-1" /> Ajouter un avocat
                  </Button>
                </div>
                <div className="space-y-2">
                  {avocats.map((a) => (
                    <div key={a.id} className="p-3 rounded-lg border flex items-start gap-3">
                      <Checkbox
                        checked={selectedAvocats.has(a.id)}
                        onCheckedChange={() => toggleSelectAvocat(a.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 grid sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Nom</Label>
                          <Input
                            value={a.nom}
                            onChange={(e) => updateAvocat(a.id, { nom: e.target.value })}
                            className="font-arabic text-right"
                            dir="rtl"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Adresse</Label>
                          <Input
                            value={a.adresse}
                            onChange={(e) => updateAvocat(a.id, { adresse: e.target.value })}
                            className="font-arabic text-right"
                            dir="rtl"
                          />
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeAvocat(a.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Cochez un avocat pour générer une convocation à son adresse (au nom des parties qu'il représente).
                </p>
              </div>
            )}

            {/* 5. Destinataires (parties) */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">
                Destinataires ({selected.size} partie(s) + {selectedAvocats.size} avocat(s))
              </h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelected(new Set(parties.map((p) => p.id)));
                    setSelectedAvocats(new Set(avocats.map((a) => a.id)));
                  }}
                >
                  Tout sélectionner (parties + avocats)
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelected(new Set());
                    setSelectedAvocats(new Set());
                  }}
                >
                  Tout désélectionner
                </Button>
                <Button size="sm" variant="outline" onClick={addParty}>
                  + Ajouter
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {parties.map((p) => (
                <div
                  key={p.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    selected.has(p.id) ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleSelect(p.id)}
                      id={`p-${p.id}`}
                      className="mt-1"
                    />
                    <div className="flex-1 grid sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">
                          Nom complet
                          {p.source === "presence" && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">
                              بحضور {p.role ? `— ${p.role}` : ""}
                            </span>
                          )}
                        </Label>
                        <Input
                          value={p.nom_complet}
                          onChange={(e) => updateParty(p.id, { nom_complet: e.target.value })}
                          className="font-arabic text-right"
                          dir="rtl"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Adresse</Label>
                        <Input
                          value={p.adresse}
                          onChange={(e) => updateParty(p.id, { adresse: e.target.value })}
                          className="font-arabic text-right"
                          dir="rtl"
                        />
                      </div>
                      <div className="sm:col-span-2 flex items-end gap-3">
                        <div className="flex-1">
                          <Label className="text-xs">Avocat représentant</Label>
                          <Select
                            value={p.avocatId ?? NO_AVOCAT}
                            onValueChange={(v) =>
                              updateParty(p.id, { avocatId: v === NO_AVOCAT ? null : v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Aucun avocat" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_AVOCAT}>Aucun avocat</SelectItem>
                              {avocats.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.nom}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeParty(p.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-8">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Retour
              </Button>
              <Button
                onClick={() => {
                  if (totalSheets === 0) return toast.error("Sélectionnez au moins un destinataire.");
                  setStep(3);
                }}
              >
                Générer {totalSheets} convocation(s) <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && data && totalSheets > 0 && (
          <div>
            <Card className="p-4 mb-6 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <Label className="text-xs">Modèle de convocation</Label>
                <Select
                  value={currentTemplate?.id ?? ""}
                  onValueChange={setTemplateId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un modèle" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingTemplate(null);
                  setManagerOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> Nouveau
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!currentTemplate}
                onClick={() => {
                  setEditingTemplate(currentTemplate ?? null);
                  setManagerOpen(true);
                }}
              >
                <Pencil className="w-4 h-4 mr-1" /> Modifier
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!currentTemplate || templates.length <= 1}
                onClick={() => {
                  if (!currentTemplate) return;
                  if (!confirm(`Supprimer « ${currentTemplate.name} » ?`)) return;
                  remove(currentTemplate.id);
                  setTemplateId("");
                  toast.success("Modèle supprimé.");
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Supprimer
              </Button>
            </Card>

            {currentTemplate && (
              <Card className="p-4 mb-6">
                <div className="mb-2">
                  <Label className="text-sm font-semibold">
                    Éditer le modèle : {currentTemplate.name}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Modifications enregistrées automatiquement — l'aperçu se met à jour en direct.
                  </p>
                </div>
                <RichTextEditor
                  value={currentTemplate.content}
                  onChange={(html) => update(currentTemplate.id, { content: html })}
                />
              </Card>
            )}

            <div className="flex flex-wrap gap-3 justify-center mb-6">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Modifier
              </Button>
              <Button onClick={() => window.print()} variant="secondary">
                <Printer className="w-4 h-4 mr-2" /> Imprimer ({totalSheets})
              </Button>
              <Button onClick={downloadPdf}>
                <Download className="w-4 h-4 mr-2" /> Télécharger PDF
              </Button>
            </div>

            <div ref={sheetRef} className="print-area overflow-x-auto pb-8 space-y-8">
              {selectedParties.map((p, i) => {
                const vars = {
                  nom_destinataire: p.nom_complet,
                  adresse_destinataire: p.adresse,
                  avocat_bloc: buildAvocatBloc(p, parties, avocats, selected),
                  numero_dossier: data.numero_dossier,
                  date_decision: data.date_decision || todayFr(),
                  tribunal: data.tribunal,
                };
                const body = currentTemplate
                  ? renderTemplate(currentTemplate.content, vars)
                  : "";
                return (
                  <ConvocationSheet
                    key={p.id}
                    data={vars}
                    bodyHtml={body}
                    mission={mission}
                    pageNumber={i + 1}
                    totalPages={totalSheets}
                  />
                );
              })}
              {avocatSheets.map(({ avocat, destinataire, sousTitre }, i) => {
                const vars = {
                  nom_destinataire: destinataire,
                  adresse_destinataire: avocat.adresse,
                  avocat_bloc: sousTitre,
                  numero_dossier: data.numero_dossier,
                  date_decision: data.date_decision || todayFr(),
                  tribunal: data.tribunal,
                };
                const body = currentTemplate
                  ? renderTemplate(currentTemplate.content, vars)
                  : "";
                return (
                  <ConvocationSheet
                    key={`av-${avocat.id}`}
                    data={vars}
                    bodyHtml={body}
                    mission={mission}
                    sousTitre={sousTitre}
                    pageNumber={selectedParties.length + i + 1}
                    totalPages={totalSheets}
                  />
                );
              })}
            </div>
          </div>
        )}

        <TemplateManager
          open={managerOpen}
          onOpenChange={setManagerOpen}
          editing={editingTemplate}
          onSave={(name, content, id) => {
            if (id) {
              update(id, { name, content });
              toast.success("Modèle mis à jour.");
            } else {
              const t = create(name, content);
              setTemplateId(t.id);
              toast.success("Modèle créé.");
            }
          }}
        />
      </div>
      )}
    </div>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  const features = [
    { icon: Wand2, title: "Extraction IA", desc: "Gemini analyse l'arrêt et identifie parties, avocats et tribunal." , color: "from-indigo-500 to-purple-500" },
    { icon: Languages, title: "Arabe RTL natif", desc: "Rendu typographique soigné avec Cairo/Amiri, direction droite-à-gauche." , color: "from-emerald-500 to-teal-500" },
    { icon: ShieldCheck, title: "Validation humaine", desc: "Vérifiez et corrigez chaque champ avant impression." , color: "from-amber-500 to-orange-500" },
    { icon: Zap, title: "Génération instantanée", desc: "Une convocation par destinataire, prête à imprimer ou en PDF." , color: "from-rose-500 to-pink-500" },
  ];
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated background blobs */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-10 -left-20 w-96 h-96 bg-indigo-300/40 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-40 right-0 w-96 h-96 bg-rose-300/40 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-purple-300/40 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24">
        <div className="text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 backdrop-blur border border-indigo-200 text-indigo-700 text-xs font-semibold mb-6 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" /> Propulsé par l'IA Gemini
          </div>
          <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-tight">
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-500 bg-clip-text text-transparent">
              Convocations
            </span>
            <br />
            <span className="text-slate-900">d'expert, en un clic.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 mt-6 max-w-2xl mx-auto leading-relaxed">
            Transformez un arrêt judiciaire en arabe en convocations professionnelles,
            prêtes à imprimer — sans ressaisie, sans erreur.
          </p>

          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            <Button
              size="lg"
              onClick={onStart}
              className="h-14 px-8 text-base font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-xl hover:shadow-2xl transition-all hover:scale-105"
            >
              <Rocket className="w-5 h-5 mr-2" /> Démarrer l'application
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => document.getElementById("landing-features")?.scrollIntoView({ behavior: "smooth" })}
              className="h-14 px-8 text-base font-semibold border-2"
            >
              En savoir plus
            </Button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> PDF & Impression</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Modèles personnalisables</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Arabe RTL</span>
          </div>
        </div>

        <div id="landing-features" className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-24">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group relative p-6 rounded-2xl bg-white/80 backdrop-blur border border-white shadow-lg hover:shadow-2xl transition-all hover:-translate-y-1 animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white shadow-md mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 mb-1">{f.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-20 p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-rose-500 text-white text-center shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_20%,white_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Prêt à gagner du temps ?</h2>
            <p className="opacity-90 mb-6 max-w-xl mx-auto">
              Importez votre premier arrêt et laissez l'IA faire le reste.
            </p>
            <Button
              size="lg"
              onClick={onStart}
              className="h-14 px-10 text-base font-semibold bg-white text-indigo-700 hover:bg-slate-100 shadow-xl hover:scale-105 transition-all"
            >
              <Rocket className="w-5 h-5 mr-2" /> Commencer maintenant
            </Button>
          </div>
        </div>

        <footer className="text-center mt-16 text-xs text-slate-500">
          © {new Date().getFullYear()} IDP Juridique — Boutayeb Siham, Experte judiciaire.
        </footer>
      </div>
    </div>
  );
}

async function pdfToImages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  // Use worker via CDN to avoid bundler complications
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  const maxPages = Math.min(doc.numPages, 5);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return out;
}
