import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  images: z.array(z.string().min(20)).min(1).max(10),
});

const SYSTEM_PROMPT = `Tu es un expert en analyse de documents juridiques marocains. Ton but est d'analyser l'image de l'arrêt de justice fourni et d'extraire les données de manière structurée.

Tu dois extraire :
1. numero_dossier (ملف رقم) : ex "2026/1402/107"
2. date_decision (بتاريخ) : ex "2026/04/15"
3. tribunal : ex "المحكمة الابتدائية المدنية بالدار البيضاء"
4. groupes_parties : tableau structuré des blocs de parties (المدعين / المدعى عليهم). Pour CHAQUE groupe :
   - avocat_nom : nom de l'avocat représentant le groupe (ex: "الأستاذ محمد سيباري"), vide si aucun avocat.
   - parties_representees : tableau [ { "nom_complet": "...", "adresse": "..." } ] pour chaque personne du groupe.
5. presence_autres : tableau des personnes citées dans "بحضور" (ex: السيد المحافظ على الأملاك العقارية) sous la forme [ { "nom_complet": "...", "role": "...", "adresse": "" } ].

Retourne UNIQUEMENT un objet JSON valide (sans markdown) :
{
  "numero_dossier": "...",
  "date_decision": "...",
  "tribunal": "...",
  "groupes_parties": [
    { "avocat_nom": "...", "parties_representees": [ { "nom_complet": "...", "adresse": "..." } ] }
  ],
  "presence_autres": [ { "nom_complet": "...", "role": "...", "adresse": "" } ]
}`;

export type ExtractedData = {
  numero_dossier: string;
  date_decision: string;
  tribunal: string;
  groupes_parties: {
    avocat_nom: string;
    parties_representees: { nom_complet: string; adresse: string }[];
  }[];
  presence_autres: { nom_complet: string; role: string; adresse: string }[];
};

export const extractDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<ExtractedData> => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY manquante dans le fichier .env");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        // Recommandé par OpenRouter, optionnel mais utile pour les stats/rate-limits
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "IDP Convocation App",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // ajuste selon le modèle OpenRouter souhaité
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SYSTEM_PROMPT },
              ...data.images.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Erreur OpenRouter brute:", res.status, errText);
      if (res.status === 429) throw new Error("Trop de requêtes. Réessayez plus tard.");
      if (res.status === 402) throw new Error(`Erreur 402 OpenRouter: ${errText.slice(0, 300)}`);
      throw new Error(`Erreur IA (${res.status}): ${errText.slice(0, 300)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let text = (json.choices?.[0]?.message?.content ?? "").trim();
    // strip markdown fences if any
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);

    try {
      const parsed = JSON.parse(text);
      const groupes = Array.isArray(parsed.groupes_parties)
        ? parsed.groupes_parties.map((g: { avocat_nom?: unknown; parties_representees?: unknown }) => ({
            avocat_nom: String(g.avocat_nom ?? ""),
            parties_representees: Array.isArray(g.parties_representees)
              ? g.parties_representees.map((p: { nom_complet?: unknown; adresse?: unknown }) => ({
                  nom_complet: String(p.nom_complet ?? ""),
                  adresse: String(p.adresse ?? ""),
                }))
              : [],
          }))
        : Array.isArray(parsed.parties)
          ? [
              {
                avocat_nom: "",
                parties_representees: parsed.parties.map((p: { nom_complet?: unknown; adresse?: unknown }) => ({
                  nom_complet: String(p.nom_complet ?? ""),
                  adresse: String(p.adresse ?? ""),
                })),
              },
            ]
          : [];
      return {
        numero_dossier: String(parsed.numero_dossier ?? ""),
        date_decision: String(parsed.date_decision ?? ""),
        tribunal: String(parsed.tribunal ?? ""),
        groupes_parties: groupes,
        presence_autres: Array.isArray(parsed.presence_autres)
          ? parsed.presence_autres.map((p: { nom_complet?: unknown; role?: unknown; adresse?: unknown }) => ({
              nom_complet: String(p.nom_complet ?? ""),
              role: String(p.role ?? ""),
              adresse: String(p.adresse ?? ""),
            }))
          : [],
      };
    } catch {
      throw new Error("Réponse IA invalide: " + text.slice(0, 200));
    }
  });