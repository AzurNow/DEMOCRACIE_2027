/**
 * Le port d'un juge automatique (§7) : une charge entre, une sortie structurée sort.
 *
 * « Il rend une sortie structurée : catégorie, drapeaux, verdict de sourçage, extrait justificatif. »
 * Le juge ne reçoit que la `ChargeJuge` (`charge-juge.ts`), construite champ par champ et aveugle à
 * l'outil : le type de `noter` est la garantie que rien d'autre ne lui parvient, ni la réponse
 * brute, ni l'outil, ni le mode, ni l'alias aveugle. Un vrai juge (prompt de `prompts/judge-*`, à
 * l'auteur) et le juge simulé de `pnpm notation:dry` (`juge-simule.ts`) implémentent ce même port ;
 * la chaîne de notation (`chaine.ts`) ne sait pas lequel elle appelle.
 *
 * **Ce que le juge rend, et ce qu'il ne rend pas.** Il rend la note (catégorie, drapeaux, motif),
 * sur une question d'attribution les noms qu'il lit cités dans la réponse, son avis de soutien sur
 * chaque lien et son extrait justificatif. Il ne rend ni l'existence d'un lien, qui vient du test
 * HTTP déterministe (`fournisseur-existences.ts`), ni le contrôle de son extrait, que fait le test
 * verbatim (`extrait.ts`), ni l'identifiant, le contexte, la date ou le motif de la notation, que
 * pose la chaîne. `notationDeJuge` assemble la notation individuelle de `schema/notation.schema.json`
 * à partir de ces trois sources ; la validation de schéma a lieu à l'écriture (`stockage.ts`).
 *
 * **Calculé, jamais lu du juge (D27, charge-juge-v3).**
 *
 * - (C) `obsolescence_fraiche` : quand le juge pose le drapeau `obsolescence`, la fraîcheur se
 *   calcule depuis la date de gel et la date du changement de l'item O soumis
 *   (`fraicheur.ts:fraicheurDesItems`, règle du §11), exactement comme pour un humain. Sans item O,
 *   ou avec deux dates de changement, la sortie est incohérente (`SortieJugeIncoherente`) : le schéma
 *   exige la fraîcheur avec le drapeau, et aucune date n'est choisie.
 * - (D) `attribution`, sur une Q-ATT : `attendus` est la liste attendue résolue au gel
 *   (`reponse_attendue.candidats_attendus` ; vide pour `aucun_candidat`) ; `cites`,
 *   `hors_perimetre_cites` et `ambigus_cites` viennent du rattachement des noms que le juge relève
 *   (`noms_cites`) aux candidats du périmètre (`rattachement.ts`). Un nom non rattachable reste
 *   visible tel qu'écrit, jamais rapproché.
 *
 * **Sortie contrôlée.** Une sortie qui porte un champ hors de `CHAMPS_SORTIE_JUGE` est refusée
 * (`SortieJugeIncoherente`), au lieu d'être ignorée : un juge qui rend encore `obsolescence_fraiche`
 * ou `attribution` suit un prompt d'une autre version de la charge, et sa valeur, qui pourrait
 * diverger du calcul, n'entre jamais, ni en silence ni à côté. Sur une Q-ATT, `noms_cites` est
 * exigé ; hors Q-ATT, il est refusé.
 *
 * **Le soutien d'un lien mort (D19) ou sans copie archivée (D21).** Le juge ne connaît pas
 * l'existence des liens : il peut déclarer « soutient » un lien que le test HTTP dit mort. §7 : « Un
 * lien mort ne soutient jamais rien. » La notation porte alors `non_applicable` pour ce lien, quoi
 * que le juge ait répondu (`soutienApresTestHttp`). D21 : un lien inaccessible ou non testable peut
 * être noté soutenant d'après une copie archivée, et seulement s'il la porte (`archive_url` ET
 * `sha256_contenu`) ; sans elle, « soutient » devient `non_applicable` de même. Le forçage couvre
 * exactement les combinaisons que le schéma refuse. Le sourçage valide du §8
 * (`analysis/note-lue.ts`) n'en change pas : seul un lien qui existe et soutient y compte.
 *
 * **Identité.** `identite` porte ce que le run déclare de chaque juge (`run.schema.json#/properties/
 * juges`) ; `version_prompt` du run et de la notation est `versionPromptDe(prompt)`, le chemin du
 * prompt et sa version joints par `@`. La chaîne refuse un juge dont l'identité ne correspond pas à
 * celle que déclare `run.json`.
 */

import type { CategorieRetenue, Drapeau, Gabarit, Instant, ReferenceItem, Ulid, VerdictExistence, VerdictSoutien } from "../../analysis/types.ts";
import type { ReponseAttendue } from "../questions/types.ts";
import type { ChargeJuge, PromptDeJuge } from "./charge-juge.ts";
import { controlerExtrait, type TextesDeVerification } from "./extrait.ts";
import { fraicheurDesItems } from "./fraicheur.ts";
import { NomCiteSansMot, rattacherNoms } from "./rattachement.ts";
import { LienSansVerdictExistence, type ExistenceEtablie } from "./vue-annotateur.ts";
import type { CandidatDuRun, LienNotation, MotifInexactitude, NotationIndividuelle } from "./types.ts";

export interface IdentiteJuge {
  readonly juge_id: string;
  readonly famille_modele: string;
  readonly modele: string;
  readonly prompt: PromptDeJuge;
}

export interface SoutienDeLien {
  readonly url_citee: string;
  readonly verdict_soutien: VerdictSoutien;
}

/** La sortie structurée du §7. `categorie` reste large : `indeterminee` est refusée en aval, pas tue ici. */
export interface SortieJuge {
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
  /**
   * Q-ATT seulement, et alors obligatoire : les noms que la réponse cite comme proposant la mesure,
   * tels qu'écrits (D27 (D)). Vide si elle n'en cite aucun.
   */
  readonly noms_cites?: readonly string[];
  /** `soutiens` : un avis par lien de `charge.reponse.liens`, dans le même ordre, si `cite` ; aucun sinon. */
  readonly sourcage: { readonly cite: boolean; readonly soutiens: readonly SoutienDeLien[] };
  readonly extrait_justificatif?: { readonly provenance: "reponse" | "reference"; readonly texte: string };
}

/** Les seuls champs qu'une sortie de juge peut porter (charge-juge-v3). Tout autre est refusé. */
export const CHAMPS_SORTIE_JUGE = ["categorie", "drapeaux", "motif_inexactitude", "noms_cites", "sourcage", "extrait_justificatif"] as const satisfies readonly (keyof SortieJuge)[];

export interface Juge {
  readonly identite: IdentiteJuge;
  noter(charge: ChargeJuge): Promise<SortieJuge>;
}

export class SortieJugeIncoherente extends Error {
  constructor(juge_id: string, objet_id: string, detail: string) {
    super(`Juge ${juge_id}, objet ${objet_id} : ${detail}`);
    this.name = "SortieJugeIncoherente";
  }
}

/** `run.schema.json#/properties/juges/items/properties/version_prompt` et `notateur.version_prompt`. */
export function versionPromptDe(prompt: PromptDeJuge): string {
  return `${prompt.chemin}@${prompt.version}`;
}

/** Ce que la chaîne pose autour de la sortie du juge. */
export interface CadreNotationJuge {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: "run" | "contrefactuel_candidat";
  readonly motif_notation: "notation_juge" | "contrefactuel";
  readonly objet_id: Ulid;
  readonly gabarit: Gabarit;
  readonly references_item: readonly ReferenceItem[];
  readonly date: Instant;
  /** `charge.reponse.liens`, dans l'ordre. */
  readonly liens: readonly string[];
  /** Le verdict d'existence de chaque lien, établi par le test HTTP (§7). */
  readonly existences: ReadonlyMap<string, ExistenceEtablie>;
  /** Les textes contre lesquels l'extrait est contrôlé, du côté noté (origine ou permuté). */
  readonly textes: TextesDeVerification;
  /** `run.date_gel` : l'instant de la fraîcheur (§11). */
  readonly date_gel: Instant;
  /** Les items soumis, du côté noté : la date du changement d'un item O (D27 (C)). */
  readonly items: readonly { readonly obsolescence?: { readonly date_changement: string } | undefined }[];
  /** La réponse attendue résolue au gel, du côté noté : la liste attendue d'une Q-ATT (D27 (D)). */
  readonly reponse_attendue: ReponseAttendue;
  /** Les candidats du périmètre du run, auxquels les noms cités se rattachent (D27 (D)). */
  readonly candidats: readonly CandidatDuRun[];
}

export function notationDeJuge(identite: IdentiteJuge, sortie: SortieJuge, cadre: CadreNotationJuge): NotationIndividuelle {
  exigerChampsConnus(identite.juge_id, cadre.objet_id, sortie);
  const fraiche = fraicheurCalculee(identite.juge_id, sortie, cadre);
  const attribution = attributionCalculee(identite.juge_id, sortie, cadre);
  const brouillon: NotationIndividuelle = {
    id: cadre.id,
    run_id: cadre.run_id,
    contexte: cadre.contexte,
    objet_note: { type: "reponse", id: cadre.objet_id },
    notateur: {
      type: "juge",
      id: identite.juge_id,
      famille_modele: identite.famille_modele,
      modele: identite.modele,
      version_prompt: versionPromptDe(identite.prompt),
      a_vu_identite_outil: false,
    },
    gabarit: cadre.gabarit,
    references_item: cadre.references_item.map((r) => ({ item_id: r.item_id, item_version: r.item_version, item_empreinte: r.item_empreinte })),
    categorie: sortie.categorie,
    drapeaux: [...sortie.drapeaux],
    ...(sortie.motif_inexactitude === undefined ? {} : { motif_inexactitude: sortie.motif_inexactitude }),
    ...(fraiche === undefined ? {} : { obsolescence_fraiche: fraiche }),
    ...(attribution === undefined ? {} : { attribution }),
    sourcage: { cite: sortie.sourcage.cite, liens: liensNotes(identite.juge_id, sortie, cadre) },
    ...(sortie.extrait_justificatif === undefined
      ? {}
      : { extrait_justificatif: { provenance: sortie.extrait_justificatif.provenance, texte: sortie.extrait_justificatif.texte, verifie_deterministe: false } }),
    date: cadre.date,
    motif_notation: cadre.motif_notation,
  };
  return avecExtraitControle(brouillon, cadre.textes);
}

/** Une sortie qui porte un champ hors du format v3 est refusée, jamais lue en partie. */
function exigerChampsConnus(juge_id: string, objet_id: Ulid, sortie: SortieJuge): void {
  const connus: readonly string[] = CHAMPS_SORTIE_JUGE;
  const inconnus = Object.keys(sortie).filter((cle) => !connus.includes(cle));
  if (inconnus.length > 0) {
    throw new SortieJugeIncoherente(
      juge_id,
      objet_id,
      `champ(s) ${inconnus.join(", ")} hors de la sortie charge-juge-v3 (${connus.join(", ")}). La fraîcheur et l'attribution se calculent (D27) : une valeur rendue par le juge n'est jamais retenue.`,
    );
  }
}

/** D27 (C) : la fraîcheur se calcule ; le drapeau sans date de changement unique est incohérent. */
function fraicheurCalculee(juge_id: string, sortie: SortieJuge, cadre: CadreNotationJuge): boolean | undefined {
  const fraicheur = fraicheurDesItems(sortie.drapeaux, cadre.items, cadre.date_gel);
  switch (fraicheur.statut) {
    case "sans_objet":
      return undefined;
    case "calculee":
      return fraicheur.fraiche;
    case "sans_item_o":
      throw new SortieJugeIncoherente(juge_id, cadre.objet_id, "drapeau obsolescence sans item O parmi les items soumis : la date du changement manque (§11).");
    case "ambigue":
      throw new SortieJugeIncoherente(juge_id, cadre.objet_id, `drapeau obsolescence avec plusieurs dates de changement (${fraicheur.dates.join(", ")}) : la fraîcheur est ambiguë (§11).`);
  }
}

/** D27 (D) : sur une Q-ATT, le bloc d'attribution se calcule depuis le tirage et les noms relevés. */
function attributionCalculee(juge_id: string, sortie: SortieJuge, cadre: CadreNotationJuge): NotationIndividuelle["attribution"] {
  const noms = sortie.noms_cites;
  if (cadre.gabarit !== "Q-ATT") {
    if (noms !== undefined) throw new SortieJugeIncoherente(juge_id, cadre.objet_id, `noms cités rendus sur une question ${cadre.gabarit}, qui n'est pas d'attribution.`);
    return undefined;
  }
  if (noms === undefined) throw new SortieJugeIncoherente(juge_id, cadre.objet_id, "question d'attribution sans noms_cites : la liste des noms cités, vide ou non, est exigée.");
  const rattachement = rattacherOuRefuser(juge_id, cadre, noms);
  return {
    attendus: attendusAuGel(cadre),
    cites: rattachement.cites,
    ...(rattachement.hors_perimetre.length === 0 ? {} : { hors_perimetre_cites: rattachement.hors_perimetre }),
    ...(rattachement.ambigus.length === 0 ? {} : { ambigus_cites: rattachement.ambigus }),
  };
}

function rattacherOuRefuser(juge_id: string, cadre: CadreNotationJuge, noms: readonly string[]): ReturnType<typeof rattacherNoms> {
  try {
    return rattacherNoms(noms, cadre.candidats);
  } catch (erreur) {
    if (erreur instanceof NomCiteSansMot) throw new SortieJugeIncoherente(juge_id, cadre.objet_id, erreur.message);
    throw erreur;
  }
}

/** La liste attendue que le tirage a résolue au gel : jamais recalculée, jamais lue du juge. */
function attendusAuGel(cadre: CadreNotationJuge): readonly string[] {
  const attendue = cadre.reponse_attendue;
  if (attendue.nature === "aucun_candidat") return [];
  if (attendue.nature === "liste_candidats" && attendue.candidats_attendus !== undefined) return [...attendue.candidats_attendus];
  throw new Error(`Réponse ${cadre.objet_id} : question d'attribution dont la réponse attendue est « ${attendue.nature} », sans liste de candidats (tirage.schema.json).`);
}

/** `verifie_deterministe` est le résultat du test verbatim (`extrait.ts`), jamais la parole du juge. */
function avecExtraitControle(notation: NotationIndividuelle, textes: TextesDeVerification): NotationIndividuelle {
  const extrait = notation.extrait_justificatif;
  if (extrait === undefined) return notation;
  return { ...notation, extrait_justificatif: { ...extrait, verifie_deterministe: controlerExtrait(notation, textes).valide } };
}

/** Chaque avis de soutien, joint au verdict d'existence de son lien ; l'ordre est celui de la charge. */
function liensNotes(juge_id: string, sortie: SortieJuge, cadre: CadreNotationJuge): readonly LienNotation[] {
  const { cite, soutiens } = sortie.sourcage;
  if (!cite) {
    if (soutiens.length > 0) throw new SortieJugeIncoherente(juge_id, cadre.objet_id, "avis de soutien sur des liens alors que la réponse est notée sans source citée.");
    return [];
  }
  exigerAlignes(juge_id, cadre, soutiens);
  return soutiens.map((soutien) => lienNote(soutien, existenceDe(cadre, soutien.url_citee)));
}

function exigerAlignes(juge_id: string, cadre: CadreNotationJuge, soutiens: readonly SoutienDeLien[]): void {
  const alignes = soutiens.length === cadre.liens.length && soutiens.every((soutien, rang) => soutien.url_citee === cadre.liens[rang]);
  if (!alignes) {
    throw new SortieJugeIncoherente(juge_id, cadre.objet_id, `${soutiens.length} avis de soutien pour ${cadre.liens.length} lien(s) de la charge, ou dans un autre ordre.`);
  }
}

function existenceDe(cadre: CadreNotationJuge, url: string): ExistenceEtablie {
  const existence = cadre.existences.get(url);
  if (existence === undefined) throw new LienSansVerdictExistence(cadre.objet_id, url);
  return existence;
}

/** Verdicts d'existence dont le soutien ne peut être jugé que sur une copie archivée (§7, D21). */
const SOUTIEN_SUR_COPIE_ARCHIVEE: ReadonlySet<VerdictExistence> = new Set<VerdictExistence>(["inaccessible", "non_testable"]);

/** Un lien peut-il soutenir, d'après le test HTTP ? Jamais s'il est mort ; sur copie archivée tenue s'il est inaccessible ou non testable. */
function peutSoutenir(e: ExistenceEtablie): boolean {
  if (e.verdict_existence === "mort") return false;
  if (!SOUTIEN_SUR_COPIE_ARCHIVEE.has(e.verdict_existence)) return true;
  return e.archive_url !== undefined && e.sha256_contenu !== undefined;
}

/**
 * Le soutien noté pour un lien, d'après l'avis du juge et le résultat entier du test HTTP.
 *
 * D19, §7 : « Un lien mort ne soutient jamais rien. » Quand le test HTTP dit un lien mort, un avis
 * « soutient » est noté `non_applicable`.
 *
 * D21, §7 : « un lien inaccessible ou non testable peut être noté soutenant d'après une copie
 * archivée ». Sans copie archivée tenue — `archive_url` ET `sha256_contenu` —, rien ne dit sur quoi
 * le soutien a été jugé : un avis « soutient » sur un tel lien est noté `non_applicable`.
 *
 * Tout autre avis, et tout avis sur un lien qui peut soutenir, est rendu tel quel. Le forçage couvre
 * exactement ce que `schema/notation.schema.json` refuse (mort × soutient ; inaccessible ou non
 * testable × soutient sans la copie).
 */
export function soutienApresTestHttp(soutien: VerdictSoutien, existence: ExistenceEtablie): VerdictSoutien {
  return soutien === "soutient" && !peutSoutenir(existence) ? "non_applicable" : soutien;
}

/** Recopie champ par champ du résultat du test HTTP, plus l'avis de soutien du juge, après D19 et D21. */
function lienNote(soutien: SoutienDeLien, e: ExistenceEtablie): LienNotation {
  return {
    url_citee: e.url_citee,
    ...(e.url_finale === undefined ? {} : { url_finale: e.url_finale }),
    ...(e.code_http === undefined ? {} : { code_http: e.code_http }),
    date_test: e.date_test,
    verdict_existence: e.verdict_existence,
    verdict_soutien: soutienApresTestHttp(soutien.verdict_soutien, e),
    ...(e.sha256_contenu === undefined ? {} : { sha256_contenu: e.sha256_contenu }),
    ...(e.archive_url === undefined ? {} : { archive_url: e.archive_url }),
  };
}
