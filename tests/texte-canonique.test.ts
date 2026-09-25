/**
 * §4 : « Le texte canonique est le seul texte que le test verbatim indexe et que l'interface de
 * validation montre ; il n'est jamais corrigé depuis l'interface. » (conformité 2026-09-24, n° 15)
 *
 * Trois propriétés, chacune gardée par un test qui tomberait si elle cessait d'être vraie :
 * l'empreinte du `.txt` est recalculée à chaque lecture et un écart refuse l'affichage ; le
 * texte montré est celui de `staging/textes/<texte_sha256>.txt` et aucun autre ; aucune route
 * n'écrit sous `staging/textes/`.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lireTexteCanonique, TexteCanoniqueAltere } from "../validation/io/staging.ts";
import { ROUTES, type Reponse } from "../validation/serveur/routes.ts";
import type { Contexte } from "../validation/serveur/contexte.ts";
import type { VueItem } from "../validation/serveur/vues.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, mesurePour, type Bac } from "./aides/bac.ts";
import { decision, GRILLE_TOUT_VRAI, itemP, source } from "./aides/fabriques.ts";

const CITATION = "Nous ramènerons la TVA sur l'énergie à 5,5 %.";
const TEXTE = `Préambule du programme fictif.\n${CITATION}\nFin du document.`;
/** Même longueur, même citation ailleurs : un leurre qui serait surligné à tort au même endroit. */
const LEURRE = `Leurre : ce n'est PAS le texte canonique\n${CITATION}\nFin du document.`;

function sha256(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

const SHA_TEXTE = sha256(TEXTE);
const SHA_LEURRE = sha256(LEURRE);
const DEBUT = TEXTE.indexOf(CITATION);

let bac: Bac;
let item: Item;

function appeler(contexte: Contexte, nom: string, params: readonly string[] = [], corps: unknown = null): Reponse {
  const route = ROUTES.find((candidate) => candidate.nom === nom);
  if (route === undefined) throw new Error(`Route inconnue : ${nom}`);
  return route.gestionnaire(contexte, params, corps);
}

function itemAvecTexte(): Item {
  const base = itemP();
  const assertion = base.assertion;
  if (assertion === undefined) throw new Error("itemP sans assertion");
  return itemP({
    assertion: {
      ...assertion,
      citation_verbatim: CITATION,
      source: source({ texte_sha256: SHA_TEXTE }),
      test_verbatim: {
        passe: true,
        date: "2026-09-03T10:00:00+02:00",
        version_normalisation: "1",
        offset_debut: DEBUT,
        offset_fin: DEBUT + CITATION.length,
      },
    },
  });
}

beforeEach(() => {
  bac = creerBac();
  item = itemAvecTexte();
  bac.ecrireItem(item);
  bac.ecrireMesure(mesurePour(item));
  bac.ecrireTexte(SHA_TEXTE, TEXTE);
  bac.ecrireTexte(SHA_LEURRE, LEURRE);
  bac.ecrireLot(lotDe("ent-001", [item], "entrainement"));
  bac.ecrireLot(lotDe("lot-002", [item], "reel"));
});

afterEach(() => {
  bac.detruire();
});

function alterer(): void {
  // Une coquille « corrigée » à la main, sous le nom d'origine du fichier.
  writeFileSync(join(bac.racine, "staging/textes", `${SHA_TEXTE}.txt`), TEXTE.replace("fictif", "fictive"), "utf8");
}

function decisionAvecCorrectionDeCitation(): unknown {
  return {
    lot_id: "ent-001",
    item_id: item.id,
    decision: "corriger",
    reponses_grille: { ...GRILLE_TOUT_VRAI, citation_fidele: false },
    corrections: [
      {
        cible: "item",
        chemin: "/assertion/citation_verbatim",
        ancienne_valeur: CITATION,
        nouvelle_valeur: "Nous ramènerons la TVA sur l'énergie",
      },
    ],
    commentaire: "citation trop longue",
    duree_affichage_ms: 1000,
    duree_active_ms: 900,
  };
}

describe("empreinte du texte canonique revérifiée à la lecture", () => {
  it("refuse un texte canonique dont l'empreinte ne correspond plus à son nom", () => {
    const racine = join(bac.racine, "staging");
    expect(lireTexteCanonique(racine, SHA_TEXTE)).toBe(TEXTE);

    alterer();
    expect(() => lireTexteCanonique(racine, SHA_TEXTE)).toThrow(TexteCanoniqueAltere);
    try {
      lireTexteCanonique(racine, SHA_TEXTE);
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(TexteCanoniqueAltere);
      const altere = erreur as TexteCanoniqueAltere;
      expect(altere.name).toBe("TexteCanoniqueAltere");
      expect(altere.attendue).toBe(SHA_TEXTE);
      expect(altere.obtenue).toBe(sha256(TEXTE.replace("fictif", "fictive")));
    }
  });

  it("un texte absent reste absent : null, jamais un texte de substitution", () => {
    expect(lireTexteCanonique(join(bac.racine, "staging"), "9".repeat(64))).toBeNull();
  });

  it("la vue d'un item dont le texte est altéré est refusée, sans rien du texte altéré", () => {
    alterer();
    const reponse = appeler(bac.contexte("a1"), "item", ["ent-001", item.id]);
    expect(reponse.statut).toBe(409);
    const corps = reponse.corps as { motif: string; detail: string };
    expect(corps.motif).toBe("empreinte_divergente");
    expect(corps.detail).toContain(SHA_TEXTE);
    expect(JSON.stringify(reponse)).not.toContain("fictive");
  });

  it("une correction de citation contre un texte altéré est refusée, et rien n'est écrit au journal", () => {
    alterer();
    const contexte = bac.contexte("a1");
    const reponse = appeler(contexte, "decision", [], decisionAvecCorrectionDeCitation());
    expect(reponse.statut).toBe(409);
    expect((reponse.corps as { motif: string }).motif).toBe("empreinte_divergente");
    expect(contexte.journal.lire("ent-001")).toEqual([]);
  });

  it("témoin : le même texte intact laisse passer la vue et la correction", () => {
    const contexte = bac.contexte("a1");
    expect(appeler(contexte, "item", ["ent-001", item.id]).statut).toBe(200);
    expect(appeler(contexte, "decision", [], decisionAvecCorrectionDeCitation()).statut).toBe(201);
  });
});

describe("le texte montré est le texte canonique, et lui seul", () => {
  it("la vue d'un item surligne le texte de staging/textes/<texte_sha256>.txt et aucun autre", () => {
    const reponse = appeler(bac.contexte("a1"), "item", ["ent-001", item.id]);
    expect(reponse.statut).toBe(200);
    const vue = reponse.corps as VueItem;
    const [lieu] = vue.sources;
    if (lieu === undefined) throw new Error("aucune source affichée");

    const surDisque = readFileSync(join(bac.racine, "staging/textes", `${SHA_TEXTE}.txt`), "utf8");
    expect(lieu.texte).toBe(surDisque);
    expect(lieu.offsets).toEqual({ debut: DEBUT, fin: DEBUT + CITATION.length });
    expect(surDisque.slice(DEBUT, DEBUT + CITATION.length)).toBe(CITATION);
    // Le leurre porte la même citation : seule sa présence dans la réponse trahirait un mauvais fichier.
    expect(JSON.stringify(vue)).not.toContain("Leurre");
  });
});

/* ------------------------------------------- aucune écriture sous staging/textes/ */

interface Entree {
  readonly chemin: string;
  readonly taille: number;
  readonly mtime_ns: bigint;
  readonly ino: bigint;
  readonly empreinte: string;
}

/** Arbre complet, récursif, avec octets, date de modification et inode : une réécriture à l'identique se voit aussi. */
function instantane(repertoire: string, prefixe = ""): Entree[] {
  const entrees: Entree[] = [];
  for (const nom of readdirSync(repertoire).sort()) {
    const chemin = join(repertoire, nom);
    const etat = statSync(chemin, { bigint: true });
    const relatif = `${prefixe}${nom}`;
    if (etat.isDirectory()) {
      entrees.push({ chemin: `${relatif}/`, taille: 0, mtime_ns: etat.mtimeNs, ino: etat.ino, empreinte: "" });
      entrees.push(...instantane(chemin, `${relatif}/`));
      continue;
    }
    const empreinte = createHash("sha256").update(readFileSync(chemin)).digest("hex");
    entrees.push({ chemin: relatif, taille: Number(etat.size), mtime_ns: etat.mtimeNs, ino: etat.ino, empreinte });
  }
  return entrees;
}

function parametresPour(nom: string, lot_id: string): readonly string[] {
  if (nom === "lot" || nom === "diagnostic") return [lot_id];
  if (nom === "item") return [lot_id, item.id];
  if (nom === "source") return [lot_id, item.id, "assertion"];
  return [];
}

function corpsPour(nom: string, lot_id: string): unknown {
  if (nom === "decision") return { ...(decisionAvecCorrectionDeCitation() as object), lot_id };
  if (nom === "annulation") return { lot_id };
  if (nom === "brouillon-ecrire") return { item_id: item.id, lot_id, duree_affichage_ms: 1, duree_active_ms: 1 };
  return null;
}

describe("aucune route n'écrit sous staging/textes/", () => {
  it("aucune route n'écrit sous staging/textes/", () => {
    const textes = join(bac.racine, "staging/textes");
    // L'autre annotateur a fini : la route du kappa calcule vraiment, au lieu de répondre « pas encore ».
    for (const lot_id of ["ent-001", "lot-002"]) {
      bac.journal("a2").ajouter(
        lot_id,
        decision({
          annotateur_id: "a2",
          item,
          decision: "accepter",
          lot_id,
          lot_nature: lot_id.startsWith("ent") ? "entrainement" : "reel",
        }),
      );
    }
    const avant = instantane(textes);
    expect(avant.length).toBe(2);

    const contexte = bac.contexte("a1");
    const statuts: string[] = [];
    // Deux passes : la seconde exerce l'annulation après une décision et les routes d'un lot réel
    // une fois l'entraînement achevé.
    for (const lot_id of ["ent-001", "lot-002", "ent-001", "lot-002"]) {
      for (const route of ROUTES) {
        const reponse = route.gestionnaire(contexte, parametresPour(route.nom, lot_id), corpsPour(route.nom, lot_id));
        statuts.push(`${route.nom}:${reponse.statut}`);
      }
    }
    // Les routes qui écrivent ont bien écrit ailleurs : sinon le test ne prouverait rien.
    expect(statuts).toContain("decision:201");
    expect(statuts).toContain("annulation:201");
    expect(statuts).toContain("brouillon-ecrire:204");
    expect(statuts).toContain("item:200");

    expect(instantane(textes)).toEqual(avant);
  });
});
