/**
 * Cas limites du validateur des 45 exemples, un test par cas listé dans le brief. Les cas 1 et 2
 * tournent sur les vrais fichiers de `schema/` : ce sont eux la garantie que `pnpm check` couvre
 * réellement le manifeste. Les cas 3 à 7 construisent un répertoire d'exemples jetable, pour
 * isoler chaque désaccord entre le manifeste et le schéma sans dépendre du contenu réel de
 * `schema/exemples/`.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listerFichiersExemplesSurDisque } from "../outils/schemas/disque.ts";
import { tenterValidationIsolee } from "../outils/schemas/isole.ts";
import type { Manifeste } from "../outils/schemas/manifeste.ts";
import { chargerManifeste } from "../outils/schemas/manifeste.ts";
import { verifierConformiteMetaSchema } from "../outils/schemas/meta.ts";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { validerContreManifeste } from "../outils/schemas/validation.ts";

const racineSchema = resolve(import.meta.dirname, "../schema");
const racineExemplesReels = resolve(racineSchema, "exemples");
const manifesteReel = resolve(racineExemplesReels, "manifeste.json");

// --- Fabriques pour les cas 3 à 7 : une mesure valide et une mesure à deux violations. ---

function mesureValideBrute(): Record<string, unknown> {
  return {
    id: "JE6Y9CC6TBCK6K7H6WNNZ7353S",
    version: 1,
    empreinte: "4b502fd1225fcfe3e99e3466bea4f871aba6bee8acd0896a1844868bd1552d8a",
    libelle: "TVA réduite sur les produits énergétiques",
    theme: "fiscalite_pouvoir_achat",
    formulation_canonique: "ramener la TVA sur les produits énergétiques à 5,5 %",
    fictive: false,
    historique: [
      {
        date: "2026-09-20T10:05:00+02:00",
        changement: "création",
        commit: "2f22765d04931a078909145ca628d2264c852d7d",
        version_resultante: 1,
      },
    ],
  };
}

/** Deux violations distinctes et indépendantes : `libelle` manquant, `theme` hors de l'énumération. */
function mesureDoubleViolationBrute(): Record<string, unknown> {
  const { libelle: _sansLibelle, ...reste } = mesureValideBrute();
  return { ...reste, theme: "hors_liste" };
}

interface RepertoireJetable {
  readonly racine: string;
  ecrire(cheminRelatif: string, contenu: unknown): void;
}

function repertoireJetable(): RepertoireJetable {
  const racine = mkdtempSync(join(tmpdir(), "banc-essai-schemas-"));
  return {
    racine,
    ecrire(cheminRelatif, contenu) {
      const chemin = join(racine, cheminRelatif);
      mkdirSync(join(chemin, ".."), { recursive: true });
      writeFileSync(chemin, JSON.stringify(contenu, null, 2), "utf8");
    },
  };
}

function manifesteDe(exemples: Manifeste["exemples"]): Manifeste {
  return { description: "manifeste de test", exemples };
}

let dossiersACreer: string[] = [];

afterEach(() => {
  for (const dossier of dossiersACreer) rmSync(dossier, { recursive: true, force: true });
  dossiersACreer = [];
});

function nouveauRepertoire(): RepertoireJetable {
  const repertoire = repertoireJetable();
  dossiersACreer.push(repertoire.racine);
  return repertoire;
}

describe("schémas réels : manifeste et méta-schéma", () => {
  it("1. les 74 exemples du manifeste réel donnent tous le résultat attendu", () => {
    const manifeste = chargerManifeste(manifesteReel);
    const { ajv } = construireRegistre(racineSchema);
    const rapport = validerContreManifeste(ajv, racineExemplesReels, manifeste);

    expect(manifeste.exemples).toHaveLength(74);
    const echecs = rapport.resultats.filter((resultat) => !resultat.reussi);
    expect(echecs).toEqual([]);
    expect(rapport.fichiersOrphelins).toEqual([]);
  });

  it("2. les dix-sept schémas réels sont conformes au méta-schéma draft 2020-12", () => {
    const conformites = verifierConformiteMetaSchema(racineSchema);
    expect(conformites).toHaveLength(17);
    for (const conformite of conformites) {
      expect(conformite.erreurs, `schéma "${conformite.nom}"`).toEqual([]);
      expect(conformite.conforme, `schéma "${conformite.nom}"`).toBe(true);
    }
  });
});

describe("désaccords entre manifeste et disque", () => {
  it("3. un exemple listé au manifeste mais absent du disque nomme le chemin", () => {
    const repertoire = nouveauRepertoire();
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/absente.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats).toHaveLength(1);
    expect(rapport.resultats[0]).toMatchObject({
      chemin: "mesure/absente.json",
      obtenu: "absent",
      reussi: false,
    });
  });

  it("4. un fichier du disque absent du manifeste nomme le chemin (le manifeste est exclu)", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/valide-01.json", mesureValideBrute());
    repertoire.ecrire("mesure/orpheline.json", mesureValideBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/valide-01.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.fichiersOrphelins).toEqual(["mesure/orpheline.json"]);
  });
});

describe("désaccords entre attendu et verdict ajv", () => {
  it("5. un exemple valide attendu que le schéma rejette est signalé en échec avec ses erreurs", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/rejetee.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/rejetee.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats[0]).toMatchObject({ obtenu: "invalide", reussi: false });
    expect(rapport.resultats[0]?.erreurs.length).toBeGreaterThan(0);
  });

  it("6. un exemple invalide attendu que le schéma accepte est signalé en échec", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/acceptee.json", mesureValideBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/acceptee.json", attendu: "invalide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats[0]).toMatchObject({ obtenu: "valide", reussi: false });
  });

  it("7. les deux violations d'un même objet sont toutes les deux rapportées, pas seulement la première", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/deux-violations.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/deux-violations.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);
    const erreurs = rapport.resultats[0]?.erreurs ?? [];

    expect(erreurs.length).toBeGreaterThanOrEqual(2);
    expect(erreurs.some((erreur) => erreur.instancePath === "" && erreur.keyword === "required")).toBe(true);
    expect(erreurs.some((erreur) => erreur.instancePath === "/theme")).toBe(true);
  });
});

describe("couplage du registre commun", () => {
  it("8. un schéma pris isolément sans le registre commun échoue en nommant la référence non résolue", () => {
    expect(() => tenterValidationIsolee("item", racineSchema)).toThrow(
      /urn:banc-essai-2027:schema:commun/,
    );
  });
});

describe("aucun fichier du disque n'est ignoré", () => {
  it("le lister des exemples réels ne rate ni la table de vérité ni les 74 exemples", () => {
    expect(listerFichiersExemplesSurDisque(racineExemplesReels)).toHaveLength(74);
  });
});
