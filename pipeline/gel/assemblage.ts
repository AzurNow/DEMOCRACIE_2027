/**
 * Le gel d'un run, partie pure : des entrées déjà lues (`data/`, `config/`, le commit courant, les
 * graines) aux trois fichiers que `runs/<date>/` reçoit — `questions.json`, `tirage.json`,
 * `run.json` — au statut `planifie`. Aucune lecture, aucune écriture, aucun appel à Git ici :
 * `geler.ts` les fait, autour.
 *
 * Deux phases, séparées par la barrière de symétrie que l'appelant passe entre elles :
 *
 * 1. `preparer` : le périmètre au gel (`charger-perimetre.ts:construirePerimetre`, alias aveugles de
 *    `config/gel.json`), la fenêtre (`fenetre.ts:ouvrirFenetre`), et le jeu complet des questions
 *    engendrées au gel (`entrees.ts:tachesDe` puis `lecture-au-gel.ts:questionsAuGel`, qui refuse
 *    une question sans formulations relues sur son texte neutre et sa position courants). D44 :
 *    `engendree_le` de chaque question vaut `date_gel`, pour que deux gels du même commit donnent
 *    le même `questions.json`, octet pour octet. Rien ici ne dépend des graines ni de l'identifiant.
 * 2. `tirerAuGel` puis `fichiersDuGel` : le tirage (`tirage.ts:tirer`, graine du tirage, quotas du
 *    périmètre), puis, une fois la barrière passée, `run.json` qui référence `tirage.json` par son
 *    chemin et le SHA-256 de ses octets exacts. Chaque objet est validé contre son schéma avant
 *    d'être rendu.
 *
 * Le tirage dépend de l'identifiant du run : `tirage.ts:amorce` amorce le générateur avec la graine
 * ET `run.id`. Deux gels du même commit, mêmes graines, ne donnent donc le même `tirage.json` que
 * s'ils portent le même identifiant (voir `tests/gel/geler.test.ts`, cas 11).
 */

import { createHash } from "node:crypto";
import { validerFragment, valider } from "../../outils/schemas/valider.ts";
import { ouvrirFenetre } from "../interrogation/fenetre.ts";
import type { Fenetre } from "../interrogation/fenetre.ts";
import { dateParis, lireInstant } from "../interrogation/heure-paris.ts";
import { construirePerimetre } from "../questions/charger-perimetre.ts";
import type { PerimetreCharge } from "../questions/charger-perimetre.ts";
import { tirer } from "../questions/tirage.ts";
import type { ResultatTirage } from "../questions/tirage.ts";
import type { Item, Mesure, Question, RunAuGel, Symetrie, Tirage } from "../questions/types.ts";
import { tachesDe } from "../reformulation/entrees.ts";
import { questionsAuGel } from "../reformulation/lecture-au-gel.ts";
import type { FormulationsValidees } from "../reformulation/relecture.ts";
import type { ConfigurationGel, JugeAuGel } from "./configuration.ts";
import { grainesDuRun } from "./graines.ts";
import type { GrainesDuRun, ValeursDesGraines } from "./graines.ts";

/**
 * §7 : « 10 % par défaut, 25 % après retrait d'un juge pour biais contrefactuel ». Au gel, aucun
 * juge n'est retiré (le retrait suit le test contrefactuel) : le taux est celui du protocole sans
 * retrait, que `pipeline/notation/controle-croise.ts:tauxEchantillon` revérifie sur le run noté.
 */
export const TAUX_ECHANTILLON_SANS_RETRAIT = 0.1;

/** Le statut d'un run qui vient d'être gelé : il n'est ni lancé ni publié. */
export const STATUT_AU_GEL = "planifie";

/** Les noms des trois fichiers, dans l'ordre d'écriture. */
export const FICHIERS_DU_GEL = ["questions.json", "tirage.json", "run.json"] as const;
export type NomFichierDuGel = (typeof FICHIERS_DU_GEL)[number];

export interface FichierDuGel {
  readonly nom: NomFichierDuGel;
  readonly texte: string;
}

/** Les entrées lues par l'appelant, sans graines ni identifiant. */
export interface EntreesGel {
  /** Le YAML de `config/perimetre.yaml`, déjà lu, et sa provenance. */
  readonly perimetre_brut: unknown;
  readonly provenance_perimetre: string;
  readonly configuration: ConfigurationGel;
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  /** Le contenu de `data/formulations/`, par `question_id`. */
  readonly formulations: ReadonlyMap<string, FormulationsValidees>;
}

export interface GelPrepare {
  readonly perimetre: PerimetreCharge;
  readonly fenetre: Fenetre;
  /** Le jeu complet des questions engendrées au gel, triées par identifiant. */
  readonly questions: readonly Question[];
  /** `AAAA-MM-JJ` de `date_gel` à Paris : le nom du répertoire du run (`runs/README.md`). */
  readonly date_repertoire: string;
}

/** Phase 1 : périmètre, fenêtre, questions. Lève sur toute entrée qui ne permet pas de geler. */
export function preparer(entrees: EntreesGel): GelPrepare {
  const perimetre = construirePerimetre(
    entrees.perimetre_brut,
    { items: entrees.items, mesures: entrees.mesures, alias_aveugles: entrees.configuration.alias_aveugles },
    entrees.provenance_perimetre,
  );
  const fenetre = ouvrirFenetre(entrees.configuration.fenetre_debut);
  const taches = tachesDe({ items: entrees.items, mesures: entrees.mesures, candidats: perimetre.perimetre.candidats });
  const questions = questionsAuGel(taches, entrees.formulations, perimetre.date_gel);
  const date_repertoire = dateParis(lireInstant(perimetre.date_gel, `${entrees.provenance_perimetre}, date_gel`));
  return { perimetre, fenetre, questions, date_repertoire };
}

/** Ce que le tirage et la barrière lisent du run. */
export function runAuGel(prepare: GelPrepare, run_id: string): RunAuGel {
  return { id: run_id, date_gel: prepare.perimetre.date_gel, perimetre: { candidats: prepare.perimetre.perimetre.candidats } };
}

export interface GelTire {
  readonly run_id: string;
  readonly graines: GrainesDuRun;
  readonly resultat: ResultatTirage;
}

/** Phase 2a : le tirage, avec la graine du tirage et les quotas du périmètre. */
export function tirerAuGel(prepare: GelPrepare, entrees: EntreesGel, run_id: string, valeurs: ValeursDesGraines): GelTire {
  const graines = grainesDuRun(valeurs);
  const resultat = tirer({
    questions: prepare.questions,
    items: entrees.items,
    mesures: entrees.mesures,
    run: runAuGel(prepare, run_id),
    graine: graines.tirage,
    parametres: prepare.perimetre.parametres_tirage,
  });
  return { run_id, graines, resultat };
}

/** Ce qui s'inscrit dans `run.json` et ne vient ni du périmètre ni du tirage. */
export interface MetaDuRun {
  readonly type_run: string;
  /** HEAD au gel : `data/` est dans le même dépôt que le code (D41). */
  readonly commit: string;
  readonly symetrie: Symetrie;
}

/** Un fichier JSON du run : deux espaces d'indentation, une fin de ligne. */
export function texteJson(valeur: unknown): string {
  return `${JSON.stringify(valeur, null, 2)}\n`;
}

function sha256(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

/** D'abord retenu au gel : les kappas, le taux contrefactuel et le retrait viennent après. */
function jugeAuGel(juge: JugeAuGel) {
  return { ...juge, retire: false };
}

function runDuGel(prepare: GelPrepare, entrees: EntreesGel, tire: GelTire, meta: MetaDuRun, tirage_texte: string): unknown {
  const tirage = tire.resultat.tirage;
  return {
    id: tire.run_id,
    date_gel: prepare.perimetre.date_gel,
    fenetre: { debut: prepare.fenetre.debut, fin: prepare.fenetre.fin },
    type_run: meta.type_run,
    statut: STATUT_AU_GEL,
    versions: {
      protocole: entrees.configuration.version_protocole,
      code_commit: meta.commit,
      donnees_commit: meta.commit,
    },
    graines: tire.graines,
    perimetre: prepare.perimetre.perimetre,
    juges: entrees.configuration.juges.map(jugeAuGel),
    taux_echantillon_humain: TAUX_ECHANTILLON_SANS_RETRAIT,
    symetrie: { conditions: meta.symetrie.conditions, statut_global: meta.symetrie.statut_global },
    tirage: {
      chemin: `runs/${prepare.date_repertoire}/tirage.json`,
      sha256: sha256(tirage_texte),
      nombre_questions: tirage.entrees.length,
    },
  };
}

/**
 * Phase 2b, après la barrière : les trois fichiers, chacun validé contre son schéma. `run.json`
 * porte l'empreinte des octets exacts de `tirage.json` tel qu'il sera écrit.
 */
export function fichiersDuGel(prepare: GelPrepare, entrees: EntreesGel, tire: GelTire, meta: MetaDuRun): readonly FichierDuGel[] {
  const provenance = `gel du run ${tire.run_id}`;
  validerFragment<string>("run", "#/properties/type_run", meta.type_run, `${provenance}, type_run`);
  const tirage = valider<Tirage>("tirage", tire.resultat.tirage, `${provenance}, tirage.json`);
  const questions = prepare.questions.map((question) => valider<Question>("question", question, `${provenance}, question ${question.id}`));
  const tirage_texte = texteJson(tirage);
  const run = valider<unknown>("run", runDuGel(prepare, entrees, tire, meta, tirage_texte), `${provenance}, run.json`);
  return [
    { nom: "questions.json", texte: texteJson(questions) },
    { nom: "tirage.json", texte: tirage_texte },
    { nom: "run.json", texte: texteJson(run) },
  ];
}
