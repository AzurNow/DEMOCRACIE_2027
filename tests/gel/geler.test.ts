/**
 * Lot gel, PR 1 : `pnpm geler` sur fixtures (décisions D41, D44). Chaque cas limite du brief a son
 * test, nommé « cas n ». Tous les gels visent un dépôt Git jetable (`fixtures.ts`) et une sortie
 * temporaire ; `runs/` du projet est photographié avant et après, et ne doit pas bouger (cas 3).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DepotSale } from "../../pipeline/gel/depot.ts";
import { RunDejaGele, SortieSousRuns } from "../../pipeline/gel/destination.ts";
import { ConfigurationGelIncomplete } from "../../pipeline/gel/configuration.ts";
import { geler, GelBloque } from "../../pipeline/gel/geler.ts";
import type { OptionsGel } from "../../pipeline/gel/geler.ts";
import { FormulationsEnDefautAuGel } from "../../pipeline/reformulation/lecture-au-gel.ts";
import { head, RACINE_PROJET } from "../aides/depot.ts";
import { identifiant } from "../questions/fabriques.ts";
import {
  CONFIGURATION_GEL,
  depotDuJeu,
  GEL_MINUIT_TRENTE,
  itemPDeData,
  optionsGel,
  recommiter,
  relue,
  tachesDuJeu,
} from "./fixtures.ts";
import type { Jeu } from "./fixtures.ts";
import { ITEM_FIN_AU_GEL, ITEM_P1, jeuEcartTolere, jeuNominal, jeuRouge, MESURE_FISC_1 } from "./jeux.ts";

const DATE = "2026-12-01";
const RUNS_DU_PROJET = join(RACINE_PROJET, "runs");

/* ------------------------------------------------------------------ outillage */

const temporaires: string[] = [];

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  temporaires.push(chemin);
  return chemin;
}

function depot(jeu: Jeu): string {
  const racine = depotDuJeu(jeu);
  temporaires.push(racine);
  return racine;
}

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

/** Tous les chemins sous un répertoire, triés : une photographie de ce qui existe. */
function arborescence(racine: string): readonly string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { recursive: true, encoding: "utf8" }).sort();
}

let runsAvant: readonly string[];

beforeAll(() => {
  runsAvant = arborescence(RUNS_DU_PROJET);
});

afterAll(() => {
  // Cas 3 : aucun test n'écrit dans runs/ du projet.
  expect(arborescence(RUNS_DU_PROJET)).toEqual(runsAvant);
});

async function refusDe(options: OptionsGel): Promise<Error> {
  try {
    await geler(options);
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("Le gel a été accepté alors qu'un refus était attendu.");
}

function lire(repertoire: string, nom: string): string {
  return readFileSync(join(repertoire, nom), "utf8");
}

function json(repertoire: string, nom: string): Record<string, unknown> {
  return JSON.parse(lire(repertoire, nom)) as Record<string, unknown>;
}

/** Un gel nominal vers une sortie neuve ; rend la sortie et le répertoire du run. */
async function gelNominal(jeu: Jeu = jeuNominal()) {
  const racine = depot(jeu);
  const sortie = temporaire("banc-gel-sortie-");
  const resultat = await geler(optionsGel(racine, sortie));
  return { racine, sortie, resultat, run: join(sortie, DATE) };
}

/* ------------------------------------------------------------------ nominal */

describe("gel nominal", () => {
  it("écrit run.json, tirage.json et questions.json, statut planifie, commits inscrits", async () => {
    const { racine, run, resultat } = await gelNominal();
    expect(readdirSync(run).sort()).toEqual(["questions.json", "run.json", "tirage.json"]);
    const objet = json(run, "run.json");
    expect(objet["statut"]).toBe("planifie");
    expect(objet["type_run"]).toBe("pilote");
    expect(objet["id"]).toBe(identifiant("run:gel"));
    expect(objet["versions"]).toEqual({ protocole: CONFIGURATION_GEL.version_protocole, code_commit: head(racine), donnees_commit: head(racine) });
    expect(objet["fenetre"]).toEqual({ debut: CONFIGURATION_GEL.fenetre_debut, fin: "2026-12-03T06:00:00.000+01:00" });
    expect(objet["taux_echantillon_humain"]).toBe(0.1);
    expect((objet["juges"] as Record<string, unknown>[]).map((juge) => juge["retire"])).toEqual([false, false]);
    expect((objet["symetrie"] as Record<string, unknown>)["statut_global"]).toBe("vert");
    expect(resultat.repertoire).toBe(run);
  });

  it("D44 : engendree_le de chaque question vaut date_gel", async () => {
    const { run } = await gelNominal();
    const questions = JSON.parse(lire(run, "questions.json")) as { engendree_le: string }[];
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) expect(question.engendree_le).toBe(jeuNominal().date_gel);
  });

  it("run.json référence tirage.json par son chemin sous runs/<date>/ et le SHA-256 de ses octets", async () => {
    const { run } = await gelNominal();
    const tirage = json(run, "run.json")["tirage"] as Record<string, unknown>;
    const { createHash } = await import("node:crypto");
    expect(tirage["chemin"]).toBe(`runs/${DATE}/tirage.json`);
    expect(tirage["sha256"]).toBe(createHash("sha256").update(readFileSync(join(run, "tirage.json"))).digest("hex"));
    expect(tirage["nombre_questions"]).toBe((json(run, "tirage.json")["entrees"] as unknown[]).length);
  });

  it("les alias aveugles de config/gel.json sont inscrits au périmètre du run", async () => {
    const { run } = await gelNominal();
    const outils = (json(run, "run.json")["perimetre"] as { outils: Record<string, unknown>[] }).outils;
    expect(outils.map((outil) => [outil["outil_id"], outil["alias_aveugle"]])).toEqual([["outil-alpha", "O07"]]);
  });
});

/* ------------------------------------------------------------------ cas limites */

describe("cas 1 : dépôt sale", () => {
  it("cas 1 : un fichier suivi modifié ⇒ refus avant toute lecture coûteuse, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    // Un item rendu illisible : s'il était lu, l'erreur serait celle du JSON, pas celle du dépôt.
    writeFileSync(join(racine, "data/items", `${ITEM_P1.id}.json`), "{ pas du JSON", "utf8");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(DepotSale);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("cas 1 : un fichier non suivi ⇒ refus, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    writeFileSync(join(racine, "brouillon.txt"), "non suivi", "utf8");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(DepotSale);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("cas 1 : un fichier que .gitignore exclut ne rend pas le dépôt sale", async () => {
    const racine = depot(jeuNominal());
    writeFileSync(join(racine, ".gitignore"), "*.local\n", "utf8");
    recommiter(racine, "gitignore");
    writeFileSync(join(racine, "notes.local"), "ignoré", "utf8");
    const sortie = temporaire("banc-gel-sortie-");
    await geler(optionsGel(racine, sortie));
    expect(existsSync(join(sortie, DATE, "run.json"))).toBe(true);
  });
});

describe("cas 2 : runs/<date>/ existe déjà", () => {
  it("cas 2 : <sortie>/<date>/ vide ⇒ refus, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    mkdirSync(join(sortie, DATE));
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(RunDejaGele);
    expect(arborescence(sortie)).toEqual([DATE]);
  });

  it("cas 2 : runs/<date>/ du dépôt lu, vide (que Git ne voit pas) ⇒ refus sans --sortie", async () => {
    const racine = depot(jeuNominal());
    mkdirSync(join(racine, "runs", DATE), { recursive: true });
    expect(await refusDe(optionsGel(racine, undefined))).toBeInstanceOf(RunDejaGele);
    expect(arborescence(join(racine, "runs"))).toEqual([DATE]);
  });

  it("cas 2 : un second gel vers la même sortie est refusé, le premier reste intact", async () => {
    const { racine, sortie, run } = await gelNominal();
    const avant = lire(run, "run.json");
    expect(await refusDe(optionsGel(racine, sortie, { identifiant: () => identifiant("run:second") }))).toBeInstanceOf(RunDejaGele);
    expect(lire(run, "run.json")).toBe(avant);
  });
});

describe("cas 3 : --sortie", () => {
  it("cas 3 : sans --sortie, le gel écrit sous runs/ du dépôt lu, et seulement là", async () => {
    const racine = depot(jeuNominal());
    await geler(optionsGel(racine, undefined));
    expect(readdirSync(join(racine, "runs", DATE)).sort()).toEqual(["questions.json", "run.json", "tirage.json"]);
    expect(readdirSync(join(racine, "runs"))).toEqual([DATE]);
  });

  it("cas 3 : une --sortie sous runs/ du dépôt lu est refusée, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const sortie = join(racine, "runs", "essai");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(SortieSousRuns);
    expect(existsSync(join(racine, "runs"))).toBe(false);
  });
});

describe("cas 4 : date du répertoire", () => {
  it("cas 4 : date_gel à 00:30 heure de Paris, veille en UTC ⇒ répertoire à la date de Paris", async () => {
    const racine = depot(jeuNominal(GEL_MINUIT_TRENTE));
    const sortie = temporaire("banc-gel-sortie-");
    await geler(optionsGel(racine, sortie));
    expect(new Date(GEL_MINUIT_TRENTE).toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(readdirSync(sortie)).toEqual([DATE]);
    const run = json(join(sortie, DATE), "run.json");
    expect(run["date_gel"]).toBe(GEL_MINUIT_TRENTE);
    expect((run["tirage"] as Record<string, unknown>)["chemin"]).toBe(`runs/${DATE}/tirage.json`);
  });
});

describe("cas 5 : validité au gel", () => {
  it("cas 5 : item dont valide_au = date_gel exactement ⇒ exclu du tirage, compté à part", async () => {
    const { run } = await gelNominal();
    const tirage = json(run, "tirage.json") as {
      entrees: { question_id: string }[];
      exclusions: { question_id: string; motif: string; candidat_id: string }[];
    };
    const questions = JSON.parse(lire(run, "questions.json")) as { id: string; grappe_id: string }[];
    const surItem = questions.filter((question) => question.grappe_id === ITEM_FIN_AU_GEL.id).map((question) => question.id);
    expect(surItem.length).toBeGreaterThan(0);
    // Engendrées au gel (le jeu est complet), jamais tirées, chacune comptée à part avec son motif.
    expect(tirage.entrees.filter((entree) => surItem.includes(entree.question_id))).toEqual([]);
    const exclues = tirage.exclusions.filter((exclusion) => surItem.includes(exclusion.question_id));
    expect(exclues.map((exclusion) => exclusion.question_id).sort()).toEqual([...surItem].sort());
    expect(new Set(exclues.map((exclusion) => exclusion.motif))).toEqual(new Set(["hors_validite"]));
  });
});

describe("cas 6 et 7 : formulations relues", () => {
  it("cas 6 : une question engendrée sans formulation relue ⇒ FormulationsEnDefautAuGel, rien écrit", async () => {
    let retiree = "";
    const racine = depot({
      ...jeuNominal(),
      formulations: (taches) => {
        const [premiere, ...reste] = taches;
        if (premiere === undefined) throw new Error("jeu sans question");
        retiree = premiere.question.id;
        return reste.map(relue);
      },
    });
    const sortie = temporaire("banc-gel-sortie-");
    const erreur = await refusDe(optionsGel(racine, sortie));
    expect(erreur).toBeInstanceOf(FormulationsEnDefautAuGel);
    expect((erreur as FormulationsEnDefautAuGel).defauts).toEqual([
      { question_id: retiree, motif: "absente", detail: expect.any(String) as unknown },
    ]);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("cas 7 : position de l'item changée depuis la relecture (D43) ⇒ refus, rien écrit", async () => {
    const nominal = jeuNominal();
    const corrige = itemPDeData({ cle: "gel-p1", candidat_id: ITEM_P1.candidat_id, mesure: MESURE_FISC_1, position: "contre" });
    expect(corrige.id).toBe(ITEM_P1.id);
    // Les formulations ont été relues sur l'item d'avant (« pour ») ; data/items porte la correction.
    const racine = depot({
      ...nominal,
      items: nominal.items.map((item) => (item.id === ITEM_P1.id ? corrige : item)),
      formulations: () => tachesDuJeu(nominal).map(relue),
    });
    const sortie = temporaire("banc-gel-sortie-");
    const erreur = await refusDe(optionsGel(racine, sortie));
    expect(erreur).toBeInstanceOf(FormulationsEnDefautAuGel);
    const motifs = (erreur as FormulationsEnDefautAuGel).defauts.map((defaut) => defaut.motif);
    expect(motifs.length).toBeGreaterThan(0);
    expect(new Set(motifs)).toEqual(new Set(["position_perimee"]));
    expect(arborescence(sortie)).toEqual([]);
  });
});

describe("cas 8 : barrière de symétrie", () => {
  it("cas 8 : symétrie rouge ⇒ GelBloque (code 1 en ligne de commande), rien écrit", async () => {
    const racine = depot(jeuRouge());
    const sortie = temporaire("banc-gel-sortie-");
    const erreur = await refusDe(optionsGel(racine, sortie));
    expect(erreur).toBeInstanceOf(GelBloque);
    const verdict = (erreur as GelBloque).verdict;
    expect(verdict.bloque).toBe(true);
    expect(erreur.message).toContain("aucun_nom_candidat_dans_q_att");
    expect(arborescence(sortie)).toEqual([]);
  });

  it("cas 8 : écart toléré ⇒ écrit, l'écart inscrit dans run.json#/symetrie", async () => {
    const { run } = await gelNominal(jeuEcartTolere());
    const symetrie = json(run, "run.json")["symetrie"] as { statut_global: string; conditions: Record<string, unknown>[] };
    expect(symetrie.statut_global).toBe("ecart_tolere");
    const ecart = symetrie.conditions.find((condition) => condition["code"] === "repartition_themes");
    expect(ecart?.["statut"]).toBe("ecart_tolere");
    expect(ecart?.["mesure"]).toBeGreaterThan(0);
    expect(ecart?.["commentaire"]).toContain("compensation");
  });
});

describe("cas 9 : config/gel.json incomplet", () => {
  it("cas 9 : une valeur null ⇒ refus nommant le champ, rien écrit", async () => {
    const racine = depot({ ...jeuNominal(), configuration: { ...CONFIGURATION_GEL, juges: null } });
    const sortie = temporaire("banc-gel-sortie-");
    const erreur = await refusDe(optionsGel(racine, sortie));
    expect(erreur).toBeInstanceOf(ConfigurationGelIncomplete);
    expect((erreur as ConfigurationGelIncomplete).champs).toEqual(["juges"]);
    expect(arborescence(sortie)).toEqual([]);
  });
});

/* --------------------------------------------------- pnpm symmetry sur la sortie */

function symmetry(racine: string, run: string) {
  const resultat = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(RACINE_PROJET, "outils/symmetry.ts"),
      `--tirage=${join(run, "tirage.json")}`,
      `--questions=${join(run, "questions.json")}`,
      `--items=${join(racine, "data/items")}`,
      `--mesures=${join(racine, "data/mesures")}`,
      `--run=${join(run, "run.json")}`,
    ],
    { encoding: "utf8" },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

describe("cas 10 : mesure modifiée après donnees_commit", () => {
  it("cas 10 : pnpm symmetry refuse une mesure modifiée depuis le gel (MesuresHorsDuGel)", async () => {
    const { racine, run } = await gelNominal();
    const chemin = join(racine, "data/mesures", `${MESURE_FISC_1.id}.json`);
    writeFileSync(chemin, `${JSON.stringify({ ...MESURE_FISC_1, libelle: "retouchée après le gel" }, null, 2)}\n`, "utf8");
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("MesuresHorsDuGel");
    expect(resultat.erreur).toContain(`${MESURE_FISC_1.id}.json modifié depuis le gel`);
    expect(resultat.sortie).not.toContain("Contrôles verts");
  });

  it("cas 10 : pnpm symmetry refuse une mesure modifiée puis commitée après le gel", async () => {
    const { racine, run } = await gelNominal();
    const chemin = join(racine, "data/mesures", `${MESURE_FISC_1.id}.json`);
    writeFileSync(chemin, `${JSON.stringify({ ...MESURE_FISC_1, libelle: "retouchée après le gel" }, null, 2)}\n`, "utf8");
    recommiter(racine, "mesure retouchée après le gel");
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${MESURE_FISC_1.id}.json modifié depuis le gel`);
  });

  it("cas 10 : pnpm symmetry refuse une mesure ajoutée ou retirée après le gel", async () => {
    const { racine, run } = await gelNominal();
    rmSync(join(racine, "data/mesures", `${MESURE_FISC_1.id}.json`));
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${MESURE_FISC_1.id}.json absent des mesures reçues`);
  });

  it("cas 10 : le gel refuse une mesure modifiée après le dernier commit, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const chemin = join(racine, "data/mesures", `${MESURE_FISC_1.id}.json`);
    writeFileSync(chemin, `${JSON.stringify({ ...MESURE_FISC_1, libelle: "retouchée" }, null, 2)}\n`, "utf8");
    const sortie = temporaire("banc-gel-sortie-");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(DepotSale);
    expect(arborescence(sortie)).toEqual([]);
  });
});

describe("cas 11 : reproductibilité", () => {
  it("cas 11 : deux gels du même commit, même identifiant ⇒ trois fichiers identiques octet pour octet", async () => {
    const racine = depot(jeuNominal());
    const [a, b] = [temporaire("banc-gel-a-"), temporaire("banc-gel-b-")];
    await geler(optionsGel(racine, a));
    await geler(optionsGel(racine, b));
    for (const nom of ["questions.json", "tirage.json", "run.json"]) {
      expect(readFileSync(join(b, DATE, nom))).toEqual(readFileSync(join(a, DATE, nom)));
    }
  });

  it("cas 11 : deux gels du même commit, identifiants différents ⇒ questions.json identique ; seul l'identifiant du run est propre à chaque gel", async () => {
    // L'identifiant du run est dans run.json#/id, mais aussi dans tirage.json#/run_id, que le schéma
    // exige égal à run.id (TirageDUnAutreRun), et il amorce le générateur du tirage
    // (pipeline/questions/tirage.ts:amorce). Le brief attendait tirage.json identique : c'est
    // impossible tant que run_id y figure ; écart signalé dans le rapport du lot.
    const racine = depot(jeuNominal());
    const [a, b] = [temporaire("banc-gel-a-"), temporaire("banc-gel-b-")];
    await geler(optionsGel(racine, a, { identifiant: () => identifiant("run:a") }));
    await geler(optionsGel(racine, b, { identifiant: () => identifiant("run:b") }));
    expect(readFileSync(join(b, DATE, "questions.json"))).toEqual(readFileSync(join(a, DATE, "questions.json")));
    expect(json(join(a, DATE), "tirage.json")["run_id"]).toBe(identifiant("run:a"));
    expect(json(join(b, DATE), "tirage.json")["run_id"]).toBe(identifiant("run:b"));
  });
});

describe("cas 12 : écriture tout ou rien", () => {
  it("cas 12 : une erreur à l'écriture du troisième fichier ne laisse aucun fichier", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    let appels = 0;
    const ecrire = (chemin: string, texte: string): void => {
      appels += 1;
      if (appels === 3) throw new Error("disque plein (simulé)");
      writeFileSync(chemin, texte, { encoding: "utf8", flag: "wx" });
    };
    const erreur = await refusDe(optionsGel(racine, sortie, { ecrire }));
    expect(erreur.message).toBe("disque plein (simulé)");
    expect(appels).toBe(3);
    // Ni le répertoire du run, ni le temporaire, ni aucun des deux fichiers déjà écrits.
    expect(arborescence(sortie)).toEqual([]);
  });
});

describe("cas 13 : bout en bout", () => {
  it("cas 13 : la sortie du gel passe pnpm symmetry avec ses cinq options", async () => {
    const { racine, run } = await gelNominal();
    const resultat = symmetry(racine, run);
    expect(resultat.erreur).not.toContain("non évaluée");
    expect(resultat.erreur).not.toContain("Le run ne peut pas être lancé");
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toContain("statut global : vert");
    expect(resultat.sortie).toContain("Contrôles verts : le run peut être lancé.");
  });

  it("cas 13 : un gel à écart toléré passe aussi pnpm symmetry, écart imprimé", async () => {
    const { racine, run } = await gelNominal(jeuEcartTolere());
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toContain("statut global : ecart_tolere");
  });
});

/* --------------------------------------------------------------- ligne de commande */

function geleCli(arguments_: readonly string[]) {
  const resultat = spawnSync(process.execPath, ["--experimental-strip-types", join(RACINE_PROJET, "outils/geler.ts"), ...arguments_], {
    encoding: "utf8",
  });
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

describe("pnpm geler en ligne de commande", () => {
  it("sans --type-run : code 1, l'option nommée, rien écrit", () => {
    const sortie = temporaire("banc-gel-cli-");
    const resultat = geleCli([`--sortie=${sortie}`, "--graines-fixes=/nulle-part.json"]);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("--type-run est obligatoire");
    expect(arborescence(sortie)).toEqual([]);
  });

  it("un --type-run hors du schéma : code 1, rien écrit", () => {
    const sortie = temporaire("banc-gel-cli-");
    const resultat = geleCli([`--sortie=${sortie}`, "--type-run=hebdo", "--graines-fixes=/nulle-part.json"]);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("type_run");
    expect(arborescence(sortie)).toEqual([]);
  });

  it("sans --graines-fixes : code 1, la raison dite (balise drand absente), rien écrit", () => {
    const sortie = temporaire("banc-gel-cli-");
    const resultat = geleCli([`--sortie=${sortie}`, "--type-run=pilote"]);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("--graines-fixes est obligatoire");
    expect(resultat.erreur).toContain("drand");
    expect(arborescence(sortie)).toEqual([]);
  });

  it("des graines fixes non conformes (quatre valeurs) : code 1, rien écrit", () => {
    const sortie = temporaire("banc-gel-cli-");
    const graines = join(temporaire("banc-gel-graines-"), "graines.json");
    writeFileSync(graines, JSON.stringify({ tirage: 1, echantillon_humain: 2, bootstrap: 3, permutation: 4 }), "utf8");
    const resultat = geleCli([`--sortie=${sortie}`, "--type-run=pilote", `--graines-fixes=${graines}`]);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("contrefactuel");
    expect(resultat.erreur).toContain("Rien n'est écrit.");
    expect(arborescence(sortie)).toEqual([]);
  });
});

/* -------------------------------------------------- la chaîne nominale est saine */

describe("le jeu nominal", () => {
  it("son dépôt de fixture reste propre après le gel, et le run inscrit son HEAD", async () => {
    const { racine, run } = await gelNominal();
    const versions = json(run, "run.json")["versions"] as Record<string, unknown>;
    expect(versions["code_commit"]).toBe(head(racine));
    const statut = spawnSync("git", ["status", "--porcelain"], { cwd: racine, encoding: "utf8" });
    expect(statut.stdout).toBe("");
  });
});
