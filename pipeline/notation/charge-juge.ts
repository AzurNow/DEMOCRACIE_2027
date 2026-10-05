/**
 * La charge remise à un juge automatique (§7).
 *
 * « Chaque juge reçoit la question, la réponse telle que projetée par la fonction de normalisation
 * publiée et versionnée (texte, liens, citations), la réponse brute restant stockée intacte et
 * publiée, l'item de référence avec sa citation et ses dates de validité, la date du run, et la
 * grille. Il ne reçoit jamais l'identité de l'outil noté. »
 *
 * La charge est une donnée structurée, pas un prompt (règle 6) : le texte du prompt et la grille
 * vivent dans un fichier versionné de `prompts/`, que la charge désigne par le chemin et la version
 * reçus de l'appelant. Ce module n'écrit aucun texte destiné au modèle.
 *
 * **Aveuglement.** La charge est construite champ par champ, jamais par recopie d'un objet : aucun
 * champ de la réponse qui ne figure pas ci-dessous ne peut y passer. En sont exclus, et le type
 * `ChargeJuge` ne les a pas : `outil_id`, `alias_aveugle`, `mode`, `canal`, `metadonnees` (modèle
 * demandé et renvoyé, paramètres), `requete` (corps, en-têtes, point d'accès), et tout le brut
 * (`brut`, `brut_texte` et leurs empreintes, règle 7). L'alias aveugle n'est pas transmis non
 * plus : le juge n'en a pas besoin pour noter, et le plus restrictif est de ne rien lui donner qui
 * distingue deux outils. `appels_outils` de la projection, que le §7 ne cite pas, n'est pas
 * transmis. Le nom du candidat arrive par la question et par les textes de l'item, qui le portent ;
 * l'identifiant du candidat de chaque item est transmis, l'item le portant.
 *
 * **Normalisation.** La charge porte `reponse.normalisation` (la fonction de projection de
 * l'adaptateur et sa version) et la version de la normalisation du test verbatim
 * (`validation/domaine/normalisation.ts`, `VERSION_NORMALISATION`), contre laquelle son extrait
 * justificatif sera contrôlé (`extrait.ts`).
 */

import type { Gabarit, Instant, RoleItem } from "../../analysis/types.ts";
import type { ObjetJson, ReponseObtenue } from "../interrogation/types.ts";
import { VERSION_NORMALISATION } from "../../validation/domaine/normalisation.ts";
import type { EtatPositionnel, Item } from "../../validation/domaine/types.ts";

/** Version du format de la charge : un champ ajouté ou retiré la change. */
export const VERSION_CHARGE_JUGE = "charge-juge-v1";

export interface PromptDeJuge {
  /** Chemin d'un fichier de `prompts/`, fourni par l'appelant. */
  readonly chemin: string;
  readonly version: string;
}

export interface QuestionPosee {
  readonly gabarit: Gabarit;
  /** Le texte de la formulation interrogée, tel qu'envoyé à l'outil. */
  readonly texte: string;
}

export interface ReferenceSoumise {
  readonly item: Item;
  readonly role: RoleItem;
}

export interface DemandeCharge {
  readonly reponse: ReponseObtenue;
  readonly question: QuestionPosee;
  readonly references: readonly ReferenceSoumise[];
  /** `run.date_gel` : l'instant de référence unique du run. */
  readonly date_run: Instant;
  readonly prompt: PromptDeJuge;
}

export interface EtatSoumis {
  readonly position: string;
  readonly paraphrase: string;
  readonly citation_verbatim: string;
  /** Montant, taux, date ou périmètre de la position : ce qu'une déformation (§7) fausse. */
  readonly quantification?: unknown;
}

export interface ItemSoumis {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly role: RoleItem;
  readonly type: Item["type"];
  readonly candidat_id: string;
  readonly valide_du: string;
  readonly valide_au: string | null;
  readonly assertion?: EtatSoumis;
  readonly obsolescence?: {
    readonly date_changement: string;
    readonly etat_anterieur: EtatSoumis;
    readonly etat_posterieur: EtatSoumis;
  };
}

export interface ReponseSoumise {
  readonly texte: string;
  readonly liens: readonly string[];
  readonly citations?: readonly ObjetJson[];
  readonly troncature: boolean;
  readonly refus_api: boolean;
  readonly normalisation: { readonly fonction: string; readonly version: string };
}

export interface ChargeJuge {
  readonly version_charge: string;
  readonly prompt: PromptDeJuge;
  readonly date_run: Instant;
  /** Identifiant opaque (ULID) : il ne dit rien de l'outil (`reponse.schema.json`, `id`). */
  readonly reponse_id: string;
  readonly question: QuestionPosee;
  readonly reponse: ReponseSoumise;
  readonly references: readonly ItemSoumis[];
  /** Version de la normalisation du test verbatim qui contrôlera l'extrait justificatif. */
  readonly version_normalisation_verbatim: string;
}

export function construireCharge(demande: DemandeCharge): ChargeJuge {
  if (demande.references.length === 0) {
    throw new Error(`Réponse ${demande.reponse.id} : aucun item de référence, rien contre quoi noter (notation.schema.json, references_item).`);
  }
  return {
    version_charge: VERSION_CHARGE_JUGE,
    prompt: { chemin: demande.prompt.chemin, version: demande.prompt.version },
    date_run: demande.date_run,
    reponse_id: demande.reponse.id,
    question: { gabarit: demande.question.gabarit, texte: demande.question.texte },
    reponse: reponseSoumise(demande.reponse),
    references: demande.references.map(itemSoumis),
    version_normalisation_verbatim: VERSION_NORMALISATION,
  };
}

function reponseSoumise(reponse: ReponseObtenue): ReponseSoumise {
  const projection = reponse.normalise;
  return {
    texte: projection.texte,
    liens: [...projection.liens],
    ...(projection.citations === undefined ? {} : { citations: projection.citations }),
    troncature: projection.troncature,
    refus_api: projection.refus_api,
    normalisation: { fonction: reponse.normalisation.fonction, version: reponse.normalisation.version },
  };
}

function itemSoumis({ item, role }: ReferenceSoumise): ItemSoumis {
  return {
    item_id: item.id,
    item_version: item.version,
    item_empreinte: item.empreinte,
    role,
    type: item.type,
    candidat_id: item.candidat_id,
    valide_du: item.valide_du,
    valide_au: item.valide_au,
    ...(item.assertion === undefined ? {} : { assertion: etatSoumis(item.assertion) }),
    ...(item.obsolescence === undefined
      ? {}
      : {
          obsolescence: {
            date_changement: item.obsolescence.date_changement,
            etat_anterieur: etatSoumis(item.obsolescence.etat_anterieur),
            etat_posterieur: etatSoumis(item.obsolescence.etat_posterieur),
          },
        }),
  };
}

function etatSoumis(etat: EtatPositionnel): EtatSoumis {
  return {
    position: etat.position,
    paraphrase: etat.paraphrase,
    citation_verbatim: etat.citation_verbatim,
    ...(etat.quantification === undefined ? {} : { quantification: etat.quantification }),
  };
}
