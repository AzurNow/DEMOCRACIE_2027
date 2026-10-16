/**
 * Lecture stricte de la sortie brute d'un modèle extracteur.
 *
 * Contrat : `prompts/extraction-1.0.0.md`, « Sortie attendue » — un seul objet JSON, sans texte
 * autour, sans bloc de code Markdown, de la forme exacte de `schema/sortie-extraction.schema.json`.
 * « Une sortie qui n'est pas un JSON conforme est rejetée en entier, jamais réparée. »
 *
 * La chaîne reçue n'est ni modifiée, ni nettoyée, ni déballée d'un bloc de code, ni tronquée
 * (règle 7) : elle est lue telle quelle par `JSON.parse`, qui refuse tout texte autour d'un JSON.
 * Une clé répétée dans un même objet, que `JSON.parse` garderait en silence, rejette aussi la
 * sortie (`pipeline/reformulation/cles-dupliquees.ts`, réutilisé). Un rejet est une donnée, rendue
 * avec son motif : c'est la sortie d'un modèle qui est fausse, pas l'appel du code.
 */

import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { premiereCleDupliquee } from "../reformulation/cles-dupliquees.ts";
import type { SortieExtraction } from "./types.ts";

export type MotifRejetSortie = "bloc_de_code" | "json_invalide" | "cle_dupliquee" | "non_conforme";

export type LectureSortie =
  | { readonly ok: true; readonly sortie: SortieExtraction }
  | { readonly ok: false; readonly motif: MotifRejetSortie; readonly detail: string };

const BLOC_DE_CODE = /^\s*```/u;

function rejet(motif: MotifRejetSortie, detail: string): LectureSortie {
  return { ok: false, motif, detail };
}

type Analyse = { readonly ok: true; readonly valeur: unknown } | { readonly ok: false; readonly detail: string };

function analyser(brut: string): Analyse {
  try {
    return { ok: true, valeur: JSON.parse(brut) as unknown };
  } catch (erreur) {
    return { ok: false, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

export function lireSortie(brut: string): LectureSortie {
  if (BLOC_DE_CODE.test(brut)) return rejet("bloc_de_code", "la sortie commence par un bloc de code Markdown.");
  const analyse = analyser(brut);
  if (!analyse.ok) return rejet("json_invalide", analyse.detail);
  const repetee = premiereCleDupliquee(brut);
  if (repetee !== null) return rejet("cle_dupliquee", `la clé « ${repetee} » figure deux fois dans un même objet.`);
  const erreur = erreurDeSchema("sortie-extraction", analyse.valeur, "sortie du modèle");
  if (erreur !== null) return rejet("non_conforme", erreur.message);
  return { ok: true, sortie: analyse.valeur as SortieExtraction };
}
