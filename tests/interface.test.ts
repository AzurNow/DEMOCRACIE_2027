/**
 * Tests d'intégration sur les vraies routes : porte d'entraînement, retrait d'un item contesté,
 * vérification d'empreinte d'archive, et absence de ressource distante.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rejouer } from "../validation/domaine/journal.ts";
import { servirArchive } from "../validation/io/archives.ts";
import { ROUTES, type Reponse } from "../validation/serveur/routes.ts";
import type { Contexte } from "../validation/serveur/contexte.ts";
import { creerBac, lotDe, mesurePour, type Bac } from "./aides/bac.ts";
import { decision, GRILLE_TOUT_VRAI, itemP } from "./aides/fabriques.ts";
import type { Item } from "../validation/domaine/types.ts";

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
    itemP({ id: "01JBANCESSA100000001TEM0A1", candidat_id: "demo-alpha" }),
    itemP({ id: "01JBANCESSA100000001TEM0B2", candidat_id: "demo-beta" }),
  ];
  for (const item of items) {
    bac.ecrireItem(item);
    bac.ecrireMesure(mesurePour(item));
  }
  bac.ecrireLot(lotDe("ent-001", items, "entrainement"));
  bac.ecrireLot(lotDe("lot-002", items, "reel"));
});

afterEach(() => {
  bac.detruire();
});

describe("porte d'entraînement (§4)", () => {
  it("refuse un lot réel tant que l'entraînement n'est pas fini", () => {
    const corps = appeler(bac.contexte("a1"), "session").corps as {
      lots: { lot_id: string; accessible: boolean; motif_inaccessible: string | null }[];
    };
    const reel = corps.lots.find((lot) => lot.lot_id === "lot-002");
    expect(reel?.accessible).toBe(false);
    expect(reel?.motif_inaccessible).toContain("ent-001");
  });

  it("laisse l'entraînement accessible, évidemment", () => {
    const corps = appeler(bac.contexte("a1"), "session").corps as {
      lots: { lot_id: string; accessible: boolean }[];
    };
    expect(corps.lots.find((lot) => lot.lot_id === "ent-001")?.accessible).toBe(true);
  });

  it("ouvre le lot réel une fois l'entraînement terminé", () => {
    const journal = bac.journal("a1");
    for (const item of items) {
      journal.ajouter(
        "ent-001",
        decision({ annotateur_id: "a1", item, decision: "accepter", lot_id: "ent-001", lot_nature: "entrainement" }),
      );
    }
    const corps = appeler(bac.contexte("a1"), "session").corps as {
      lots: { lot_id: string; accessible: boolean }[];
    };
    expect(corps.lots.find((lot) => lot.lot_id === "lot-002")?.accessible).toBe(true);
  });

  it("la vue d'un lot réel porte elle aussi le blocage", () => {
    const corps = appeler(bac.contexte("a1"), "lot", ["lot-002"]).corps as {
      accessible: boolean;
      motif_inaccessible: string | null;
    };
    expect(corps.accessible).toBe(false);
    expect(corps.motif_inaccessible).not.toBeNull();
  });
});

/**
 * Un item « contestee » porte au moins une contestation (`item.schema.json`) : sans elle, la
 * lecture de `staging/` le refuse désormais comme non conforme.
 */
function contester(item: Item): Item {
  return {
    ...item,
    statut_contestation: "contestee",
    contestations: [
      {
        id: "01JBANCESSA1C0NTESTAT10N01",
        date_reception: "2026-09-25T09:00:00+02:00",
        texte: "Texte de contestation fictif.",
        contestataire_type: "campagne",
      },
    ],
  };
}

describe("item contesté (§4, droit de réponse)", () => {
  it("sort du lot dès l'affichage, et le retrait est journalisé une seule fois", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    const contexte = bac.contexte("a1");

    const premiere = appeler(contexte, "item", ["ent-001", conteste.id]);
    expect(premiere.statut).toBe(409);
    expect((premiere.corps as { retire: boolean }).retire).toBe(true);

    const seconde = appeler(contexte, "item", ["ent-001", conteste.id]);
    expect(seconde.statut).toBe(409);

    const entrees = bac.journal("a1").lire("ent-001");
    expect(entrees.filter((entree) => entree.type_entree === "retrait_item")).toHaveLength(1);
  });

  it("refuse aussi la décision sur un item contesté", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    const reponse = appeler(bac.contexte("a1"), "decision", [], {
      lot_id: "ent-001",
      item_id: conteste.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(reponse.statut).toBe(409);
  });

  it("l'item retiré sort du dénominateur du kappa, et n'est pas compté comme un désaccord", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);

    // Les deux annotateurs décident l'item restant, et rencontrent l'item contesté.
    for (const annotateur of ["a1", "a2"]) {
      const contexte = bac.contexte(annotateur);
      appeler(contexte, "item", ["lot-002", conteste.id]);
      bac.journal(annotateur).ajouter(
        "lot-002",
        decision({
          annotateur_id: annotateur,
          item: items[1] as Item,
          decision: "accepter",
          lot_id: "lot-002",
        }),
      );
    }

    const corps = appeler(bac.contexte("a1"), "diagnostic", ["lot-002"]).corps as {
      les_deux_ont_fini: boolean;
      kappa: { n: number };
    };
    expect(corps.les_deux_ont_fini).toBe(true);
    expect(corps.kappa.n).toBe(1);
  });
});

describe("le kappa n'apparaît qu'une fois les deux lots finis", () => {
  it("ne dit rien tant que le second annotateur n'a pas terminé", () => {
    for (const item of items) {
      bac.journal("a1").ajouter(
        "lot-002",
        decision({ annotateur_id: "a1", item, decision: "accepter", lot_id: "lot-002" }),
      );
    }
    const corps = appeler(bac.contexte("a1"), "diagnostic", ["lot-002"]).corps as {
      les_deux_ont_fini: boolean;
      kappa: unknown;
    };
    expect(corps.les_deux_ont_fini).toBe(false);
    expect(corps.kappa).toBeNull();
  });
});

describe("annulation par l'interface", () => {
  it("écrit une entrée d'annulation et laisse l'ancienne décision en place", () => {
    const contexte = bac.contexte("a1");
    const item = items[0] as Item;
    appeler(contexte, "decision", [], {
      lot_id: "ent-001",
      item_id: item.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });

    const reponse = appeler(contexte, "annulation", [], { lot_id: "ent-001" });
    expect(reponse.statut).toBe(201);

    const entrees = bac.journal("a1").lire("ent-001");
    expect(entrees).toHaveLength(2);
    expect(rejouer(entrees).decisions.size).toBe(0);
  });

  it("répond proprement quand il n'y a rien à annuler", () => {
    expect(appeler(bac.contexte("a1"), "annulation", [], { lot_id: "ent-001" }).statut).toBe(409);
  });
});

describe("archives servies", () => {
  it("refuse une archive dont l'empreinte ne correspond plus", () => {
    const chemin = join(bac.racine, "archive.txt");
    writeFileSync(chemin, "contenu d'origine", "utf8");
    const bonne = servirArchive({
      racine: bac.racine,
      chemin_local: "archive.txt",
      sha256: "0".repeat(64),
    });
    expect(bonne.ok).toBe(false);
    expect(bonne.ok === false && bonne.motif).toBe("empreinte_divergente");
  });

  it("refuse de sortir de la racine autorisée", () => {
    const resultat = servirArchive({
      racine: join(bac.racine, "staging"),
      chemin_local: "../../etc/passwd",
      sha256: "0".repeat(64),
    });
    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.motif).toBe("hors_perimetre");
  });

  it("sert un fichier dont l'empreinte correspond", () => {
    const contenu = "contenu archivé";
    writeFileSync(join(bac.racine, "archive.txt"), contenu, "utf8");
    const attendue = createHash("sha256").update(contenu, "utf8").digest("hex");
    const resultat = servirArchive({ racine: bac.racine, chemin_local: "archive.txt", sha256: attendue });
    expect(resultat.ok).toBe(true);
    expect(resultat.ok === true && resultat.contenu.toString("utf8")).toBe(contenu);
  });

  it("refuse un fichier absent plutôt que de servir du vide", () => {
    const resultat = servirArchive({
      racine: bac.racine,
      chemin_local: "jamais-collectee.pdf",
      sha256: "0".repeat(64),
    });
    expect(resultat.ok === false && resultat.motif).toBe("fichier_absent");
  });
});

describe("aucune ressource distante", () => {
  const racineDepot = join(import.meta.dirname, "..");

  it("le client ne référence aucune URL externe", () => {
    const fichiers = [
      "validation/client/index.html",
      "validation/client/style.css",
      "validation/client/app.ts",
      "validation/client/api.ts",
      "validation/client/source.ts",
      "validation/client/edition.ts",
    ];
    for (const fichier of fichiers) {
      const contenu = readFileSync(join(racineDepot, fichier), "utf8");
      const urls = contenu.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      expect(urls, `${fichier} référence ${urls.join(", ")}`).toEqual([]);
    }
  });

  it("la politique de sécurité de contenu n'autorise que l'origine locale", () => {
    const serveur = readFileSync(join(racineDepot, "validation/serveur/principal.ts"), "utf8");
    expect(serveur).toContain("default-src 'self'");
    expect(serveur).toContain('const ADRESSE = "127.0.0.1"');
    expect(serveur).toContain("serveur.listen(port, ADRESSE");
  });

  it("le serveur n'écoute sur aucune adresse d'écoute globale", () => {
    // Les commentaires sont écartés : l'un d'eux explique justement pourquoi 0.0.0.0 est exclu.
    const code = readFileSync(join(racineDepot, "validation/serveur/principal.ts"), "utf8")
      .split("\n")
      .filter((ligne) => !/^\s*(\*|\/\/|\/\*)/.test(ligne))
      .join("\n");
    expect(code).not.toContain("0.0.0.0");
    expect(code).not.toContain("::");
  });
});
