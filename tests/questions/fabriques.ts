/**
 * Fabriques d'objets pour les tests du lot « questions, tirage, symétrie ».
 *
 * Écrites à côté de `tests/aides/fabriques.ts` plutôt que dedans : les objets d'ici sont des
 * questions, des tirages et des runs, que l'interface de validation ne connaît pas. La source
 * archivée, elle, est empruntée à l'existant — une seule définition.
 *
 * Aucun candidat réel, aucune position réelle, aucun libellé de mesure réel : les identifiants
 * sont ouvertement fictifs. Inventer une position attribuée à une personne réelle est interdit
 * sans réserve, et un fichier de test n'est pas une exception.
 */

import { createHash } from "node:crypto";
import { empreinteContenuNotant, sha256 } from "../../validation/domaine/empreinte.ts";
import type { Item, Mesure, Source } from "../../validation/domaine/types.ts";
import type {
  CandidatAuGel,
  CandidatNomme,
  CodeGabarit,
  Formulation,
  GraineTirage,
  ItemDeQuestion,
  Position,
  Question,
  Registre,
  RunAuGel,
  Theme,
} from "../../pipeline/questions/types.ts";
import type { QuestionEngendree } from "../../pipeline/questions/types.ts";
import { REGISTRES } from "../../pipeline/questions/types.ts";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { source } from "../aides/fabriques.ts";

const ALPHABET_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID déterministe dérivé d'une clé lisible : même clé, même identifiant, à chaque exécution. */
export function identifiant(cle: string): string {
  const octets = createHash("sha256").update(cle, "utf8").digest();
  let valeur = 0n;
  for (const octet of octets.subarray(0, 16)) valeur = (valeur << 8n) | BigInt(octet);
  const caracteres: string[] = [];
  for (let rang = 0; rang < 26; rang += 1) {
    caracteres.push(ALPHABET_CROCKFORD[Number(valeur % 32n)] as string);
    valeur /= 32n;
  }
  return caracteres.reverse().join("");
}

export interface OptionsMesure {
  readonly cle: string;
  readonly theme?: string;
  readonly libelle?: string;
  readonly formulation_canonique?: string;
  readonly fictive?: boolean;
}

export function mesure(options: OptionsMesure): Mesure {
  const libelle = options.libelle ?? `mesure ${options.cle}`;
  return {
    id: identifiant(`mesure:${options.cle}`),
    version: 1,
    empreinte: sha256(`mesure:${options.cle}`),
    libelle,
    theme: options.theme ?? "fiscalite_pouvoir_achat",
    formulation_canonique: options.formulation_canonique ?? libelle,
    fictive: options.fictive ?? false,
  };
}

export interface OptionsItem {
  readonly cle: string;
  readonly candidat_id: string;
  readonly mesure: Mesure;
  readonly position?: Position;
  readonly position_posterieure?: Position;
  readonly statut_validation?: Item["statut_validation"];
  readonly statut_contestation?: Item["statut_contestation"];
  readonly valide_du?: string;
  readonly valide_au?: string | null;
  readonly libelle_lisible?: string;
  readonly date_changement?: string;
  readonly tier?: Source["tier"];
}

function socle(options: OptionsItem): Omit<Item, "type" | "empreinte"> {
  return {
    id: identifiant(`item:${options.cle}`),
    version: 1,
    candidat_id: options.candidat_id,
    libelle_lisible: options.libelle_lisible ?? `Candidat ${options.candidat_id}`,
    mesure_id: options.mesure.id,
    mesure_version: options.mesure.version,
    statut_validation: options.statut_validation ?? "verifie",
    statut_contestation: options.statut_contestation ?? "aucune",
    valide_du: options.valide_du ?? "2026-09-01",
    valide_au: options.valide_au === undefined ? null : options.valide_au,
    validations: [],
    contestations: [],
    historique: [],
  };
}

function sceller(item: Omit<Item, "empreinte">): Item {
  const complet = { ...item, empreinte: "0".repeat(64) };
  return { ...complet, empreinte: empreinteContenuNotant(complet) };
}

export function itemP(options: OptionsItem): Item {
  return sceller({
    ...socle(options),
    type: "P",
    assertion: {
      position: options.position ?? "pour",
      paraphrase: `Paraphrase de ${options.mesure.libelle}.`,
      citation_verbatim: `Citation fictive portant sur ${options.mesure.libelle}.`,
      source: source(options.tier === undefined ? {} : { tier: options.tier }),
    },
  });
}

export function itemA(options: OptionsItem): Item {
  return sceller({
    ...socle(options),
    type: "A",
    absence: {
      source_couverture_theme: source(),
      corpus_examine: [
        { url: "https://demo.invalid/programme.pdf", sha256: "1".repeat(64), tier: "T1" },
      ],
      date_examen: "2026-09-04T10:00:00+02:00",
      reverifications: [],
    },
  });
}

export function itemO(options: OptionsItem): Item {
  return sceller({
    ...socle(options),
    type: "O",
    obsolescence: {
      date_changement: options.date_changement ?? "2026-11-03",
      etat_anterieur: {
        position: options.position ?? "pour",
        paraphrase: `État antérieur sur ${options.mesure.libelle}.`,
        citation_verbatim: `Citation antérieure sur ${options.mesure.libelle}.`,
        source: source(),
      },
      etat_posterieur: {
        position: options.position_posterieure ?? "contre",
        paraphrase: `État postérieur sur ${options.mesure.libelle}.`,
        citation_verbatim: `Citation postérieure sur ${options.mesure.libelle}.`,
        source: source(),
      },
      remplace_item_id: null,
    },
  });
}

export function itemF(options: OptionsItem): Item {
  return sceller({ ...socle(options), type: "F" });
}

/* ------------------------------------------------------------ contestations */

export type DecisionPanel = "maintien" | "correction" | "retrait" | "non_evaluabilite";

/** Une contestation arbitrée, au format de `item.schema.json` (contestations[].decision_panel). */
export function contestation(
  cle: string,
  decision: DecisionPanel,
  date: string,
): Record<string, unknown> {
  return {
    id: identifiant(`contestation:${cle}`),
    date_reception: "2026-09-25T09:00:00+02:00",
    texte: "Texte de contestation fictif.",
    contestataire_type: "campagne",
    decision_panel: { date, decision, motivation: "Motivation fictive du panel." },
  };
}

/** L'item, passé en « arbitree » avec ces contestations. L'empreinte ne couvre pas les statuts. */
export function arbitre(item: Item, contestations: readonly unknown[]): Item {
  return { ...item, statut_contestation: "arbitree", contestations };
}

/* --------------------------------------------------------------- questions */

function formulation(registre: Registre, texte: string): Formulation {
  const socleFormulation: Formulation = {
    id: identifiant(`formulation:${registre}:${texte}`),
    registre,
    texte,
    empreinte_texte: sha256(texte),
    production: { modele: "famille-x/modele-1", version_prompt: "prompts/reformulation-0.0.0" },
    relecture: {
      annotateur_id: "a2",
      date: "2026-11-18T15:00:00+01:00",
      sens_preserve: true,
    },
  };
  if (registre !== "oriente") return socleFormulation;
  return { ...socleFormulation, premisse_fausse: false };
}

/** Les trois formulations exigées par le §5, dérivées mécaniquement du texte neutre. */
export function formulations(texteNeutre: string): readonly Formulation[] {
  const variantes: Readonly<Record<Registre, string>> = {
    neutre: texteNeutre,
    familier: `Dis, ${texteNeutre}`,
    oriente: `Il paraît que oui : ${texteNeutre}`,
  };
  return REGISTRES.map((registre) => formulation(registre, variantes[registre]));
}

export interface OptionsQuestion {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  readonly candidat_id?: string;
  readonly items: readonly ItemDeQuestion[];
  readonly grappe_id: string;
  readonly texte_neutre: string;
}

export function question(options: OptionsQuestion): Question {
  const base = {
    id: options.id,
    gabarit: options.gabarit,
    items: options.items,
    grappe_id: options.grappe_id,
    formulations: formulations(options.texte_neutre),
    engendree_le: "2026-11-18T14:00:00+01:00",
    version_gabarits: "annexe-B-tests",
  };
  if (options.candidat_id === undefined) return base;
  return { ...base, candidat_id: options.candidat_id };
}

/* -------------------------------------------------------------------- run */

export interface OptionsCandidat {
  readonly candidat_id: string;
  readonly libelle?: string;
  readonly nom?: string;
  readonly statut_au_gel?: CandidatAuGel["statut_au_gel"];
  readonly items_p_verifies?: number;
  readonly sous_seuil?: boolean;
  readonly interroge?: boolean;
}

/**
 * Libellé et nom fictifs d'un candidat de test, saisis séparément comme dans un vrai périmètre
 * (aucun des deux n'est tiré de l'autre dans le code testé). Ils ne ressemblent à aucune mesure des
 * jeux de test : sinon la barrière « aucun nom de candidat dans les Q-ATT » rougirait par accident.
 */
export function nomme(candidat_id: string, libelle?: string, nom?: string): CandidatNomme {
  return {
    candidat_id,
    libelle: libelle ?? `Libellé ${candidat_id}`,
    nom: nom ?? `Nom-${candidat_id}`,
  };
}

/** Le périmètre nommé de candidats aux libellé et nom par défaut, pour `engendrer`. */
export function perimetre(candidat_ids: readonly string[]): readonly CandidatNomme[] {
  return candidat_ids.map((candidat_id) => nomme(candidat_id));
}

export function candidat(options: OptionsCandidat): CandidatAuGel {
  const effectif = options.items_p_verifies ?? 31;
  return {
    ...nomme(options.candidat_id, options.libelle, options.nom),
    statut_au_gel: options.statut_au_gel ?? "actif",
    items_p_verifies: effectif,
    sous_seuil: options.sous_seuil ?? effectif < 10,
    interroge: options.interroge ?? true,
  };
}

export function run(candidats: readonly CandidatAuGel[], date_gel = "2026-12-01T06:00:00+01:00"): RunAuGel {
  return {
    id: identifiant("run:test"),
    date_gel,
    perimetre: { candidats },
  };
}

export function graine(valeur = 20261201): GraineTirage {
  return {
    valeur,
    algorithme: "splitmix64-sha256-v1",
    bibliotheque: "banc-essai-2027/validation/domaine/alea.ts",
    version: "1",
  };
}

export const THEMES_DE_TEST: readonly Theme[] = ["fiscalite_pouvoir_achat", "retraites"];

/* ------------------------------------------------------- jeux d'engendrement */

/** Complète une question engendrée en objet `question` conforme au schéma (trois formulations). */
export function completer(engendree: QuestionEngendree): Question {
  const base: OptionsQuestion = {
    id: engendree.id,
    gabarit: engendree.gabarit,
    items: engendree.items,
    grappe_id: engendree.grappe_id,
    texte_neutre: engendree.texte_neutre,
  };
  if (engendree.candidat_id === undefined) return question(base);
  return question({ ...base, candidat_id: engendree.candidat_id });
}

export interface OptionsJeu {
  readonly candidats: readonly string[];
  readonly themes: readonly Theme[];
  readonly mesures_par_theme: number;
  /** Clés d'items à marquer contestés, pour les cas limites d'exclusion. */
  readonly contestes?: readonly string[];
  /** Thèmes absents pour ce candidat, pour produire des strates vides. */
  readonly themes_manquants?: Readonly<Record<string, readonly Theme[]>>;
}

export interface Jeu {
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly questions: readonly Question[];
}

/**
 * Jeu régulier : chaque candidat porte le même nombre d'items P par thème, sur les mêmes
 * mesures. C'est la seule configuration où la symétrie du §5 peut être verte ; les cas limites
 * la cassent ensuite délibérément, un axe à la fois.
 */
export function jeu(options: OptionsJeu): Jeu {
  const mesures = options.themes.flatMap((theme) =>
    Array.from({ length: options.mesures_par_theme }, (_, rang) =>
      mesure({ cle: `${theme}-${rang}`, theme, libelle: `mesure ${theme} numéro ${rang}` }),
    ),
  );
  const contestes = new Set(options.contestes ?? []);
  const items = options.candidats.flatMap((candidat_id) =>
    mesures
      .filter((referent) => !themeManquant(options, candidat_id, referent.theme))
      .map((referent) => {
        const cle = `${candidat_id}:${referent.id}`;
        return itemP({
          cle,
          candidat_id,
          mesure: referent,
          ...(contestes.has(cle) ? { statut_contestation: "contestee" as const } : {}),
        });
      }),
  );
  return {
    items,
    mesures,
    questions: engendrer(items, mesures, perimetre(options.candidats)).map(completer),
  };
}

function themeManquant(options: OptionsJeu, candidat_id: string, theme: string): boolean {
  const manquants = options.themes_manquants?.[candidat_id];
  return manquants !== undefined && (manquants as readonly string[]).includes(theme);
}
