/**
 * Validation de schéma à l'exécution (revue du 2026-09-23, constat 2) : chaque donnée lue ou
 * écrite par l'interface de validation et par `pnpm promote` est confrontée à son JSON Schema, et
 * refusée bruyamment si elle n'y est pas conforme.
 *
 * Cas limites du brief, numérotés comme lui : 1 et 2 portent sur `valider` lui-même, 3 à 6 et 8
 * sur chaque frontière. Le cas 7 (`pnpm symmetry`) vit dans `symmetry-cli.test.ts`.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { construireRegistre } from "../outils/schemas/registre.ts";
import type { NomSchema } from "../outils/schemas/noms.ts";
import {
  creerValideur,
  ErreurSchema,
  RACINE_SCHEMAS,
  SchemaInconnu,
  valider,
} from "../outils/schemas/valider.ts";
import type { DecisionCorrectionMesure } from "../validation/domaine/corrections-mesure.ts";
import type { Correction, EntreeJournal, Item } from "../validation/domaine/types.ts";
import { ajouterAuRegistre, cheminRegistre, lireRegistre } from "../validation/io/mesures-fichier.ts";
import { chargerStaging } from "../validation/io/staging.ts";
import type { Contexte } from "../validation/serveur/contexte.ts";
import { ROUTES, type Reponse } from "../validation/serveur/routes.ts";
import { creerBac, lotDe, mesurePour, resceller, type Bac } from "./aides/bac.ts";
import { decision, GRILLE_TOUT_VRAI, itemP, mesure } from "./aides/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");

function exemple(chemin: string): unknown {
  return JSON.parse(readFileSync(join(RACINE_SCHEMAS, "exemples", chemin), "utf8"));
}

function erreurDe(action: () => unknown): Error {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("aucune erreur levée");
}

/* ------------------------------------------------------------ 1. valider */

describe("1. valider", () => {
  it("renvoie une valeur conforme telle quelle, sans la copier ni la compléter", () => {
    const mesureConforme = exemple("mesure/valide-01-mesure-reelle.json");
    const copie = structuredClone(mesureConforme);
    const rendue = valider("mesure", mesureConforme, "exemple de mesure");
    expect(rendue).toBe(mesureConforme);
    expect(rendue).toStrictEqual(copie);
  });

  it("lève une erreur qui nomme la provenance, le schéma et le chemin d'instance fautif", () => {
    const fautive = { ...(exemple("mesure/valide-01-mesure-reelle.json") as object), theme: "hors_liste" };
    const erreur = erreurDe(() => valider("mesure", fautive, "staging/mesures/fautive.json"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("staging/mesures/fautive.json");
    expect(erreur.message).toContain("« mesure »");
    expect(erreur.message).toContain("/theme");
    expect((erreur as ErreurSchema).chemins).toContain("/theme");
    expect((erreur as ErreurSchema).provenance).toBe("staging/mesures/fautive.json");
  });

  it("refuse un nom de schéma inconnu au lieu de laisser passer la valeur", () => {
    const erreur = erreurDe(() => valider("inexistant" as NomSchema, {}, "essai"));
    expect(erreur).toBeInstanceOf(SchemaInconnu);
    expect(erreur.message).toContain("inexistant");
  });

  it("refuse `commun`, qui ne décrit aucun objet et accepterait n'importe quelle valeur", () => {
    expect(() => valider("commun", { importe: "quoi" }, "essai")).toThrow(SchemaInconnu);
  });
});

/* ------------------------------------------------------------ 2. registre */

describe("2. registre construit une fois par processus", () => {
  it("n'est construit qu'au premier appel, puis réutilisé", () => {
    let constructions = 0;
    const validerCompte = creerValideur(() => {
      constructions += 1;
      return construireRegistre(RACINE_SCHEMAS);
    });
    expect(constructions).toBe(0);

    const mesureConforme = exemple("mesure/valide-01-mesure-reelle.json");
    validerCompte("mesure", mesureConforme, "premier appel");
    validerCompte("mesure", mesureConforme, "deuxième appel");
    validerCompte("decision-mesure", exemple("decision-mesure/valide-01-acceptation.json"), "troisième");
    expect(() => validerCompte("mesure", {}, "quatrième, non conforme")).toThrow(ErreurSchema);

    expect(constructions).toBe(1);
  });
});

/* ---------------------------------------------------- bac et appel de route */

let bac: Bac;
let items: Item[];

function appeler(contexte: Contexte, nom: string, params: readonly string[] = [], corps: unknown = null): Reponse {
  const route = ROUTES.find((candidate) => candidate.nom === nom);
  if (route === undefined) throw new Error(`Route inconnue : ${nom}`);
  return route.gestionnaire(contexte, params, corps);
}

beforeEach(() => {
  bac = creerBac();
  items = [
    itemP({ id: "01JBANCESSA1000000000TEM91", candidat_id: "demo-alpha" }),
    itemP({ id: "01JBANCESSA1000000000TEM92", candidat_id: "demo-beta" }),
  ];
  for (const item of items) {
    bac.ecrireItem(item);
    bac.ecrireMesure(mesurePour(item));
  }
  bac.ecrireLot(lotDe("ent-009", items, "entrainement"));
});

afterEach(() => {
  bac.detruire();
});

/* ------------------------------------------------------------ 3. staging */

describe("3. lecture de staging/", () => {
  it("échoue sur un item dont la position est hors vocabulaire, en nommant le fichier", () => {
    const premier = items[0] as Item;
    const assertion = premier.assertion as NonNullable<Item["assertion"]>;
    bac.ecrireItem({ ...premier, assertion: { ...assertion, position: "plutot_pour" } });
    const fichier = join(bac.racine, "staging/items", `${premier.id}.json`);

    const erreur = erreurDe(() => chargerStaging(join(bac.racine, "staging")));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain(fichier);
    expect(erreur.message).toContain("/assertion/position");
  });

  it("échoue sur une mesure non conforme, en nommant le fichier", () => {
    const fautive = mesure({ id: (items[0] as Item).mesure_id, theme: "hors_liste" });
    bac.ecrireMesure(fautive);
    const erreur = erreurDe(() => chargerStaging(join(bac.racine, "staging")));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain(join(bac.racine, "staging/mesures", `${fautive.id}.json`));
  });

  it("charge un staging conforme sans rien en retirer", () => {
    const staging = chargerStaging(join(bac.racine, "staging"));
    expect([...staging.items.keys()].sort()).toStrictEqual(items.map((item) => item.id).sort());
  });
});

/* ------------------------------------------------------------ 4. journal */

function decisionApprouver(item: Item, lot_id: string): EntreeJournal {
  const conforme = decision({ annotateur_id: "a1", item, decision: "accepter", lot_id });
  // Empreinte recalculée : la ligne est cohérente, seule sa conformité au schéma est en cause.
  return resceller({ ...conforme, decision: "approuver" } as unknown as EntreeJournal);
}

describe("4. journal des décisions", () => {
  it("une ligne lue non conforme arrête la lecture en nommant le fichier et le numéro de ligne", () => {
    const journal = bac.journal("a1");
    journal.ajouter("ent-009", decision({ annotateur_id: "a1", item: items[0] as Item, decision: "accepter", lot_id: "ent-009" }));
    const chemin = journal.chemin("ent-009");
    writeFileSync(chemin, `${readFileSync(chemin, "utf8")}${JSON.stringify(decisionApprouver(items[1] as Item, "ent-009"))}\n`);

    const erreur = erreurDe(() => journal.lire("ent-009"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain(`${chemin}, ligne 2`);
    expect(erreur.message).toContain("/decision");
  });

  it("une entrée non conforme n'est jamais ajoutée : le fichier reste identique octet pour octet", () => {
    const journal = bac.journal("a1");
    journal.ajouter("ent-009", decision({ annotateur_id: "a1", item: items[0] as Item, decision: "accepter", lot_id: "ent-009" }));
    const chemin = journal.chemin("ent-009");
    const avant = readFileSync(chemin);

    expect(() => journal.ajouter("ent-009", decisionApprouver(items[1] as Item, "ent-009"))).toThrow(ErreurSchema);
    expect(readFileSync(chemin).equals(avant)).toBe(true);
  });

  it("une entrée non conforme ne crée pas non plus de journal", () => {
    const journal = bac.journal("a1");
    expect(() => journal.ajouter("ent-009", decisionApprouver(items[0] as Item, "ent-009"))).toThrow(ErreurSchema);
    expect(existsSync(journal.chemin("ent-009"))).toBe(false);
  });
});

/* ---------------------------------------------------- 5. POST /api/decisions */

describe("5. POST /api/decisions", () => {
  function soumettre(valeurDecision: string): Reponse {
    return appeler(bac.contexte("a1"), "decision", [], {
      lot_id: "ent-009",
      item_id: (items[0] as Item).id,
      decision: valeurDecision,
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
  }

  it("refuse `decision: \"approuver\"` avec un 400, et n'écrit rien au journal", () => {
    const chemin = bac.journal("a1").chemin("ent-009");
    const reponse = soumettre("approuver");
    expect(reponse.statut).toBe(400);
    expect(JSON.stringify(reponse.corps)).toContain("requête POST /api/decisions");
    expect(JSON.stringify(reponse.corps)).toContain("/decision");
    expect(existsSync(chemin)).toBe(false);
  });

  it("n'altère pas un journal existant quand la requête est refusée", () => {
    expect(soumettre("accepter").statut).toBe(201);
    const chemin = bac.journal("a1").chemin("ent-009");
    const avant = readFileSync(chemin);
    expect(soumettre("approuver").statut).toBe(400);
    expect(readFileSync(chemin).equals(avant)).toBe(true);
  });
});

/* ------------------------------------------------------------ 6. promotion */

function promouvoir(racine: string) {
  const resultat = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(RACINE, "outils/promote.ts"),
      `--staging=${join(racine, "staging")}`,
      `--lots=${join(racine, "validation/lots")}`,
      `--decisions=${join(racine, "validation/decisions")}`,
      `--mesures=${join(racine, "validation/mesures")}`,
      `--data=${join(racine, "data/items")}`,
    ],
    { encoding: "utf8" },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

function fichiersDansData(racine: string): readonly string[] {
  const repertoire = join(racine, "data/items");
  return existsSync(repertoire) ? readdirSync(repertoire) : [];
}

describe("6. pnpm promote", () => {
  function deciderLot(corrections: readonly Correction[]): Item {
    const item = items[0] as Item;
    bac.ecrireLot(lotDe("lot-019", [item]));
    const sens = corrections.length === 0 ? "accepter" : "corriger";
    for (const annotateur of ["a1", "a2"]) {
      bac.journal(annotateur).ajouter("lot-019", decision({ annotateur_id: annotateur, item, decision: sens, lot_id: "lot-019", corrections }));
    }
    return item;
  }

  it("une correction qui rend l'item non conforme : signalée, rien n'est écrit, code non nul", () => {
    const item = deciderLot([
      { cible: "item", chemin: "/assertion/position", ancienne_valeur: "pour", nouvelle_valeur: "plutot_pour" },
    ]);
    const resultat = promouvoir(bac.racine);
    expect(resultat.status).toBe(1);
    expect(resultat.sortie).toMatch(/Items à promouvoir non conformes au schéma : 1/);
    expect(resultat.sortie).toMatch(new RegExp(`${item.id}\\s+\\[lot-019\\]`));
    expect(resultat.sortie).toContain("/assertion/position");
    expect(resultat.erreur).toContain("rien n'est écrit");
    expect(fichiersDansData(bac.racine)).toStrictEqual([]);
  });

  it("un item conforme reste à écrire comme avant, sans signalement", () => {
    deciderLot([]);
    const resultat = promouvoir(bac.racine);
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toMatch(/À écrire par --ecrire : 1/);
    expect(resultat.sortie).not.toContain("non conformes au schéma");
  });
});

/* ----------------------------------------------- 8. registre des mesures */

describe("8. registre des corrections de mesure", () => {
  const repertoire = () => join(bac.racine, "validation/mesures");

  function entreeConforme(): DecisionCorrectionMesure {
    return {
      mesure_id: (items[0] as Item).mesure_id,
      mesure_version: 1,
      theme_demande: "ecologie_energie",
      decision: "acceptee",
      date: "2026-09-24",
    };
  }

  it("un registre dont une entrée n'est pas conforme au schéma est refusé à la lecture", () => {
    // `validerEntreeRegistre` accepte ce thème (une chaîne non vide) ; le schéma, lui, le restreint
    // aux dix thèmes du §3.
    mkdirSync(repertoire(), { recursive: true });
    writeFileSync(
      cheminRegistre(repertoire()),
      JSON.stringify([entreeConforme(), { ...entreeConforme(), theme_demande: "hors_liste" }]),
    );
    const erreur = erreurDe(() => lireRegistre(repertoire()));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain(`${cheminRegistre(repertoire())}, entrée 2`);
    expect(erreur.message).toContain("/theme_demande");
  });

  it("une entrée non conforme n'est jamais ajoutée, et le registre reste identique", () => {
    ajouterAuRegistre(repertoire(), entreeConforme());
    const avant = readFileSync(cheminRegistre(repertoire()));
    expect(() => ajouterAuRegistre(repertoire(), { ...entreeConforme(), theme_demande: "hors_liste" })).toThrow(
      ErreurSchema,
    );
    expect(readFileSync(cheminRegistre(repertoire())).equals(avant)).toBe(true);
  });
});
