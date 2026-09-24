/**
 * `pnpm symmetry` en ligne de commande (revue du 2026-09-23, constats 2 et 9), cas limite 7 du
 * brief : la barrière bloquante ne sort plus en succès sans avoir contrôlé l'invariant « item F ⇒
 * mesure fictive », lit `--items` comme un répertoire (la disposition de `data/items/`), et
 * confronte chaque fichier lu à son schéma.
 *
 * Le jeu nominal est le plus petit qui rende la symétrie verte : un candidat comparé, une
 * question sur un item P et une sur un item F. Chaque objet est complété jusqu'à la conformité à
 * son schéma ; le run part de l'exemple valide de `schema/exemples/`, seul son périmètre change.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { engendrer } from "../pipeline/questions/engendrement.ts";
import { entreesPour } from "../pipeline/questions/tirage.ts";
import type { Item, Mesure, Question, Tirage } from "../pipeline/questions/types.ts";
import { valider } from "../outils/schemas/valider.ts";
import { GRILLE_TOUT_VRAI } from "./aides/fabriques.ts";
import { completer, graine, identifiant, itemF, itemP, mesure } from "./questions/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");
const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDAT = "demo-alpha";

const HISTORIQUE = [
  { date: "2026-09-03T10:00:00+02:00", changement: "création", commit: "a".repeat(40), version_resultante: 1 },
];

const FICTIVITE = {
  origine_fictive: "Mesure inventée pour les tests, sans auteur réel.",
  verification_fictivite: {
    date: "2026-11-15T11:00:00+01:00",
    corpus_verifies: [CANDIDAT],
    operateur: "a2",
    resultat: "aucune_occurrence",
  },
};

function validation(annotateur_id: string) {
  return {
    annotateur_id,
    decision: "accepter",
    date: "2026-09-20T10:00:00+02:00",
    lot_id: "lot-003",
    reponses_grille: GRILLE_TOUT_VRAI,
  };
}

/** Un item des fabriques de questions, complété de ce que `item.schema.json` exige d'un item vérifié. */
function conforme(item: Item): Item {
  return { ...item, validations: [validation("a1"), validation("a2")], historique: HISTORIQUE };
}

const MESURE_P = { ...mesure({ cle: "cli-p", libelle: "tarif de base" }), historique: HISTORIQUE };
const MESURE_F = {
  ...mesure({ cle: "cli-f", libelle: "prime aux marcheurs", fictive: true }),
  ...FICTIVITE,
  historique: HISTORIQUE,
};

const ITEM_P = conforme(itemP({ cle: "cli-p", candidat_id: CANDIDAT, mesure: MESURE_P }));
const ITEM_F = conforme(itemF({ cle: "cli-f", candidat_id: CANDIDAT, mesure: MESURE_F }));

function choisir(questions: readonly Question[], item: Item, gabarit: string): Question {
  const trouvee = questions.find((question) => question.grappe_id === item.id && question.gabarit === gabarit);
  if (trouvee === undefined) throw new Error(`Question ${gabarit} absente pour l'item ${item.id}.`);
  return trouvee;
}

interface Jeu {
  readonly tirage: Tirage;
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly run: Record<string, unknown>;
}

function jeuNominal(): Jeu {
  const items = [ITEM_P, ITEM_F];
  const mesures = [MESURE_P, MESURE_F];
  const engendrees = engendrer(items, mesures).map(completer);
  const questions = [choisir(engendrees, ITEM_P, "Q-DIR"), choisir(engendrees, ITEM_F, "Q-ORI")];
  const exempleRun = JSON.parse(
    readFileSync(join(RACINE, "schema/exemples/run/valide-01-mensuel-publie.json"), "utf8"),
  ) as Record<string, unknown> & { perimetre: { candidats: Record<string, unknown>[] } };
  const candidatExemple = exempleRun.perimetre.candidats[0] as Record<string, unknown>;
  const run = {
    ...exempleRun,
    id: identifiant("run:cli"),
    date_gel: GEL,
    perimetre: { ...exempleRun.perimetre, candidats: [{ ...candidatExemple, candidat_id: CANDIDAT }] },
  };
  return {
    tirage: {
      run_id: identifiant("run:cli"),
      date_gel: GEL,
      graine_tirage: graine(),
      entrees: entreesPour(questions, items, mesures, GEL),
    },
    questions,
    items,
    mesures,
    run,
  };
}

let racine: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "banc-essai-symmetry-"));
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

function ecrireJson(chemin: string, valeur: unknown): void {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

type Options = Readonly<Record<"tirage" | "questions" | "items" | "mesures" | "run", string>>;

/** Écrit le jeu sur disque, un fichier par item dans `items/`, et rend les cinq options. */
function poser(jeu: Jeu): Options {
  const repertoireItems = join(racine, "items");
  mkdirSync(repertoireItems, { recursive: true });
  for (const item of jeu.items) ecrireJson(join(repertoireItems, `${item.id}.json`), item);
  ecrireJson(join(racine, "tirage.json"), jeu.tirage);
  ecrireJson(join(racine, "questions.json"), jeu.questions);
  ecrireJson(join(racine, "mesures.json"), jeu.mesures);
  ecrireJson(join(racine, "run.json"), jeu.run);
  return {
    tirage: join(racine, "tirage.json"),
    questions: join(racine, "questions.json"),
    items: repertoireItems,
    mesures: join(racine, "mesures.json"),
    run: join(racine, "run.json"),
  };
}

function symmetry(options: Partial<Options>) {
  const arguments_ = Object.entries(options).map(([cle, valeur]) => `--${cle}=${valeur}`);
  const resultat = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(RACINE, "outils/symmetry.ts"), ...arguments_],
    { encoding: "utf8" },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

function sans(options: Options, cle: keyof Options): Partial<Options> {
  const { [cle]: _retiree, ...reste } = options;
  return reste;
}

describe("7. pnpm symmetry", () => {
  it("le jeu nominal est conforme à ses schémas (sinon les cas ci-dessous ne prouveraient rien)", () => {
    const jeu = jeuNominal();
    expect(() => valider("tirage", jeu.tirage, "tirage")).not.toThrow();
    expect(() => valider("run", jeu.run, "run")).not.toThrow();
    for (const question of jeu.questions) expect(() => valider("question", question, question.id)).not.toThrow();
    for (const item of jeu.items) expect(() => valider("item", item, item.id)).not.toThrow();
    for (const referent of jeu.mesures) expect(() => valider("mesure", referent, referent.id)).not.toThrow();
  });

  it("cas nominal : contrôles verts, code 0", () => {
    const resultat = symmetry(poser(jeuNominal()));
    expect(resultat.status).toBe(0);
    expect(resultat.erreur).not.toContain("Le run ne peut pas être lancé");
    expect(resultat.sortie).toContain("statut global : vert");
    expect(resultat.sortie).toContain("aucune violation");
    expect(resultat.sortie).not.toContain("non contrôlé");
  });

  it("sans --mesures : code 1, et le message nomme l'invariant qui ne serait pas contrôlé", () => {
    const resultat = symmetry(sans(poser(jeuNominal()), "mesures"));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("--mesures est obligatoire");
    expect(resultat.erreur).toContain("item F ⇒ mesure fictive");
  });

  it("--items vers un répertoire vide : code 1", () => {
    const options = poser(jeuNominal());
    const vide = join(racine, "vide");
    mkdirSync(vide);
    const resultat = symmetry({ ...options, items: vide });
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${vide} : aucun fichier d'item`);
  });

  it("un item F dont la mesure n'est pas fictive : code 1, violation nommée", () => {
    const jeu = jeuNominal();
    const { origine_fictive: _o, verification_fictivite: _v, ...socle } = MESURE_F;
    const nonFictive = { ...socle, fictive: false };
    const resultat = symmetry(poser({ ...jeu, mesures: [MESURE_P, nonFictive] }));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(ITEM_F.id);
    expect(resultat.erreur).toContain("fictive=false");
  });

  it("un fichier d'item non conforme à son schéma : code 1, fichier nommé", () => {
    const options = poser(jeuNominal());
    const fichier = join(options.items, `${ITEM_P.id}.json`);
    ecrireJson(fichier, { ...ITEM_P, statut_validation: "valide_a_moitie" });
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(fichier);
    expect(resultat.erreur).toContain("« item »");
  });

  it("lit le répertoire d'items en ordre de nom : le premier fichier fautif signalé est le premier par nom", () => {
    const options = poser(jeuNominal());
    const repertoire = options.items;
    // Écrits dans l'ordre inverse de leur nom : seul un tri explicite désigne « 00 » en premier.
    ecrireJson(join(repertoire, "zz-fautif.json"), { id: "fautif-z" });
    ecrireJson(join(repertoire, "00-fautif.json"), { id: "fautif-0" });
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(join(repertoire, "00-fautif.json"));
    expect(resultat.erreur).not.toContain("zz-fautif.json");
  });
});
