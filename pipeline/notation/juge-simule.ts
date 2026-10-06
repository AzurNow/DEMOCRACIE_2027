/**
 * Le juge simulé de `pnpm notation:dry` : il implémente le port `juge.ts` sans modèle ni réseau, et
 * ne juge aucun contenu.
 *
 * Il rend des notations valides (`schema/notation.schema.json`), déterministes, dont la répartition
 * est réglée par des poids en données, de façon à exercer tous les chemins de `decision.ts:decider`
 * qu'une notation sans humain peut atteindre : accord, accord partiel (D15), désaccord, drapeau
 * grave, extrait invalide. Ses particularités sont des données (`REGLES_JUGE_SIMULE`), sur le modèle
 * de `pipeline/interrogation/editeur-simule.ts:REGLES_SIMULE` : jamais un `if` sur un outil ou un
 * candidat.
 *
 * **Scénarios.** Les deux juges simulés d'un run partagent la graine et la table des poids
 * (`ParametresJugeSimule.repartition`), et chacun tient un rôle (`a` ou `b`). Pour une charge, le
 * scénario est tiré par SplitMix64 (`validation/domaine/alea.ts`), avec la graine dérivée de la
 * graine du juge simulé et de la clé `["juge_simule", "scenario", <contenu>]` (`analysis/graines.ts`) ;
 * chaque juge rend la note que le scénario attribue à son rôle. Les deux juges tirent donc le même
 * scénario pour la même charge, sans se parler.
 *
 * **Nature de la réponse.** Un refus de l'API (`refus_api`) a sa propre table : il n'a pas de texte,
 * et il est seul à porter le scénario « extrait invalide » dans la répartition de référence. Une
 * réponse tronquée est notée comme une autre (§8 : « notée sur ce qu'elle contient »).
 *
 * **Clé de contenu, et ce qu'elle ne lit pas.** La clé est la forme canonique de la question posée
 * (gabarit, texte), de la réponse soumise (texte, liens, troncature, refus) et de l'identité des
 * items soumis (identifiant, version, rôle, type) ; ni l'identifiant de la réponse, ni le
 * `candidat_id` des items, ni leurs textes. Une permutation des noms de candidats qui ne touche que
 * les items laisse donc la clé inchangée : le juge simulé n'est pas biaisé, sauf réglage.
 *
 * **Biais réglé.** Un juge peut déclarer un biais (`candidats`, `taux`) : quand un item soumis porte
 * l'un de ces `candidat_id`, sa note est remplacée par la note inverse (`REGLES_JUGE_SIMULE.biais`)
 * avec la probabilité `taux`, tirée avec la clé `["juge_simule", "biais", <juge>, <contenu>]`.
 * Comme le dérangement change le `candidat_id` des items, un biais de taux 1 change la note de
 * chaque paire du test contrefactuel qui touche ces candidats : c'est ce qui exerce le retrait.
 *
 * **Extrait.** L'extrait d'une note est le texte entier de la réponse soumise s'il n'est pas vide,
 * sinon la citation du premier item soumis : il figure donc dans la charge, et passe le test
 * verbatim. Le scénario « extrait invalide » cite `REGLES_JUGE_SIMULE.extrait_introuvable`, qui ne
 * figure nulle part.
 *
 * **Prompt.** Le juge simulé n'a pas de prompt (règle 6) : sa référence `simule://juge-simule`
 * dit qu'il est simulé, et ne désigne aucun fichier de `prompts/`.
 *
 * **Garde-fou.** `jugesSimules` refuse un répertoire de run sous `runs/` (`garde-simule.ts`).
 */

import { graineDerivee } from "../../analysis/graines.ts";
import type { CategorieRetenue, Drapeau, VerdictSoutien } from "../../analysis/types.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { generateur } from "../../validation/domaine/alea.ts";
import type { ChargeJuge } from "./charge-juge.ts";
import { comparerChaines } from "./echantillons.ts";
import { exigerHorsDeRuns } from "./garde-simule.ts";
import type { Juge, SortieJuge } from "./juge.ts";
import type { MotifInexactitude } from "./types.ts";

export type NatureReponse = "ordinaire" | "refus_api";
export type RoleSimule = "a" | "b";

interface NoteSimulee {
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
  /** L'avis de soutien rendu sur chaque lien de la réponse. */
  readonly soutien: VerdictSoutien;
  /** `source` : un extrait tiré de la charge ; `introuvable` : un extrait qui n'y figure pas. */
  readonly extrait: "source" | "introuvable";
}

const NOTES = {
  exacte: { categorie: "exacte", drapeaux: [], soutien: "soutient", extrait: "source" },
  inexacte_inventee: { categorie: "inexacte", drapeaux: [], motif_inexactitude: "position_inventee", soutien: "ne_soutient_pas", extrait: "source" },
  inexacte_omission: { categorie: "inexacte", drapeaux: [], motif_inexactitude: "omission", soutien: "ne_soutient_pas", extrait: "source" },
  inexacte_opposee: { categorie: "inexacte", drapeaux: [], motif_inexactitude: "position_opposee", soutien: "ne_soutient_pas", extrait: "source" },
  inexacte_attribution: {
    categorie: "inexacte",
    drapeaux: ["mauvaise_attribution"],
    motif_inexactitude: "candidat_confondu",
    soutien: "ne_soutient_pas",
    extrait: "source",
  },
  non_reponse: { categorie: "non_reponse", drapeaux: [], soutien: "non_applicable", extrait: "source" },
  non_reponse_extrait_introuvable: { categorie: "non_reponse", drapeaux: [], soutien: "non_applicable", extrait: "introuvable" },
} as const satisfies Readonly<Record<string, NoteSimulee>>;

type NomNote = keyof typeof NOTES;

/** Les particularités du juge simulé, en données. */
export const REGLES_JUGE_SIMULE = {
  prompt: { chemin: "simule://juge-simule", version: "1.0.0" },
  extrait_introuvable: "Extrait inventé par le juge simulé, absent de la réponse comme de la référence.",
  /** Ce que chaque scénario fait rendre à chaque rôle, par nature de réponse. */
  scenarios: {
    ordinaire: {
      accord: { a: "exacte", b: "exacte" },
      accord_partiel: { a: "inexacte_inventee", b: "inexacte_omission" },
      desaccord: { a: "exacte", b: "inexacte_omission" },
      drapeau_grave: { a: "inexacte_attribution", b: "inexacte_attribution" },
    },
    refus_api: {
      accord: { a: "non_reponse", b: "non_reponse" },
      extrait_invalide: { a: "non_reponse_extrait_introuvable", b: "non_reponse" },
    },
  },
  /** La note qu'un juge biaisé rend à la place de la sienne, selon sa catégorie. */
  biais: { exacte: "inexacte_opposee", inexacte: "exacte", non_reponse: "inexacte_opposee", indeterminee: "inexacte_opposee" },
} as const satisfies {
  readonly scenarios: Readonly<Record<NatureReponse, Readonly<Record<string, Readonly<Record<RoleSimule, NomNote>>>>>>;
  readonly biais: Readonly<Record<CategorieRetenue, NomNote>>;
  readonly prompt: { readonly chemin: string; readonly version: string };
  readonly extrait_introuvable: string;
};

export interface BiaisSimule {
  readonly candidats: readonly string[];
  /** Probabilité, dans [0, 1], qu'une charge touchant ces candidats reçoive la note inverse. */
  readonly taux: number;
}

export interface JugeSimuleDeclare {
  readonly juge_id: string;
  readonly famille_modele: string;
  readonly modele: string;
  readonly role: RoleSimule;
  /** `null` : aucun biais, déclaré comme tel. */
  readonly biais: BiaisSimule | null;
}

export interface ParametresJugeSimule {
  readonly graine: number;
  /** Poids entiers des scénarios, par nature de réponse ; chaque nom doit être un scénario des règles. */
  readonly repartition: Readonly<Record<NatureReponse, Readonly<Record<string, number>>>>;
  readonly juges: readonly JugeSimuleDeclare[];
}

export class JugeSimuleMalRegle extends Error {
  constructor(detail: string) {
    super(`Juge simulé mal réglé : ${detail}`);
    this.name = "JugeSimuleMalRegle";
  }
}

/** Les juges simulés d'un run de `notation:dry`, jamais pour un répertoire de `runs/`. */
export function jugesSimules(parametres: ParametresJugeSimule, repertoire_run: string): readonly Juge[] {
  exigerHorsDeRuns(repertoire_run);
  verifierRepartition(parametres.repartition);
  return parametres.juges.map((declare) => jugeSimule(declare, parametres));
}

function verifierRepartition(repartition: ParametresJugeSimule["repartition"]): void {
  for (const nature of ["ordinaire", "refus_api"] as const) {
    const poids = Object.entries(repartition[nature]);
    const connus: readonly string[] = Object.keys(REGLES_JUGE_SIMULE.scenarios[nature]);
    const inconnus = poids.filter(([nom]) => !connus.includes(nom)).map(([nom]) => nom);
    if (inconnus.length > 0) throw new JugeSimuleMalRegle(`scénario(s) ${inconnus.join(", ")} inconnu(s) pour ${nature}.`);
    if (!poids.every(([, p]) => Number.isInteger(p) && p >= 0)) throw new JugeSimuleMalRegle(`poids non entiers ou négatifs pour ${nature}.`);
    if (poids.reduce((total, [, p]) => total + p, 0) === 0) throw new JugeSimuleMalRegle(`aucun poids pour ${nature}.`);
  }
}

function jugeSimule(declare: JugeSimuleDeclare, parametres: ParametresJugeSimule): Juge {
  if (declare.biais !== null && !(declare.biais.taux >= 0 && declare.biais.taux <= 1)) {
    throw new JugeSimuleMalRegle(`taux de biais ${declare.biais.taux} du juge ${declare.juge_id} hors de [0, 1].`);
  }
  return {
    identite: { juge_id: declare.juge_id, famille_modele: declare.famille_modele, modele: declare.modele, prompt: REGLES_JUGE_SIMULE.prompt },
    noter: (charge) => Promise.resolve(noterSimule(charge, declare, parametres)),
  };
}

function noterSimule(charge: ChargeJuge, declare: JugeSimuleDeclare, parametres: ParametresJugeSimule): SortieJuge {
  if (charge.question.gabarit === "Q-ATT") {
    throw new JugeSimuleMalRegle("une question d'attribution (Q-ATT) exige un bloc attribution, que le juge simulé ne sait pas poser.");
  }
  const contenu = cleDeContenu(charge);
  const nature: NatureReponse = charge.reponse.refus_api ? "refus_api" : "ordinaire";
  const scenario = tirerScenario(parametres.repartition[nature], parametres.graine, contenu);
  const scenarios: Readonly<Record<string, Readonly<Record<RoleSimule, NomNote>>>> = REGLES_JUGE_SIMULE.scenarios[nature];
  const roles = scenarios[scenario];
  if (roles === undefined) throw new JugeSimuleMalRegle(`scénario ${scenario} absent des règles pour ${nature}.`);
  const nom = roles[declare.role];
  const retenue = estBiaise(charge, declare, parametres.graine, contenu) ? REGLES_JUGE_SIMULE.biais[NOTES[nom].categorie] : nom;
  return sortieDe(NOTES[retenue], charge);
}

/** Ce que la note du juge simulé peut lire : rien qui nomme un candidat ni désigne la réponse. */
function cleDeContenu(charge: ChargeJuge): string {
  return canoniser({
    question: { gabarit: charge.question.gabarit, texte: charge.question.texte },
    reponse: { texte: charge.reponse.texte, liens: charge.reponse.liens, troncature: charge.reponse.troncature, refus_api: charge.reponse.refus_api },
    references: charge.references.map((r) => ({ item_id: r.item_id, item_version: r.item_version, role: r.role, type: r.type })),
  });
}

function tirerScenario(poids: Readonly<Record<string, number>>, graine: number, contenu: string): string {
  const ranges = Object.entries(poids).sort(([a], [b]) => comparerChaines(a, b));
  const total = ranges.reduce((somme, [, p]) => somme + p, 0);
  let tire = generateur(graineDerivee(graine, ["juge_simule", "scenario", contenu])).entier(total);
  for (const [nom, p] of ranges) {
    if (tire < p) return nom;
    tire -= p;
  }
  throw new JugeSimuleMalRegle("tirage de scénario hors des poids.");
}

function estBiaise(charge: ChargeJuge, declare: JugeSimuleDeclare, graine: number, contenu: string): boolean {
  const biais = declare.biais;
  if (biais === null) return false;
  if (!charge.references.some((r) => biais.candidats.includes(r.candidat_id))) return false;
  return generateur(graineDerivee(graine, ["juge_simule", "biais", declare.juge_id, contenu])).flottant() < biais.taux;
}

function sortieDe(note: NoteSimulee, charge: ChargeJuge): SortieJuge {
  const cite = charge.reponse.liens.length > 0;
  const extrait = extraitDe(note, charge);
  return {
    categorie: note.categorie,
    drapeaux: note.drapeaux,
    ...(note.motif_inexactitude === undefined ? {} : { motif_inexactitude: note.motif_inexactitude }),
    sourcage: { cite, soutiens: cite ? charge.reponse.liens.map((url_citee) => ({ url_citee, verdict_soutien: note.soutien })) : [] },
    ...(extrait === null ? {} : { extrait_justificatif: extrait }),
  };
}

function extraitDe(note: NoteSimulee, charge: ChargeJuge): NonNullable<SortieJuge["extrait_justificatif"]> | null {
  if (note.extrait === "introuvable") return { provenance: "reponse", texte: REGLES_JUGE_SIMULE.extrait_introuvable };
  if (charge.reponse.texte.trim().length > 0) return { provenance: "reponse", texte: charge.reponse.texte };
  const citation = charge.references.flatMap((r) => (r.assertion === undefined ? [] : [r.assertion.citation_verbatim]))[0];
  if (citation !== undefined) return { provenance: "reference", texte: citation };
  if (note.categorie === "exacte") return null;
  throw new JugeSimuleMalRegle(`réponse ${charge.reponse_id} : ni texte ni citation de référence d'où tirer l'extrait qu'exige une note ${note.categorie}.`);
}
