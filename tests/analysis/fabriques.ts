/**
 * Fabriques des tests d'analyse.
 *
 * Elles ne servent qu'à écrire des jeux de données minuscules dont le résultat se calcule sur
 * papier : chaque test pose ses effectifs, la fabrique remplit le reste avec des valeurs
 * neutres. Une valeur neutre de fabrique n'est jamais une valeur par défaut de production — le
 * code mesuré, lui, n'en a aucune.
 */

import { createHash } from "node:crypto";
import type {
  CandidatAuGel,
  EntreeTirage,
  Item,
  LectureComparateur,
  Notation,
  OutilAuGel,
  Question,
  Reponse,
  Run,
  Verdict,
} from "../../analysis/types.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Partiel où `undefined` signifie « champ absent », et non « champ à undefined » : les schémas
 * distinguent une réponse manquante (sans `normalise`) d'une réponse vide, et une Q-ATT (sans
 * `candidat_id`) d'une question dont le candidat serait inconnu.
 */
export type Partiel<T> = { [K in keyof T]?: T[K] | undefined };

function fusionner<T extends object>(base: T, partiel: Partiel<T>): T {
  const sortie = { ...base } as Record<string, unknown>;
  for (const [cle, valeur] of Object.entries(partiel)) {
    if (valeur === undefined) delete sortie[cle];
    else sortie[cle] = valeur;
  }
  return sortie as T;
}

/** ULID déterministe dérivé d'une clé lisible : les tests restent rejouables et diffusables. */
export function ulid(cle: string): string {
  const octets = createHash("sha256").update(cle, "utf8").digest();
  let sortie = "";
  for (let i = 0; i < 26; i += 1) {
    sortie += ALPHABET[(octets[i] as number) % ALPHABET.length];
  }
  return sortie;
}

/** Identifiant de question au format du schéma : `q_` suivi de 32 caractères hexadécimaux. */
export function idQuestion(cle: string): string {
  return `q_${createHash("sha256").update(cle, "utf8").digest("hex").slice(0, 32)}`;
}

export function empreinte(cle: string): string {
  return createHash("sha256").update(cle, "utf8").digest("hex");
}

const UNITE_NEUTRE: UniteAnalyse = {
  verdict_id: ulid("verdict-neutre"),
  reponse_id: ulid("reponse-neutre"),
  outil_id: "outil-alpha",
  mode: "web_desactivee",
  canal: "api",
  question_id: idQuestion("question-neutre"),
  grappe_id: ulid("grappe-neutre"),
  item_principal_id: ulid("grappe-neutre"),
  type_item_principal: "P",
  gabarit: "Q-DIR",
  candidat_id: "candidat-a",
  theme: "retraites",
  registre: "neutre",
  premisse_fausse: null,
  categorie: "exacte",
  drapeaux: [],
  obsolescence_fraiche: null,
  sourcage: { cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false },
  dans_echantillon_humain: false,
  tronquee: false,
};

export function unite(partiel: Partiel<UniteAnalyse> = {}): UniteAnalyse {
  return fusionner(UNITE_NEUTRE, partiel);
}

/** `n` unités identiques, pour poser un effectif sans répéter dix lignes. */
export function unites(n: number, partiel: Partiel<UniteAnalyse> = {}): UniteAnalyse[] {
  return Array.from({ length: n }, (_, i) =>
    unite({ ...partiel, verdict_id: ulid(`verdict-${JSON.stringify(partiel)}-${i}`) }),
  );
}

/** Une grappe de `n` unités partageant le même item principal. */
export function grappe(cle: string, n: number, partiel: Partiel<UniteAnalyse> = {}): UniteAnalyse[] {
  return unites(n, { ...partiel, grappe_id: ulid(cle), item_principal_id: ulid(cle) });
}

export function verdict(partiel: Partiel<Verdict> = {}): Verdict {
  return fusionner<Verdict>({
    id: ulid("verdict"),
    run_id: ulid("run"),
    contexte: "run",
    objet_note: { type: "reponse", id: ulid("reponse") },
    categorie_retenue: "exacte",
    drapeaux_retenus: [],
    sourcage_retenu: { cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false },
    dans_echantillon_humain: false,
    erreur_grave: false,
  }, partiel);
}

export function reponse(partiel: Partiel<Reponse> = {}): Reponse {
  return fusionner<Reponse>({
    id: ulid("reponse"),
    run_id: ulid("run"),
    contexte: "run",
    canal: "api",
    outil_id: "outil-alpha",
    mode: "web_desactivee",
    question_id: idQuestion("question"),
    formulation_id: ulid("formulation-neutre"),
    echantillon: 1,
    statut_reponse: "obtenue",
    normalise: { texte: "texte", liens: [], troncature: false },
  }, partiel);
}

export function question(partiel: Partiel<Question> = {}): Question {
  return fusionner<Question>({
    id: idQuestion("question"),
    gabarit: "Q-DIR",
    candidat_id: "candidat-a",
    items: [
      {
        reference: { item_id: ulid("item"), item_version: 1, item_empreinte: empreinte("item") },
        role: "principal",
      },
    ],
    grappe_id: ulid("item"),
    formulations: [
      { id: ulid("formulation-neutre"), registre: "neutre", empreinte_texte: empreinte("neutre") },
      { id: ulid("formulation-familiere"), registre: "familier", empreinte_texte: empreinte("familier") },
      {
        id: ulid("formulation-orientee"),
        registre: "oriente",
        empreinte_texte: empreinte("oriente"),
        premisse_fausse: true,
      },
    ],
  }, partiel);
}

export function item(partiel: Partiel<Item> = {}): Item {
  return fusionner<Item>({ id: ulid("item"), version: 1, type: "P", candidat_id: "candidat-a" }, partiel);
}

export function entreeTirage(partiel: Partiel<EntreeTirage> = {}): EntreeTirage {
  return fusionner<EntreeTirage>({
    question_id: idQuestion("question"),
    candidat_id: "candidat-a",
    theme: "retraites",
    gabarit: "Q-DIR",
  }, partiel);
}

export function candidat(partiel: Partiel<CandidatAuGel> = {}): CandidatAuGel {
  return fusionner<CandidatAuGel>({
    candidat_id: "candidat-a",
    statut_au_gel: "actif",
    items_p_verifies: 20,
    sous_seuil: false,
    interroge: true,
  }, partiel);
}

export function outil(partiel: Partiel<OutilAuGel> = {}): OutilAuGel {
  return fusionner<OutilAuGel>({
    outil_id: "outil-alpha",
    famille: "assistant",
    inclus: true,
    mode_de_tete: "web_desactivee",
  }, partiel);
}

export function run(partiel: Partiel<Run> = {}): Run {
  return fusionner<Run>({
    id: ulid("run"),
    date_gel: "2026-12-01T06:00:00+01:00",
    perimetre: { candidats: [candidat()], outils: [outil()] },
  }, partiel);
}

export function lectureComparateur(partiel: Partiel<LectureComparateur> = {}): LectureComparateur {
  return fusionner<LectureComparateur>({
    id: ulid("lecture"),
    run_id: ulid("run"),
    contexte: "run",
    outil_id: "comparateur-un",
    reference_item: { item_id: ulid("item"), item_version: 1, item_empreinte: empreinte("item") },
    affiche: true,
  }, partiel);
}

/** Notation humaine de l'échantillon de 10 %, exacte, sans lien : chaque test pose ce qui compte. */
export function notation(partiel: Partiel<Notation> = {}): Notation {
  return fusionner<Notation>({
    id: ulid("notation"),
    run_id: ulid("run"),
    contexte: "run",
    objet_note: { type: "reponse", id: ulid("reponse") },
    notateur: { type: "humain", id: "a1" },
    categorie: "exacte",
    drapeaux: [],
    sourcage: { cite: false, liens: [] },
    motif_notation: "echantillon_aleatoire_10",
  }, partiel);
}
