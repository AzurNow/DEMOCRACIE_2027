/**
 * Aveuglement : aucune route de l'interface ne peut renvoyer la décision de l'autre annotateur.
 *
 * La méthode est une énumération, pas un échantillon. Le test parcourt **toutes** les routes
 * déclarées, exécute chacune sur un dépôt où le second annotateur a rempli son journal de
 * valeurs sentinelles reconnaissables, et vérifie qu'aucune n'apparaît dans la réponse
 * sérialisée. Il compare en outre la table de routes à celle que le serveur enregistre
 * réellement : une route ajoutée plus tard sans y penser fait tomber la suite.
 *
 * Ce qui reste visible, et qui est assumé : le bit « l'autre a fini ce lot », sans lequel le
 * kappa ne peut pas être affiché. Un bit par lot, jamais par item.
 */

import { sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ROUTES, trouverRoute } from "../validation/serveur/routes.ts";
import { creerBac, lotDe, mesurePour, type Bac } from "./aides/bac.ts";
import { decision, GRILLE_TOUT_VRAI, itemP } from "./aides/fabriques.ts";
import type { Contexte } from "../validation/serveur/contexte.ts";
import type { Item } from "../validation/domaine/types.ts";

/** Chaînes que seul le journal du second annotateur contient. */
const SENTINELLES = {
  annotateur: "sentinelle-annotateur-b",
  commentaire: "SENTINELLE-COMMENTAIRE-DU-SECOND-ANNOTATEUR",
  correction: "SENTINELLE-VALEUR-CORRIGEE",
};

let bac: Bac;
let items: Item[];

beforeEach(() => {
  bac = creerBac();
  items = [itemP(), itemP({ id: "01JBANCESSA1000000001TEMZZ", candidat_id: "demo-beta" })];
  for (const item of items) {
    bac.ecrireItem(item);
    bac.ecrireMesure(mesurePour(item));
  }

  const lot = lotDe("lot-001", items, "reel", ["a1", SENTINELLES.annotateur]);
  bac.ecrireLot(lot);
  bac.ecrireLot(lotDe("ent-001", items, "entrainement", ["a1", SENTINELLES.annotateur]));

  // Le second annotateur a tout décidé, en semant des sentinelles partout où c'est possible.
  const journalAutre = bac.journal(SENTINELLES.annotateur);
  for (const lotCourant of ["ent-001", "lot-001"]) {
    for (const item of items) {
      journalAutre.ajouter(
        lotCourant,
        decision({
          annotateur_id: SENTINELLES.annotateur,
          item,
          decision: "corriger",
          lot_id: lotCourant,
          lot_nature: lotCourant.startsWith("ent") ? "entrainement" : "reel",
          commentaire: SENTINELLES.commentaire,
          corrections: [
            {
              cible: "item",
              chemin: "/assertion/paraphrase",
              ancienne_valeur: "avant",
              nouvelle_valeur: SENTINELLES.correction,
            },
          ],
        }),
      );
    }
  }

  // Le premier annotateur a décidé aussi : sans quoi le kappa ne serait jamais calculé et la
  // route la plus exposée ne serait pas exercée.
  const journalMien = bac.journal("a1");
  for (const lotCourant of ["ent-001", "lot-001"]) {
    for (const item of items) {
      journalMien.ajouter(
        lotCourant,
        decision({
          annotateur_id: "a1",
          item,
          decision: "accepter",
          lot_id: lotCourant,
          lot_nature: lotCourant.startsWith("ent") ? "entrainement" : "reel",
        }),
      );
    }
  }
});

afterEach(() => {
  bac.detruire();
});

/** Paramètres plausibles pour chaque route, afin qu'aucune ne réponde seulement 404. */
function parametresPour(nom: string): readonly string[] {
  const item = items[0] as Item;
  if (nom === "lot" || nom === "diagnostic") return ["lot-001"];
  if (nom === "item") return ["lot-001", item.id];
  if (nom === "source") return ["lot-001", item.id, "assertion"];
  return [];
}

function corpsPour(nom: string): unknown {
  const item = items[0] as Item;
  if (nom === "decision") {
    return {
      lot_id: "lot-001",
      item_id: item.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    };
  }
  if (nom === "annulation") return { lot_id: "lot-001" };
  if (nom === "brouillon-ecrire") {
    return { item_id: item.id, lot_id: "lot-001", duree_affichage_ms: 1, duree_active_ms: 1 };
  }
  return null;
}

function executer(contexte: Contexte, nom: string): string {
  const route = ROUTES.find((candidate) => candidate.nom === nom);
  if (route === undefined) throw new Error(`Route inconnue : ${nom}`);
  const reponse = route.gestionnaire(contexte, parametresPour(nom), corpsPour(nom));
  return JSON.stringify(reponse);
}

describe("aucune route ne laisse filtrer le journal de l'autre annotateur", () => {
  it("couvre toutes les routes déclarées, sans exception", () => {
    const contexte = bac.contexte("a1");
    const couvertes = ROUTES.map((route) => route.nom);
    expect(couvertes.length).toBeGreaterThan(0);

    for (const nom of couvertes) {
      const sortie = executer(contexte, nom);
      for (const [quoi, sentinelle] of Object.entries(SENTINELLES)) {
        expect(sortie.includes(sentinelle), `route ${nom} laisse filtrer ${quoi}`).toBe(false);
      }
    }
  });

  it("y compris la route du kappa, qui est la seule à lire les deux journaux", () => {
    const sortie = executer(bac.contexte("a1"), "diagnostic");
    for (const sentinelle of Object.values(SENTINELLES)) {
      expect(sortie.includes(sentinelle)).toBe(false);
    }
    // Elle renvoie bien un kappa : le test porterait à faux si la route ne calculait rien.
    expect(sortie).toContain("\"kappa\"");
    expect(sortie).toContain("\"les_deux_ont_fini\":true");
  });

  it("ne renvoie aucun identifiant d'item dans le diagnostic", () => {
    const sortie = executer(bac.contexte("a1"), "diagnostic");
    for (const item of items) expect(sortie.includes(item.id)).toBe(false);
  });

  it("le manifeste de lot servi ne nomme pas le second annotateur", () => {
    const sortie = executer(bac.contexte("a1"), "lot");
    expect(sortie.includes(SENTINELLES.annotateur)).toBe(false);
  });
});

describe("l'identité ne peut pas venir d'une requête", () => {
  it("aucun motif de route ne capture un identifiant d'annotateur", () => {
    for (const route of ROUTES) {
      expect(route.motif.source).not.toContain("annotateur");
    }
  });

  it("le journal refuse une entrée qui porte un autre annotateur", () => {
    const journal = bac.journal("a1");
    const item = items[0] as Item;
    expect(() =>
      journal.ajouter("lot-001", decision({ annotateur_id: "a2", item, decision: "accepter" })),
    ).toThrow(/ce journal est celui de a1/);
  });

  it("le journal d'un annotateur ne peut pas désigner le fichier d'un autre", () => {
    const journal = bac.journal("a1");
    expect(journal.chemin("lot-001")).toContain(`${sep}a1${sep}`);
    expect(() => journal.chemin("../a2/lot-001")).toThrow(/Identifiant de lot invalide/);
  });
});

describe("la table de routes est celle que le serveur applique", () => {
  it("chaque route déclarée est résolue par le routeur du serveur", () => {
    const exemples: Record<string, string> = {
      session: "/api/session",
      lot: "/api/lots/lot-001",
      diagnostic: "/api/lots/lot-001/diagnostic",
      item: "/api/lots/lot-001/items/ITEM1",
      decision: "/api/decisions",
      annulation: "/api/annulations",
      "brouillon-lire": "/api/brouillon",
      "brouillon-ecrire": "/api/brouillon",
      raccourcis: "/api/raccourcis",
      source: "/api/lots/lot-001/items/ITEM1/source/assertion",
    };

    // Si une route est ajoutée sans exemple ici, ce test tombe : c'est le but.
    expect(Object.keys(exemples).sort()).toEqual(ROUTES.map((route) => route.nom).sort());

    for (const route of ROUTES) {
      const trouvee = trouverRoute(route.methode, exemples[route.nom] as string);
      expect(trouvee?.route.nom, `route ${route.nom}`).toBe(route.nom);
    }
  });
});

describe("projection de l'item", () => {
  it("n'expose ni l'identité du modèle extracteur, ni l'accord des deux extractions", () => {
    const item = itemP({
      id: "01JBANCESSA100000001TEMEXT",
      assertion: {
        ...(itemP().assertion as NonNullable<Item["assertion"]>),
        extraction: {
          modeles: ["MODELE-SENTINELLE-A", "MODELE-SENTINELLE-B"],
          accord: "desaccord_contenu",
          detail_desaccord: "SENTINELLE-DESACCORD",
        },
      },
    });
    bac.ecrireItem(item);
    bac.ecrireMesure(mesurePour(item));
    bac.ecrireLot(lotDe("lot-ext", [item], "reel", ["a1", SENTINELLES.annotateur]));

    const route = ROUTES.find((candidate) => candidate.nom === "item");
    const sortie = JSON.stringify(
      route?.gestionnaire(bac.contexte("a1"), ["lot-ext", item.id], null),
    );

    expect(sortie).not.toContain("MODELE-SENTINELLE");
    expect(sortie).not.toContain("SENTINELLE-DESACCORD");
    expect(sortie).not.toContain("desaccord_contenu");
    expect(sortie).not.toContain("extraction");
    expect(sortie).not.toContain("statut_validation");
    expect(sortie).not.toContain("chemin_local");
    // …mais il contient bien de quoi travailler.
    expect(sortie).toContain("citation_verbatim");
  });
});
