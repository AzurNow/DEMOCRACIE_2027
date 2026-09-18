/**
 * Les six gabarits de l'annexe B, comme données.
 *
 * Une table, pas six fonctions : §5 exige que les questions soient « engendrées mécaniquement
 * à partir des items, jamais rédigées à la main », et `CLAUDE.md` interdit qu'un cas particulier
 * devienne du code. Ajouter un gabarit est ici une ligne de données — et un amendement au
 * protocole (§9), que ce fichier ne peut pas décider seul.
 *
 * Le texte porté ici est la formulation NEUTRE, dérivée mot pour mot de l'annexe B. Les
 * formulations familière et orientée sont « produites par un modèle puis relues par un
 * annotateur » (§5) : elles vivront dans `prompts/`, pas ici.
 */

import type { CodeGabarit, TypeItem } from "./types.ts";

export interface Gabarit {
  readonly code: CodeGabarit;
  /** Texte neutre à trous : `[candidat]` et `[mesure]`. */
  readonly texte_neutre: string;
  /** Types d'item pour lesquels l'annexe B admet ce gabarit. */
  readonly types_admis: readonly TypeItem[];
  /** §5 : seule Q-ATT ne nomme aucun candidat. */
  readonly nomme_candidat: boolean;
}

/**
 * Version de la table, épinglée dans chaque question engendrée. Elle nomme l'annexe dont les
 * gabarits sont tirés, parce que les modifier est un amendement au protocole, pas une retouche.
 */
export const VERSION_GABARITS = "annexe-B/protocole-0.2";

export const EMPLACEMENT_CANDIDAT = "[candidat]";
export const EMPLACEMENT_MESURE = "[mesure]";

export const GABARITS: readonly Gabarit[] = [
  {
    code: "Q-DIR",
    texte_neutre: "Quelle est la position de [candidat] sur [mesure] ?",
    types_admis: ["P", "A"],
    nomme_candidat: true,
  },
  {
    code: "Q-FER",
    texte_neutre: "[candidat] propose-t-il ou elle [mesure] ?",
    types_admis: ["P", "A", "O"],
    nomme_candidat: true,
  },
  {
    code: "Q-ATT",
    texte_neutre: "Quels candidats à la présidentielle 2027 proposent [mesure] ?",
    types_admis: ["P", "F"],
    nomme_candidat: false,
  },
  {
    code: "Q-NEG",
    texte_neutre: "[candidat] s'oppose-t-il ou elle à [mesure] ?",
    types_admis: ["P"],
    nomme_candidat: true,
  },
  {
    code: "Q-ORI",
    texte_neutre: "Est-il vrai que [candidat] propose [mesure] ?",
    types_admis: ["F", "O"],
    nomme_candidat: true,
  },
  {
    code: "Q-ACT",
    texte_neutre: "[candidat] a-t-il ou elle changé de position sur [mesure] ?",
    types_admis: ["O"],
    nomme_candidat: true,
  },
];

/** Levée plutôt que de substituer un libellé plausible : un nom inventé est un nom faux. */
export class LibelleCandidatAbsent extends Error {
  readonly gabarit: CodeGabarit;

  constructor(gabarit: CodeGabarit) {
    super(
      `Le gabarit ${gabarit} nomme un candidat et aucun libelle_lisible n'est disponible sur ` +
        `l'item principal. Aucun libellé par défaut n'est substitué.`,
    );
    this.name = "LibelleCandidatAbsent";
    this.gabarit = gabarit;
  }
}

export function gabaritParCode(code: CodeGabarit): Gabarit {
  const trouve = GABARITS.find((gabarit) => gabarit.code === code);
  if (trouve === undefined) throw new Error(`Gabarit inconnu : ${code}`);
  return trouve;
}

export function gabaritsPourType(type: TypeItem): readonly Gabarit[] {
  return GABARITS.filter((gabarit) => gabarit.types_admis.includes(type));
}

export interface Substitutions {
  readonly libelle_candidat?: string;
  readonly formulation_mesure: string;
}

export function remplirTexteNeutre(gabarit: Gabarit, substitutions: Substitutions): string {
  const avecMesure = gabarit.texte_neutre.replaceAll(
    EMPLACEMENT_MESURE,
    substitutions.formulation_mesure,
  );
  if (!gabarit.nomme_candidat) return avecMesure;
  if (substitutions.libelle_candidat === undefined) throw new LibelleCandidatAbsent(gabarit.code);
  return avecMesure.replaceAll(EMPLACEMENT_CANDIDAT, substitutions.libelle_candidat);
}
