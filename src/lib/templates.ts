import { useEffect, useState, useCallback } from "react";

export type ConvocationTemplate = {
  id: string;
  name: string;
  content: string; // HTML with {{nom}} {{adresse}} {{numeroDossier}} {{date}}
  createdAt: number;
};

const KEY = "convocation_templates_v1";

export const DEFAULT_TEMPLATE_HTML = `
<p>تحية و بعد،</p>
<p>بناءً على المهمة المسندة إلينا من طرف <span style="background:#fef08a">{{tribunal}}</span> بموجب الحكم الصادر في الملف عدد <span style="background:#fef08a">{{numero_dossier}}</span> بتاريخ <span style="background:#fef08a">{{date_decision}}</span>، يشرفنا إخباركم بأنه سيتم إجراء خبرة عقارية.</p>
<p><span style="background:#fef08a">{{avocat_bloc}}</span></p>
<p>يُرجى من السيد(ة) <strong><span style="background:#fef08a">{{nom_destinataire}}</span></strong> أو من ينوب عنه قانونياً الحضور إلى العنوان التالي: <span style="background:#fef08a">{{adresse_destinataire}}</span>.</p>
<p>يرجى التفضل بإحضار جميع الوثائق والمستندات المتعلقة بالملف.</p>
<p>وتقبلوا فائق التقدير والاحترام.</p>
`.trim();

function load(): ConvocationTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const arr = JSON.parse(raw) as ConvocationTemplate[];
    return Array.isArray(arr) && arr.length ? arr : seed();
  } catch {
    return seed();
  }
}

function seed(): ConvocationTemplate[] {
  const t: ConvocationTemplate[] = [
    {
      id: crypto.randomUUID(),
      name: "Convocation standard (Arabe)",
      content: DEFAULT_TEMPLATE_HTML,
      createdAt: Date.now(),
    },
  ];
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {}
  return t;
}

export function useTemplates() {
  const [templates, setTemplates] = useState<ConvocationTemplate[]>([]);

  useEffect(() => {
    setTemplates(load());
  }, []);

  const persist = useCallback((next: ConvocationTemplate[]) => {
    setTemplates(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const create = useCallback(
    (name: string, content: string) => {
      const t: ConvocationTemplate = {
        id: crypto.randomUUID(),
        name: name.trim() || "Nouveau modèle",
        content,
        createdAt: Date.now(),
      };
      persist([...templates, t]);
      return t;
    },
    [templates, persist],
  );

  const update = useCallback(
    (id: string, patch: Partial<ConvocationTemplate>) => {
      persist(templates.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [templates, persist],
  );

  const remove = useCallback(
    (id: string) => persist(templates.filter((t) => t.id !== id)),
    [templates, persist],
  );

  return { templates, create, update, remove };
}

export type TemplateVars = {
  nom_destinataire: string;
  adresse_destinataire: string;
  avocat_bloc: string;
  numero_dossier: string;
  date_decision: string;
  tribunal: string;
};

export function renderTemplate(html: string, vars: TemplateVars): string {
  const map: Record<string, string> = {
    nom_destinataire: escapeHtml(vars.nom_destinataire),
    adresse_destinataire: escapeHtml(vars.adresse_destinataire),
    avocat_bloc: escapeHtml(vars.avocat_bloc),
    numero_dossier: escapeHtml(vars.numero_dossier),
    date_decision: escapeHtml(vars.date_decision),
    tribunal: escapeHtml(vars.tribunal),
    // Legacy aliases
    nom: escapeHtml(vars.nom_destinataire),
    adresse: escapeHtml(vars.adresse_destinataire),
    numeroDossier: escapeHtml(vars.numero_dossier),
    date: escapeHtml(vars.date_decision),
  };
  return html.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(map, k) ? map[k] : "",
  );
}

function escapeHtml(s: string) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}