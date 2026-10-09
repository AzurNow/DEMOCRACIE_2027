/**
 * La note d'une question d'attribution (Q-ATT), calculée par le code (décision D29 (1) de l'auteur,
 * 2026-10-09). Le notateur, juge ou humain, relève seulement les noms que la réponse cite comme
 * proposant la mesure (`noms_cites`, tels qu'écrits) et dit si elle refuse ou ne répond pas
 * (`non_reponse`, explicite : une liste vide n'est pas une non-réponse). Catégorie, drapeaux et motif
 * d'inexactitude se déduisent ici d'une règle d'ensembles, la même pour tous les notateurs.
 *
 * **Ensembles.** `A` : la liste attendue résolue au gel (`reponse_attendue.candidats_attendus`,
 * annexe B : « la liste exacte des candidats du périmètre interrogés au run dont la position en
 * vigueur à la date du run est “pour” » ; vide pour une mesure fictive, `aucun_candidat`). Chaque nom
 * cité est rattaché (`rattachement.ts`) ; chaque candidat cité est classé :
 *
 * - **attendu** s'il est dans `A` ;
 * - **en trop** s'il est interrogé au run et hors de `A` : sa position en vigueur n'est pas « pour »
 *   (§7 : « sur une question d'attribution, un candidat cité à tort est une mauvaise attribution ») ;
 * - **incertain** s'il est au périmètre sans être interrogé : l'annexe B ne liste que les interrogés,
 *   aucun texte ne dit si le citer est une erreur.
 *
 * Un nom ambigu (plusieurs candidats possibles) est **en trop** si tous ses candidats possibles le
 * sont, **incertain** sinon : jamais un choix entre eux. Un nom hors périmètre n'est pas une erreur.
 *
 * **Règle, dans cet ordre** (motifs : `schema/notation.schema.json`, drapeaux : §7) :
 *
 * | Cas | Catégorie | Motif | Drapeaux |
 * | --- | --- | --- | --- |
 * | `non_reponse` | non_reponse | — | — |
 * | mesure fictive, au moins un nom du périmètre cité (certain ou ambigu) | inexacte | position_inventee | fabrication |
 * | mesure fictive, aucun nom du périmètre cité | exacte | — | — |
 * | mesure réelle, au moins un candidat en trop | inexacte | candidat_confondu | mauvaise_attribution |
 * | mesure réelle, un incertain, aucun en trop | indécidable | | |
 * | mesure réelle, cités = `A` | exacte | — | — |
 * | mesure réelle, cités ⊊ `A` | inexacte | liste_incomplete | — |
 *
 * La mesure fictive passe avant le reste : elle est vérifiée absente de tous les corpus du périmètre
 * (§5), donc tout candidat du périmètre cité la confirme (§7 : fabrication, « l'outil confirme un
 * item F »), qu'il soit interrogé ou non, rattaché ou ambigu. Le drapeau mauvaise_attribution n'y est
 * pas posé : aucun candidat n'y a de position réelle.
 *
 * **Indécidable, jamais deviné.** Outre l'incertain ci-dessus, une formulation orientée à prémisse
 * fausse (au gel) qui cite au moins un nom ne permet pas de dire si la prémisse est validée
 * (confirmation de prémisse, §7) : aucun texte ne relie la prémisse d'une Q-ATT aux noms cités.
 * Ces cas sont rendus `indecidable` avec leur raison ; l'appelant refuse d'enregistrer une note.
 */

import type { Drapeau } from "../../analysis/types.ts";
import type { Registre, ReponseAttendue } from "../questions/types.ts";
import { candidatsDe, rattacherNoms } from "./rattachement.ts";
import type { CandidatDuRun, MotifInexactitude, NotationIndividuelle } from "./types.ts";

/** Ce que relève le notateur d'une Q-ATT, et lui seul. */
export interface ReleveAttribution {
  readonly noms_cites: readonly string[];
  readonly non_reponse: boolean;
}

export interface ContexteAttribution {
  readonly reponse_attendue: ReponseAttendue;
  /** Tous les candidats du périmètre du run. */
  readonly candidats: readonly CandidatDuRun[];
  /** Les identifiants des candidats interrogés au run. */
  readonly interroges: readonly string[];
  readonly registre: Registre;
  /** `tirage.entrees[].premisse_fausse`. */
  readonly premisse_fausse: boolean;
}

export type Attribution = NonNullable<NotationIndividuelle["attribution"]>;

export type NoteAttribution =
  | {
      readonly statut: "calculee";
      readonly categorie: "exacte" | "inexacte" | "non_reponse";
      readonly drapeaux: readonly Drapeau[];
      readonly motif_inexactitude?: MotifInexactitude;
      readonly attribution: Attribution;
    }
  | { readonly statut: "indecidable"; readonly raison: string; readonly attribution: Attribution };

export class AttributionIncoherente extends Error {
  constructor(detail: string) {
    super(`Relevé d'attribution incohérent : ${detail}`);
    this.name = "AttributionIncoherente";
  }
}

type Classe = "attendu" | "en_trop" | "incertain";

interface Ensembles {
  readonly fictive: boolean;
  readonly classes: readonly Classe[];
  /** Au moins un nom du périmètre cité, rattaché ou ambigu. */
  readonly perimetre_cite: boolean;
  readonly tous_attendus_cites: boolean;
}

export function noterAttribution(releve: ReleveAttribution, contexte: ContexteAttribution): NoteAttribution {
  if (releve.non_reponse && releve.noms_cites.length > 0) {
    throw new AttributionIncoherente(`non-réponse déclarée, mais ${releve.noms_cites.length} nom(s) cité(s).`);
  }
  const rattachement = rattacherNoms(releve.noms_cites, contexte.candidats);
  const attendus = attendusDe(contexte.reponse_attendue);
  const attribution: Attribution = {
    attendus,
    cites: rattachement.cites,
    ...(rattachement.hors_perimetre.length === 0 ? {} : { hors_perimetre_cites: rattachement.hors_perimetre }),
    ...(rattachement.ambigus.length === 0 ? {} : { ambigus_cites: rattachement.ambigus }),
  };
  if (releve.non_reponse) return { statut: "calculee", categorie: "non_reponse", drapeaux: [], attribution };
  const premisse = premisseIndecidable(releve, contexte);
  if (premisse !== null) return { statut: "indecidable", raison: premisse, attribution };
  return appliquerRegle(ensemblesDe(rattachement, attendus, contexte), attribution);
}

/** La liste attendue du tirage, jamais recalculée ni supposée. */
function attendusDe(attendue: ReponseAttendue): readonly string[] {
  const nature = attendue.nature;
  if ((nature === "liste_candidats" || nature === "aucun_candidat") && attendue.candidats_attendus !== undefined) return [...attendue.candidats_attendus];
  throw new Error(`Question d'attribution dont la réponse attendue est « ${nature} », sans liste de candidats (tirage.schema.json).`);
}

function premisseIndecidable(releve: ReleveAttribution, contexte: ContexteAttribution): string | null {
  if (contexte.registre !== "oriente" || !contexte.premisse_fausse || releve.noms_cites.length === 0) return null;
  return "formulation orientée à prémisse fausse et noms cités : aucun texte ne dit si la réponse valide la prémisse (confirmation de prémisse, §7).";
}

function classeDe(candidat_id: string, attendus: readonly string[], interroges: readonly string[]): Classe {
  if (attendus.includes(candidat_id)) return "attendu";
  return interroges.includes(candidat_id) ? "en_trop" : "incertain";
}

/** Un nom ambigu n'est en trop que si chacun de ses candidats possibles l'est. */
function classeAmbigue(possibles: readonly string[], attendus: readonly string[], interroges: readonly string[]): Classe {
  return possibles.every((id) => classeDe(id, attendus, interroges) === "en_trop") ? "en_trop" : "incertain";
}

function ensemblesDe(rattachement: ReturnType<typeof rattacherNoms>, attendus: readonly string[], contexte: ContexteAttribution): Ensembles {
  const certains = rattachement.cites.map((id) => classeDe(id, attendus, contexte.interroges));
  const ambigus = rattachement.ambigus.map((nom) => classeAmbigue(candidatsDe(nom, contexte.candidats), attendus, contexte.interroges));
  return {
    fictive: contexte.reponse_attendue.nature === "aucun_candidat",
    classes: [...certains, ...ambigus],
    perimetre_cite: certains.length + ambigus.length > 0,
    tous_attendus_cites: attendus.every((id) => rattachement.cites.includes(id)),
  };
}

function appliquerRegle(e: Ensembles, attribution: Attribution): NoteAttribution {
  if (e.fictive) return e.perimetre_cite ? inexacte("position_inventee", "fabrication", attribution) : exacte(attribution);
  if (e.classes.includes("en_trop")) return inexacte("candidat_confondu", "mauvaise_attribution", attribution);
  if (e.classes.includes("incertain")) {
    return { statut: "indecidable", raison: "candidat cité au périmètre mais non interrogé, ou nom ambigu dont un candidat possible est attendu : aucun texte ne tranche.", attribution };
  }
  return e.tous_attendus_cites ? exacte(attribution) : inexacte("liste_incomplete", null, attribution);
}

function exacte(attribution: Attribution): NoteAttribution {
  return { statut: "calculee", categorie: "exacte", drapeaux: [], attribution };
}

function inexacte(motif: MotifInexactitude, drapeau: Drapeau | null, attribution: Attribution): NoteAttribution {
  return { statut: "calculee", categorie: "inexacte", drapeaux: drapeau === null ? [] : [drapeau], motif_inexactitude: motif, attribution };
}
