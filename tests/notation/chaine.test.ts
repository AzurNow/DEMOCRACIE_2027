/**
 * La chaîne de notation du §7 de bout en bout (lot notation, PR D) : `noterRun` sur le run de
 * référence de `pnpm run:dry`, avec les juges simulés et le fournisseur d'existences simulé.
 * Chaque `describe` numéroté porte un cas limite du brief.
 *
 * L'interrogation simulée tire l'aléa de ses identifiants de réponse (`validation/domaine/ulid.ts`) ;
 * il est rendu déterministe ici, pour que l'échantillon humain, tiré sur ces identifiants, soit le
 * même à chaque exécution des tests. La chaîne elle-même n'a aucun aléa hors de ses graines.
 */

import { cpSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispositionRunNote, lireNotationsDuRun, lireRunJson, lireVerdicts, runDeNotationDe } from "../../analysis/lecture-run.ts";
import { bilanNotation, ReponsePerdue } from "../../pipeline/notation/bilan-notation.ts";
import { JugesNonConformes, noterRun, type EnvironnementChaine, type ResultatChaine } from "../../pipeline/notation/chaine.ts";
import { SEUIL_RETRAIT } from "../../pipeline/notation/contrefactuel.ts";
import { controleCroise } from "../../pipeline/notation/controle-croise.ts";
import { tailleEchantillonHumain } from "../../pipeline/notation/echantillons.ts";
import type { FournisseurExistences } from "../../pipeline/notation/fournisseur-existences.ts";
import { ContrefactuelDejaInscrit } from "../../pipeline/notation/inscription-contrefactuel.ts";
import {
  environnementSimule,
  GelDivergent,
  lancerNotationSimulee,
  preparerNotationSimulee,
  type ParametresNotationSimulee,
  type RunSimulePrepare,
} from "../../pipeline/notation/notation-simulee.ts";
import { ecrireJson } from "./run-fictif.ts";
import { executerOutil } from "../aides/depot.ts";
import {
  avecBiais,
  contenus,
  enregistreurs,
  instantane,
  nettoyerSorties,
  nouvelleSortie,
  options,
  parametresDeReference,
  type Appel,
} from "./simulation.ts";

const alea = vi.hoisted(() => ({ compteur: 0 }));

vi.mock("../../validation/domaine/ulid.ts", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("../../validation/domaine/ulid.ts")>();
  return {
    ...vrai,
    // L'horodatage reste celui de l'horloge virtuelle ; l'aléa devient un compteur.
    ulid: (maintenant?: number) => {
      alea.compteur += 1;
      return `${vrai.ulid(maintenant).slice(0, 10)}${String(alea.compteur).padStart(16, "0")}`;
    },
  };
});

beforeEach(() => {
  alea.compteur = 0;
});

afterEach(nettoyerSorties);

/** Q2 du run simulé : son item ne nomme aucun candidat, ses réponses ne sont pas éligibles au test. */
const QUESTION_SANS_NOM = "q_1b2c3d4e5f60718293a4b5c6d7e8f90a";
/** Q1 : son item nomme Demo-Alpha. */
const QUESTION_NOMMANTE = "q_0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const BIAIS_BETA = { candidats: ["demo-beta"], taux: 1 };

interface Execution {
  readonly prepare: RunSimulePrepare;
  readonly resultat: ResultatChaine;
  readonly bilan: ReturnType<typeof bilanNotation>;
}

async function noter(
  sortie: string,
  parametres: ParametresNotationSimulee = parametresDeReference(),
  habiller: (env: EnvironnementChaine) => EnvironnementChaine = (env) => env,
): Promise<Execution> {
  const prepare = await preparerNotationSimulee(options(sortie));
  const resultat = await noterRun(prepare.reponses, habiller(environnementSimule(prepare.repertoire_run, parametres)));
  const bilan = bilanNotation(prepare.repertoire_run, resultat, prepare.reponses.map((r) => r.reponse.id));
  return { prepare, resultat, bilan };
}

function issuesDe(execution: Execution): ReadonlySet<string> {
  const verdicts = lireVerdicts(execution.prepare.repertoire_run, execution.resultat.run_id);
  return new Set([
    ...verdicts.map((v) => `verdict:${v.mode_resolution}`),
    ...execution.resultat.attentes.flatMap((a) => a.motifs.map((m) => `attente:${m}`)),
  ]);
}

function violations(repertoire_run: string): readonly unknown[] {
  const run = lireRunJson(repertoire_run);
  return controleCroise({
    run: runDeNotationDe(run),
    reponses_obtenues: readdirSync(dispositionRunNote(repertoire_run).reponses)
      .map((f) => JSON.parse(readFileSync(join(dispositionRunNote(repertoire_run).reponses, f), "utf8")) as { id: string; statut_reponse: string })
      .filter((r) => r.statut_reponse === "obtenue")
      .map((r) => r.id),
    notations: lireNotationsDuRun(repertoire_run, run.id).notations,
    verdicts: lireVerdicts(repertoire_run, run.id),
  });
}

function contrefactuellesDerivees(repertoire_run: string, run_id: string): ReadonlyMap<string, string> {
  return new Map(lireNotationsDuRun(repertoire_run, run_id).reponses_contrefactuelles.map((r) => [r.id, r.derive_de_reponse_id]));
}

/** Le fournisseur reçu, rendu aveugle aux liens de certaines réponses. */
function sansExistencePour(reponse_ids: ReadonlySet<string>): (env: EnvironnementChaine) => EnvironnementChaine {
  return (env) => {
    const fournisseur: FournisseurExistences = {
      existencesDe: (reponse_id, liens) => (reponse_ids.has(reponse_id) ? [] : env.existences.existencesDe(reponse_id, liens)),
    };
    return { ...env, existences: fournisseur };
  };
}

describe("1. deux exécutions avec la même graine", () => {
  it("produisent des notations, des réponses contrefactuelles, des verdicts et un run.json identiques, octet pour octet", async () => {
    const premiere = nouvelleSortie();
    const seconde = nouvelleSortie();
    await preparerNotationSimulee(options(premiere));
    cpSync(premiere, seconde, { recursive: true });
    const a = await noter(premiere);
    const b = await noter(seconde);
    const da = dispositionRunNote(a.prepare.repertoire_run);
    const db = dispositionRunNote(b.prepare.repertoire_run);
    expect(contenus(da.notations).size).toBeGreaterThan(0);
    expect(contenus(db.notations)).toEqual(contenus(da.notations));
    expect(contenus(db.verdicts)).toEqual(contenus(da.verdicts));
    expect(contenus(db.reponses_contrefactuelles)).toEqual(contenus(da.reponses_contrefactuelles));
    expect(readFileSync(db.run_json, "utf8")).toBe(readFileSync(da.run_json, "utf8"));
    expect(b.bilan).toEqual(a.bilan);
  });
});

describe("2. chaque issue de decider() qu'une notation sans humain peut atteindre", () => {
  /** Run de référence : aucun juge retiré. */
  const SANS_RETRAIT = [
    "verdict:accord_juges",
    "attente:desaccord_juges",
    "attente:extrait_invalide",
    "attente:drapeau_grave",
    "attente:accord_sans_note_commune",
    "attente:double_notation_humaine_incomplete",
  ];
  /**
   * Issues qui exigent une notation humaine écrite (tranche_humain, revue_erreur_grave,
   * echantillon_humain_10, arbitrage_panel), ou deux humains déjà là (arbitrage manquant) : la
   * chaîne n'en simule aucun. notation_juge_manquante : la chaîne fait noter chaque juge actif.
   */
  const JAMAIS_SANS_HUMAIN = [
    "verdict:tranche_humain",
    "verdict:revue_erreur_grave",
    "verdict:echantillon_humain_10",
    "verdict:arbitrage_panel",
    "attente:arbitrage_echantillon_manquant",
    "attente:notation_juge_manquante",
  ];

  it("le run simulé de référence les atteint toutes, sauf le juge unique, qui exige un retrait", async () => {
    const issues = issuesDe(await noter(nouvelleSortie()));
    for (const issue of SANS_RETRAIT) expect(issues, issue).toContain(issue);
    for (const issue of [...JAMAIS_SANS_HUMAIN, "verdict:juge_unique_apres_retrait"]) expect(issues, issue).not.toContain(issue);
  });

  it("après un retrait, le juge restant seul donne la note (juge_unique_apres_retrait)", async () => {
    const issues = issuesDe(await noter(nouvelleSortie(), avecBiais({ "juge-simule-b": BIAIS_BETA })));
    expect(issues).toContain("verdict:juge_unique_apres_retrait");
    expect(issues).not.toContain("verdict:accord_juges");
    for (const issue of JAMAIS_SANS_HUMAIN) expect(issues, issue).not.toContain(issue);
  });
});

describe("3. un juge simulé réglé au-delà de SEUIL_RETRAIT", () => {
  it("est retiré ; ses notations sont écartées et le juge restant fait foi hors de l'échantillon humain", async () => {
    const execution = await noter(nouvelleSortie(), avecBiais({ "juge-simule-b": BIAIS_BETA }));
    const { repertoire_run } = execution.prepare;
    const run = lireRunJson(repertoire_run);
    const [a, b] = execution.bilan.juges;
    expect(a).toMatchObject({ juge_id: "juge-simule-a", retire: false, changements_contrefactuel: { numerateur: 0 } });
    expect(b).toMatchObject({ juge_id: "juge-simule-b", retire: true });
    expect(auDelaDuSeuil(b?.changements_contrefactuel)).toBe(true);
    expect(run.taux_echantillon_humain).toBe(0.25);

    // Le juge retiré n'est plus appelé après le test : ses notations du run sont celles du sous-ensemble.
    const taille = execution.bilan.contrefactuel_inscrit?.taille;
    expect(b?.notations_run).toBe(taille);
    expect(b?.notations_contrefactuel).toBe(taille);
    expect(a?.notations_run).toBe(execution.bilan.reponses_obtenues);

    // Aucune note retenue ne cite le juge retiré ; hors échantillon, le juge restant donne la note.
    const notations = new Map(lireNotationsDuRun(repertoire_run, run.id).notations.map((n) => [n.id, n]));
    const verdicts = lireVerdicts(repertoire_run, run.id);
    expect(verdicts.length).toBeGreaterThan(0);
    for (const verdict of verdicts) {
      expect(verdict.dans_echantillon_humain).toBe(false);
      expect(verdict.mode_resolution).toBe("juge_unique_apres_retrait");
      expect(verdict.notations_sources.map((id) => notations.get(id)?.notateur.id)).toEqual(["juge-simule-a"]);
    }
    expect(execution.bilan.attentes_par_motif.double_notation_humaine_incomplete).toBe(tailleEchantillonHumain(execution.bilan.reponses_obtenues, 0.25));
    expect(violations(repertoire_run)).toEqual([]);
  });

  it("les deux juges au-delà : run invalide, aucune notation de masse, aucun verdict, run.json intact (D16 (3))", async () => {
    const sortie = nouvelleSortie();
    const execution = await noter(sortie, avecBiais({ "juge-simule-a": BIAIS_BETA, "juge-simule-b": BIAIS_BETA }));
    const { repertoire_run } = execution.prepare;
    expect(execution.resultat.contrefactuel.statut).toBe("run_invalide");
    expect(execution.resultat.verdicts).toEqual([]);
    expect(readdirSync(dispositionRunNote(repertoire_run).verdicts)).toEqual([]);
    expect(lireRunJson(repertoire_run).contrefactuel_candidats).toBeUndefined();
    expect(execution.bilan.attentes_par_motif.run_invalide).toBe(execution.bilan.reponses_obtenues);
  });
});

describe("4. le test contrefactuel passe avant la notation de masse", () => {
  it("toutes les charges du sous-ensemble et de ses permutations précèdent la première charge de masse, et run.json est inscrit entre les deux", async () => {
    const appels: (Appel & { readonly inscrit: boolean })[] = [];
    const sortie = nouvelleSortie();
    const consignes: Appel[] = [];
    const execution = await noter(sortie, parametresDeReference(), (env) => ({
      ...env,
      juges: enregistreurs(env.juges, consignes, (appel) => {
        appels.push({ ...appel, inscrit: lireRunJson(env.repertoire_run).contrefactuel_candidats !== undefined });
      }),
    }));
    const permutees = contrefactuellesDerivees(execution.prepare.repertoire_run, execution.resultat.run_id);
    const sousEnsemble = new Set(permutees.values());
    const duTest = (a: Appel): boolean => permutees.has(a.charge.reponse_id) || sousEnsemble.has(a.charge.reponse_id);
    const premiereDeMasse = appels.findIndex((a) => !duTest(a));
    expect(sousEnsemble.size).toBeGreaterThan(0);
    expect(premiereDeMasse).toBeGreaterThan(0);
    expect(appels.slice(0, premiereDeMasse).every(duTest)).toBe(true);
    expect(appels.slice(premiereDeMasse).some(duTest)).toBe(false);
    expect(appels.slice(0, premiereDeMasse).every((a) => !a.inscrit)).toBe(true);
    expect(appels.slice(premiereDeMasse).every((a) => a.inscrit)).toBe(true);
  });
});

describe("5. réponse refusée par l'API, réponse tronquée", () => {
  it("un refus est noté par les deux juges comme toute réponse, hors du test contrefactuel (rien à permuter), sans valeur inventée", async () => {
    const execution = await noter(nouvelleSortie());
    const { repertoire_run } = execution.prepare;
    const refus = execution.prepare.reponses.filter((r) => r.reponse.normalise.refus_api);
    expect(refus.length).toBeGreaterThan(0);
    const notations = lireNotationsDuRun(repertoire_run, execution.resultat.run_id).notations;
    const derivees = new Set(contrefactuellesDerivees(repertoire_run, execution.resultat.run_id).values());
    const verdicts = new Map(lireVerdicts(repertoire_run, execution.resultat.run_id).map((v) => [v.objet_note.id, v]));
    for (const { reponse } of refus) {
      const surElle = notations.filter((n) => n.objet_note.id === reponse.id);
      expect(surElle.map((n) => n.notateur.id).sort()).toEqual(["juge-simule-a", "juge-simule-b"]);
      expect(surElle.every((n) => n.categorie === "non_reponse" && n.sourcage.liens.length === 0)).toBe(true);
      expect(derivees.has(reponse.id)).toBe(false);
      const verdict = verdicts.get(reponse.id);
      if (verdict === undefined) expect(execution.resultat.attentes.some((a) => a.reponse_id === reponse.id)).toBe(true);
      else expect(verdict.categorie_retenue).toBe("non_reponse");
    }
  });

  it("une réponse tronquée est soumise telle quelle, troncature dite au juge, et notée sur ce qu'elle contient (§8)", async () => {
    const appels: Appel[] = [];
    const execution = await noter(nouvelleSortie(), parametresDeReference(), (env) => ({ ...env, juges: enregistreurs(env.juges, appels) }));
    const tronquees = execution.prepare.reponses.filter((r) => r.reponse.normalise.troncature);
    expect(tronquees.length).toBeGreaterThan(0);
    const issues = new Set([...execution.resultat.verdicts, ...execution.resultat.attentes.map((a) => a.reponse_id)]);
    for (const { reponse } of tronquees) {
      const charges = appels.filter((a) => a.charge.reponse_id === reponse.id).map((a) => a.charge);
      expect(charges.length).toBeGreaterThanOrEqual(2);
      for (const charge of charges) {
        expect(charge.reponse.troncature).toBe(true);
        expect(charge.reponse.texte).toBe(reponse.normalise.texte);
      }
      expect(issues.has(reponse.id)).toBe(true);
    }
  });

  it("les réponses brutes ne sont ni réécrites ni touchées par la notation (règle 7)", async () => {
    const sortie = nouvelleSortie();
    const prepare = await preparerNotationSimulee(options(sortie));
    const avant = instantane(dispositionRunNote(prepare.repertoire_run).reponses);
    await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));
    expect(instantane(dispositionRunNote(prepare.repertoire_run).reponses)).toEqual(avant);
  });
});

describe("6. un lien que le fournisseur ne connaît pas", () => {
  it("hors du sous-ensemble contrefactuel : la réponse est comptée en attente du test des liens, et n'est pas notée", async () => {
    const preparation = await preparerNotationSimulee(options(nouvelleSortie()));
    const cible = preparation.reponses.find((r) => r.reponse.question_id === QUESTION_SANS_NOM && r.reponse.normalise.liens.length > 0);
    expect(cible).toBeDefined();
    const id = cible?.reponse.id as string;
    const resultat = await noterRun(preparation.reponses, sansExistencePour(new Set([id]))(environnementSimule(preparation.repertoire_run, parametresDeReference())));
    expect(resultat.contrefactuel.statut).toBe("inscrit");
    expect(resultat.attentes.find((a) => a.reponse_id === id)?.motifs).toEqual(["test_liens"]);
    expect(lireNotationsDuRun(preparation.repertoire_run, resultat.run_id).notations.filter((n) => n.objet_note.id === id)).toEqual([]);
    expect(resultat.verdicts).not.toContain(id);
    const bilan = bilanNotation(preparation.repertoire_run, resultat, preparation.reponses.map((r) => r.reponse.id));
    expect(bilan.attentes_par_motif.test_liens).toBe(1);
  });

  it("dans le sous-ensemble : le test contrefactuel attend, aucune notation n'est demandée, aucune réponse n'est perdue", async () => {
    const preparation = await preparerNotationSimulee(options(nouvelleSortie()));
    const cible = preparation.reponses.find((r) => r.reponse.question_id === QUESTION_NOMMANTE && r.reponse.normalise.liens.length > 0);
    const id = cible?.reponse.id as string;
    const appels: Appel[] = [];
    const env = environnementSimule(preparation.repertoire_run, parametresDeReference());
    const resultat = await noterRun(preparation.reponses, sansExistencePour(new Set([id]))({ ...env, juges: enregistreurs(env.juges, appels) }));
    expect(resultat.contrefactuel).toEqual({ statut: "en_attente_test_liens", reponse_ids: [id] });
    expect(appels).toEqual([]);
    expect(resultat.attentes.find((a) => a.reponse_id === id)?.motifs).toEqual(["test_liens"]);
    expect(resultat.attentes.filter((a) => a.motifs.includes("contrefactuel_en_attente"))).toHaveLength(preparation.reponses.length - 1);
    expect(bilanNotation(preparation.repertoire_run, resultat, preparation.reponses.map((r) => r.reponse.id)).reponses_en_attente).toBe(preparation.reponses.length);
  });
});

describe("8. relance sur la même sortie", () => {
  it("reprend, ne réécrit ni ne crée aucun fichier, et rend le même bilan", async () => {
    const sortie = nouvelleSortie();
    const premiere = await lancerNotationSimulee(options(sortie), parametresDeReference());
    const avant = instantane(sortie);
    const seconde = await lancerNotationSimulee(options(sortie), parametresDeReference());
    expect(instantane(sortie)).toEqual(avant);
    expect(seconde.bilan).toEqual(premiere.bilan);
    expect(seconde.resultat.contrefactuel.statut).toBe("deja_inscrit");
  });

  it("un run.json qui porte un autre test contrefactuel n'est pas réécrit : ContrefactuelDejaInscrit", async () => {
    const sortie = nouvelleSortie();
    const { repertoire_run } = await lancerNotationSimulee(options(sortie), parametresDeReference());
    const chemin = dispositionRunNote(repertoire_run).run_json;
    const lu = JSON.parse(readFileSync(chemin, "utf8")) as { contrefactuel_candidats: Record<string, unknown> };
    ecrireJson(chemin, { ...lu, contrefactuel_candidats: { ...lu.contrefactuel_candidats, mentions_residuelles: 1 } });
    const avant = readFileSync(chemin, "utf8");
    await expect(lancerNotationSimulee(options(sortie), parametresDeReference())).rejects.toBeInstanceOf(ContrefactuelDejaInscrit);
    expect(readFileSync(chemin, "utf8")).toBe(avant);
  });

  it("un questions.json qui n'est pas celui des fixtures n'est pas réécrit : GelDivergent", async () => {
    const sortie = nouvelleSortie();
    const { repertoire_run } = await preparerNotationSimulee(options(sortie));
    const chemin = dispositionRunNote(repertoire_run).questions;
    ecrireJson(chemin, []);
    await expect(preparerNotationSimulee(options(sortie))).rejects.toBeInstanceOf(GelDivergent);
    expect(readFileSync(chemin, "utf8")).toBe("[]\n");
  });
});

describe("9. contrôle croisé sur la sortie d'un run propre", () => {
  it("controleCroise ne rapporte aucune violation, et pnpm notation:controle passe sur le répertoire produit", async () => {
    const { prepare } = await noter(nouvelleSortie());
    expect(violations(prepare.repertoire_run)).toEqual([]);
    const commande = executerOutil("notation-controle.ts", [prepare.repertoire_run]);
    expect(commande.sortie).toContain("aucune violation");
    expect(commande.status).toBe(0);
  });
});

describe("10. la charge reçue par le juge", () => {
  it("ne porte ni outil_id, ni alias_aveugle, ni mode, ni canal, ni requête, ni brut, ni métadonnées", async () => {
    const appels: Appel[] = [];
    const execution = await noter(nouvelleSortie(), parametresDeReference(), (env) => ({ ...env, juges: enregistreurs(env.juges, appels) }));
    const parId = new Map(execution.prepare.reponses.map((r) => [r.reponse.id, r.reponse]));
    const permutees = contrefactuellesDerivees(execution.prepare.repertoire_run, execution.resultat.run_id);
    expect(appels.length).toBeGreaterThan(0);
    for (const { charge } of appels) {
      const derivee = permutees.get(charge.reponse_id);
      const origine = parId.get(derivee === undefined ? charge.reponse_id : derivee);
      expect(origine).toBeDefined();
      if (origine === undefined) continue;
      const cles = clesDe(charge);
      for (const interdite of ["outil_id", "alias_aveugle", "mode", "canal", "requete", "metadonnees", "brut", "brut_texte", "brut_sha256", "brut_octets_sha256"]) {
        expect(cles, interdite).not.toContain(interdite);
      }
      const feuilles = feuillesDe(charge);
      for (const sentinelle of [origine.outil_id, origine.alias_aveugle, origine.mode, origine.canal]) expect(feuilles, sentinelle).not.toContain(sentinelle);
      const texte = JSON.stringify(charge);
      const empreintes = [origine.brut_octets_sha256, origine.requete.sha256, ...("brut_sha256" in origine ? [origine.brut_sha256] : [])];
      const modele = origine.metadonnees.modele_renvoye;
      for (const sentinelle of [...empreintes, origine.requete.endpoint, ...(modele === null ? [] : [modele])]) {
        expect(texte.includes(sentinelle), sentinelle).toBe(false);
      }
    }
  });
});

describe("11. le bilan", () => {
  it("compte les attentes humaines par motif, et verdicts + attentes = réponses obtenues", async () => {
    const { bilan, resultat, prepare } = await noter(nouvelleSortie());
    expect(bilan.reponses_obtenues).toBe(prepare.reponses.length);
    expect(bilan.verdicts + bilan.reponses_en_attente).toBe(bilan.reponses_obtenues);
    const parMotif = new Map<string, number>();
    for (const motif of resultat.attentes.flatMap((a) => a.motifs)) parMotif.set(motif, resultat.attentes.filter((a) => a.motifs.includes(motif)).length);
    expect(new Map(Object.entries(bilan.attentes_par_motif))).toEqual(parMotif);
    expect(Object.values(bilan.verdicts_par_mode).reduce((s, n) => s + n, 0)).toBe(bilan.verdicts);
  });

  it("une réponse sans issue lève ReponsePerdue", async () => {
    const { resultat, prepare } = await noter(nouvelleSortie());
    const ampute: ResultatChaine = { ...resultat, attentes: resultat.attentes.slice(1) };
    expect(() => bilanNotation(prepare.repertoire_run, ampute, prepare.reponses.map((r) => r.reponse.id))).toThrow(ReponsePerdue);
  });
});

describe("identité des juges", () => {
  it("un juge qui ne se présente pas comme run.json le déclare est refusé avant toute écriture", async () => {
    const preparation = await preparerNotationSimulee(options(nouvelleSortie()));
    const env = environnementSimule(preparation.repertoire_run, parametresDeReference());
    const [premier, second] = env.juges;
    if (premier === undefined || second === undefined) throw new Error("deux juges attendus");
    const usurpateur = { ...premier, identite: { ...premier.identite, prompt: { chemin: "prompts/judge-primaire", version: "1.0.0" } } };
    await expect(noterRun(preparation.reponses, { ...env, juges: [usurpateur, second] })).rejects.toBeInstanceOf(JugesNonConformes);
    expect(existsSync(dispositionRunNote(preparation.repertoire_run).notations)).toBe(false);
  });
});

/* ------------------------------------------------------------------ aides */

function auDelaDuSeuil(changements: { readonly numerateur: number; readonly denominateur: number } | undefined): boolean {
  if (changements === undefined) return false;
  return changements.numerateur * SEUIL_RETRAIT.denominateur > SEUIL_RETRAIT.numerateur * changements.denominateur;
}

function clesDe(valeur: unknown): readonly string[] {
  if (Array.isArray(valeur)) return valeur.flatMap(clesDe);
  if (typeof valeur !== "object" || valeur === null) return [];
  return Object.entries(valeur).flatMap(([cle, v]) => [cle, ...clesDe(v)]);
}

function feuillesDe(valeur: unknown): readonly unknown[] {
  if (Array.isArray(valeur)) return valeur.flatMap(feuillesDe);
  if (typeof valeur === "object" && valeur !== null) return Object.values(valeur).flatMap(feuillesDe);
  return [valeur];
}
