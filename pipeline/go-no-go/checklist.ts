/**
 * La checklist de run de l'annexe F (« exécutée par le pipeline, puis contresignée par l'auteur »),
 * `runs/<date>/checklist.json`, `schema/checklist.schema.json` (D24 (4)).
 *
 * Les dix cases, dans l'ordre et avec le texte exact du protocole, sont des données : chacune est
 * `calculee` (son état découle des critères du §12 qu'elle cite et, pour deux d'entre elles, d'un
 * constat lu sur les fichiers du run) ou `declaree` (rien dans les fichiers ne la rend décidable :
 * l'auteur la déclare au contreseing). Le pipeline écrit la checklist sans contreseing, et sans état
 * pour les cases déclarées : il ne déclare rien à la place de l'auteur.
 *
 * Une case calculée est `faite` si tous ses appuis le sont ; sinon `non_faite`, avec un motif qui
 * nomme chaque appui manquant. Une case dont une partie du texte n'a aucun appui calculable (par
 * exemple « Items d'absence revérifiés », « robustesse calculée ») ne la vérifie pas : c'est signalé
 * à l'auteur, pas comblé ici.
 */

import { canoniser } from "../../validation/domaine/empreinte.ts";
import type { Ulid } from "../../analysis/types.ts";
import type { CodeCritere, Critere } from "./types.ts";

export type NatureCase = "calculee" | "declaree";
export type EtatCase = "faite" | "non_faite";

/** Ce qu'une case calculée lit hors des sept critères. */
export type NomConstat = "graine_du_tirage_enregistree" | "notation_complete";
export type Appui = CodeCritere | NomConstat;

export interface Constat {
  readonly nom: NomConstat;
  readonly fait: boolean;
  /** Ce qui manque, quand le constat n'est pas fait. */
  readonly detail: string;
}

export interface CaseChecklist {
  readonly rang: number;
  readonly texte: string;
  readonly nature: NatureCase;
  readonly appuis?: readonly Appui[];
  readonly etat?: EtatCase;
  readonly motif?: string;
}

export interface Contreseing {
  readonly nom: string;
  readonly date: string;
}

export interface Checklist {
  readonly run_id: Ulid;
  readonly cases: readonly CaseChecklist[];
  readonly contreseing?: Contreseing;
}

interface ModeleCase {
  readonly texte: string;
  readonly nature: NatureCase;
  readonly appuis: readonly Appui[];
}

/** Annexe F, mot pour mot, dans l'ordre (tests/go-no-go/checklist.test.ts le relit dans le protocole). */
export const CASES_ANNEXE_F: readonly ModeleCase[] = [
  { texte: "Périmètre candidats et outils conforme aux règles de la section 3 à la date de gel", nature: "declaree", appuis: [] },
  { texte: "Items d'absence revérifiés ; aucun item contesté ou en attente dans le tirage", nature: "calculee", appuis: ["aucun_item_conteste_dans_le_tirage"] },
  { texte: "Tests de symétrie verts ; graine du tirage enregistrée", nature: "calculee", appuis: ["tests_symetrie", "graine_du_tirage_enregistree"] },
  {
    texte: "Interrogation dans la fenêtre de 48 h ; réponses manquantes ≤ 20 % par outil et par mode, sur le canal API",
    nature: "calculee",
    appuis: ["reponses_manquantes"],
  },
  {
    texte: "Notation par les deux juges ; désaccords, échantillon de 10 % et erreurs graves notés par des humains",
    nature: "calculee",
    appuis: ["notation_complete", "erreurs_graves_revues"],
  },
  { texte: "Kappa juges-humains ≥ 0,75 ; test contrefactuel ≤ 3 %", nature: "calculee", appuis: ["kappa_juges_humains", "test_contrefactuel"] },
  { texte: "Analyses préenregistrées exécutées avec la graine publiée ; robustesse calculée", nature: "calculee", appuis: ["analyses_preenregistrees_executees"] },
  { texte: "Note éditoriale rédigée ; phrase d'avertissement de la section 8 en tête", nature: "declaree", appuis: [] },
  { texte: "Données, réponses brutes, notations, code et rapport publiés ensemble ; DOI émis", nature: "declaree", appuis: [] },
  { texte: "Éditeurs et campagnes notifiés après publication", nature: "declaree", appuis: [] },
];

/* ------------------------------------------------------------------ constats */

/** « graine du tirage enregistrée » : `tirage.json` porte la graine de `run.json#/graines/tirage`. */
export function constatGraineDuTirage(graine_du_run: unknown, graine_du_fichier: unknown): Constat {
  const nom = "graine_du_tirage_enregistree";
  if (graine_du_fichier === undefined) return { nom, fait: false, detail: "tirage.json absent du répertoire du run" };
  if (canoniser(graine_du_fichier) !== canoniser(graine_du_run)) {
    return { nom, fait: false, detail: "la graine de tirage.json diffère de run.json#/graines/tirage" };
  }
  return { nom, fait: true, detail: "" };
}

/** Toute réponse obtenue du run a son verdict : aucune n'attend plus un juge ni un humain (§7). */
export function constatNotationComplete(reponses_obtenues: readonly Ulid[], objets_decides: ReadonlySet<Ulid>): Constat {
  const sans = reponses_obtenues.filter((id) => !objets_decides.has(id)).length;
  if (sans === 0) return { nom: "notation_complete", fait: true, detail: "" };
  return { nom: "notation_complete", fait: false, detail: `${sans} réponse(s) obtenue(s) sans verdict` };
}

/* ------------------------------------------------------------------ construction */

function manquesDe(appuis: readonly Appui[], criteres: readonly Critere[], constats: readonly Constat[]): readonly string[] {
  return appuis.flatMap((appui) => {
    const critere = criteres.find((c) => c.code === appui);
    if (critere !== undefined) return critere.statut === "vert" ? [] : [`critère ${appui} au rouge`];
    const constat = constats.find((c) => c.nom === appui);
    if (constat === undefined) throw new Error(`Appui ${appui} de la checklist sans critère ni constat : la case ne serait pas décidée.`);
    return constat.fait ? [] : [constat.detail];
  });
}

function caseCalculee(rang: number, modele: ModeleCase, criteres: readonly Critere[], constats: readonly Constat[]): CaseChecklist {
  const socle = { rang, texte: modele.texte, nature: modele.nature, appuis: modele.appuis };
  const manques = manquesDe(modele.appuis, criteres, constats);
  if (manques.length === 0) return { ...socle, etat: "faite" };
  return { ...socle, etat: "non_faite", motif: `${manques.join(" ; ")}.` };
}

/** La checklist que le pipeline écrit : sans contreseing, les cases déclarées sans état. */
export function construireChecklist(run_id: Ulid, criteres: readonly Critere[], constats: readonly Constat[]): Checklist {
  const cases = CASES_ANNEXE_F.map((modele, indice) =>
    modele.nature === "declaree" ? { rang: indice + 1, texte: modele.texte, nature: modele.nature } : caseCalculee(indice + 1, modele, criteres, constats),
  );
  return { run_id, cases };
}

/**
 * La part d'une checklist que le pipeline produit : ce que le contreseing ajoute (le contreseing
 * lui-même, l'état et le motif des cases déclarées) en est retiré. Sert à comparer une checklist
 * déjà écrite, éventuellement contresignée, au recalcul.
 */
export function partDuPipeline(checklist: Checklist): Checklist {
  const cases = checklist.cases.map((c) => (c.nature === "declaree" ? { rang: c.rang, texte: c.texte, nature: c.nature } : c));
  return { run_id: checklist.run_id, cases };
}
