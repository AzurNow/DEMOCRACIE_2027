/**
 * Fabriques de la relecture des formulations (D39, D42) : un jeu engendré par la vraie règle
 * (`entrees.ts:tachesDe`, qui appelle `engendrer` et construit la demande sur l'item courant), des
 * propositions conformes à `schema/proposition-formulation.schema.json`, et des cases de relecture.
 * Aucun candidat ni aucune mesure réels : identifiants et libellés fictifs.
 *
 * La mesure porte une apostrophe et des guillemets typographiques : ils doivent traverser la
 * proposition, la promotion et `data/` sans être touchés (cas limite 12).
 */

import { createHash } from "node:crypto";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import type { CodeGabarit, Item, Mesure, Position, QuestionEngendree } from "../../pipeline/questions/types.ts";
import { variablesDuPrompt } from "../../pipeline/reformulation/demande.ts";
import { tachesDe, type Tache } from "../../pipeline/reformulation/entrees.ts";
import { AUCUNE, type PositionDemandee } from "../../pipeline/reformulation/position-affirmee.ts";
import type { CasesRelecture } from "../../pipeline/reformulation/relecture.ts";
import type { PropositionFormulation } from "../../pipeline/reformulation/staging.ts";
import { identifiant, itemO, itemP, mesure, perimetre } from "../questions/fabriques.ts";

export const CANDIDAT = "demo-alpha";
export const LIBELLE = `Libellé ${CANDIDAT}`;
export const FORMULATION_MESURE = "la création d’un « jardin partagé » dans chaque collège";

export interface Jeu {
  readonly mesure: Mesure;
  readonly item: Item;
  readonly taches: readonly Tache[];
  readonly questions: readonly QuestionEngendree[];
}

function jeuDe(m: Mesure, item: Item): Jeu {
  const taches = tachesDe({ items: [item], mesures: [m], candidats: perimetre([CANDIDAT]) });
  return { mesure: m, item, taches, questions: taches.map((tache) => tache.question) };
}

export function mesureDuJeu(formulation_canonique = FORMULATION_MESURE): Mesure {
  return mesure({ cle: "jardin", formulation_canonique, theme: "education" });
}

/** Un item P de position `position` (par défaut « pour ») ; même identifiant quelle que soit la position. */
export function jeu(position: Position = "pour"): Jeu {
  const m = mesureDuJeu();
  return jeuDe(m, itemP({ cle: "jardin-alpha", candidat_id: CANDIDAT, mesure: m, position }));
}

/** Un item O : état antérieur `anterieur`, postérieur `posterieur` ; même identifiant quels que soient les états. */
export function jeuO(anterieur: Position, posterieur: Position): Jeu {
  const m = mesureDuJeu();
  return jeuDe(m, itemO({ cle: "jardin-o", candidat_id: CANDIDAT, mesure: m, position: anterieur, position_posterieure: posterieur }));
}

/** La question de ce gabarit et sa demande sur l'item courant. */
export function questionDe(taches: readonly Tache[], gabarit: CodeGabarit): Tache {
  const trouvee = taches.find((tache) => tache.question.gabarit === gabarit);
  if (trouvee === undefined) throw new Error(`Aucune question ${gabarit} dans le jeu.`);
  return trouvee;
}

/** La même tâche, sur un texte neutre qui n'est plus le courant (« texte d'avant »). */
export function surAutreTexte(tache: Tache, suffixe = " (texte d'avant)"): Tache {
  return { ...tache, question: { ...tache.question, texte_neutre: `${tache.question.texte_neutre}${suffixe}` } };
}

export interface OptionsProposition {
  readonly cle: string;
  readonly date?: string;
  readonly statut?: "acceptee" | "rejetee" | "echec_http";
  /** Texte neutre envoyé au modèle ; par défaut celui de la question (empreinte courante). */
  readonly texte_neutre?: string;
  readonly familier?: string;
  readonly oriente?: string;
  /** Position que porte la sortie orientée ; par défaut celle de la demande (absente pour AUCUNE). */
  readonly position_portee?: "pour" | "contre" | "conditionnel" | null;
  readonly version_gabarits?: string;
  readonly id?: string;
}

function porteeParDefaut(demandee: PositionDemandee): "pour" | "contre" | "conditionnel" | null {
  return demandee === AUCUNE ? null : demandee;
}

function issue(options: OptionsProposition, demandee: PositionDemandee, neutre: string): PropositionFormulation["issue"] {
  if (options.statut === "echec_http") return { statut: "echec_http" };
  if (options.statut === "rejetee") return { statut: "rejetee", motif: "json_invalide", detail: "Sortie non JSON." };
  const portee = options.position_portee === undefined ? porteeParDefaut(demandee) : options.position_portee;
  const oriente = options.oriente ?? `Il paraît que oui, c’est « sûr » : ${neutre}`;
  return {
    statut: "acceptee",
    familier: { texte: options.familier ?? `Dis, tu sais ? ${neutre}` },
    oriente: portee === null ? { texte: oriente } : { texte: oriente, position_affirmee: portee },
  };
}

/** Une proposition conforme au schéma, demandée comme `pnpm reformuler` la demanderait pour cette tâche. */
export function proposition(tache: Tache, options: OptionsProposition): PropositionFormulation {
  const { question } = tache;
  const texte_neutre = options.texte_neutre ?? question.texte_neutre;
  const { texte_neutre: _envoye_a_part, ...demande } = variablesDuPrompt(tache.demande);
  const statut_http = options.statut === "echec_http" ? 503 : 200;
  return {
    id: options.id ?? identifiant(`proposition:${options.cle}`),
    question_id: question.id,
    texte_neutre,
    empreinte_texte_neutre: sha256(texte_neutre),
    version_gabarits: options.version_gabarits ?? question.version_gabarits,
    // Comme `executer.ts:propositionDe` : les variables du prompt, gabarit et position typés.
    demande: { ...demande, gabarit: tache.demande.gabarit.code, position_affirmee: tache.demande.position_affirmee },
    production: { modele: "famille-x/modele-1", version_prompt: "prompts/reformulation-1.0.0" },
    appel: {
      date: options.date ?? "2026-11-02T10:15:00+01:00",
      statut_http,
      brut: { corps: options.cle },
      brut_octets_sha256: createHash("sha256").update(options.cle).digest("hex"),
    },
    issue: issue(options, tache.demande.position_affirmee, texte_neutre),
  };
}

export function toutCoche(): CasesRelecture {
  return { sens_preserve: { neutre: true, familier: true, oriente: true }, premisse_conforme: true };
}

/** Compteur d'ULID déterministes pour les formulations promues. */
export function identifiants(prefixe: string): () => string {
  let rang = 0;
  return () => {
    rang += 1;
    return identifiant(`${prefixe}:${rang}`);
  };
}

export const RELECTEUR = { annotateur_id: "a1", date: "2026-11-03T09:30:00+01:00" } as const;
