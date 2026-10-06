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
  // 127 → 132 : cinq exemples invalides de run ajoutés (conformité n° 10, 19, 21 et par_mode).
  // 132 → 137 : un exemple valide et quatre invalides d'item ajoutés (conformité n° 11, 12, 13).
  // 137 → 140 : deux exemples invalides de question et un de tirage (conformité n° 37, prémisse résolue au gel).
  // 140 → 146 : six exemples invalides (conformité n° 59, 61, 62, 64 ×2, 66).
  // 146 → 152 : un exemple valide et cinq invalides de run (protocole 0.13, §7 et §12).
  // 152 → 158 : protocole 0.13, quatre invalides et un valide d'item (format, attestation), un invalide de fiche-source (tiers).
  // 158 → 159 : conformité 2026-09-29, n° 1, un invalide d'item (décision du panel sans statut_validation_anterieur).
  // 159 → 160 : décision de l'auteur du 2026-09-29, n° 8, un invalide de tirage (sans contestes_au_gel).
  // 160 → 164 : conformité 2026-09-29, n° 31 et 33, quatre invalides d'item (thème porté, sans mesure_version, quantification hors dimensions, adresse du contestataire).
  // 164 → 166 : conformité 2026-09-29, n° 24, deux invalides de tirage (entrée sans thème, entrée sans grappe).
  // 166 → 168 : décisions de l'auteur du 2026-10-01, deux invalides de run (planifié sans donnees_commit, symétrie sans condition de quota).
  // 168 → 176 : conformité 2026-09-29, n° 15 (trois invalides de run), n° 27 (trois invalides de réponse), n° 29 (un valide et un invalide de notation).
  // 176 → 178 : conformité 2026-09-29, n° 5, deux invalides de diagnostic de lot (sans kappa_par_question, kappa de question avec motif).
  // 178 → 179 : conformité 2026-09-29, n° 6, un valide d'item (non évaluable par le panel, attestation conservée).
  // 179 → 188 : décisions de l'auteur du 2026-10-02 (lot interrogation), trois valides et six invalides de réponse (refus_api, motif_manquante).
  // 188 → 192 : décisions de l'auteur du 2026-10-02 (suite du lot interrogation), un valide et trois invalides de réponse (brut_texte, brut_octets_sha256, requete.entetes).
  // 192 → 194 : décision D15 de l'auteur (lot notation), une notation valide et une invalide sous le motif extrait_invalide.
  // 194 → 196 : décision D17 de l'auteur, une notation et un verdict invalides portant la fraîcheur sans le drapeau obsolescence.
  // 196 → 202 : lot notation (entrées-sorties, §7), deux valides et quatre invalides de run (test contrefactuel publié : bloc, taux et effectifs des juges).
  it("1. les 202 exemples du manifeste réel donnent tous le résultat attendu", () => {
    const manifeste = chargerManifeste(manifesteReel);
    const { ajv } = construireRegistre(racineSchema);
    const rapport = validerContreManifeste(ajv, racineExemplesReels, manifeste);

    expect(manifeste.exemples).toHaveLength(202);
    const echecs = rapport.resultats.filter((resultat) => !resultat.reussi);
    expect(echecs).toEqual([]);
    expect(rapport.fichiersOrphelins).toEqual([]);
  });

  // 22 → 23 : perimetre (config/perimetre.yaml), conformité 2026-09-29, n° 23 et 25.
  it("2. les vingt-trois schémas réels sont conformes au méta-schéma draft 2020-12", () => {
    const conformites = verifierConformiteMetaSchema(racineSchema);
    expect(conformites).toHaveLength(23);
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
  // 127 → 132 : cinq exemples invalides de run ajoutés (conformité n° 10, 19, 21 et par_mode).
  // 132 → 137 : un exemple valide et quatre invalides d'item ajoutés (conformité n° 11, 12, 13).
  // 137 → 140 : deux exemples invalides de question et un de tirage (conformité n° 37, prémisse résolue au gel).
  // 140 → 146 : six exemples invalides (conformité n° 59, 61, 62, 64 ×2, 66).
  // 146 → 152 : un exemple valide et cinq invalides de run (protocole 0.13, §7 et §12).
  // 152 → 158 : protocole 0.13, quatre invalides et un valide d'item (format, attestation), un invalide de fiche-source (tiers).
  // 158 → 159 : conformité 2026-09-29, n° 1, un invalide d'item (décision du panel sans statut_validation_anterieur).
  // 159 → 160 : décision de l'auteur du 2026-09-29, n° 8, un invalide de tirage (sans contestes_au_gel).
  // 160 → 164 : conformité 2026-09-29, n° 31 et 33, quatre invalides d'item (thème porté, sans mesure_version, quantification hors dimensions, adresse du contestataire).
  // 164 → 166 : conformité 2026-09-29, n° 24, deux invalides de tirage (entrée sans thème, entrée sans grappe).
  // 166 → 168 : décisions de l'auteur du 2026-10-01, deux invalides de run (planifié sans donnees_commit, symétrie sans condition de quota).
  // 168 → 176 : conformité 2026-09-29, n° 15 (trois invalides de run), n° 27 (trois invalides de réponse), n° 29 (un valide et un invalide de notation).
  // 176 → 178 : conformité 2026-09-29, n° 5, deux invalides de diagnostic de lot (sans kappa_par_question, kappa de question avec motif).
  // 178 → 179 : conformité 2026-09-29, n° 6, un valide d'item (non évaluable par le panel, attestation conservée).
  // 179 → 188 : décisions de l'auteur du 2026-10-02 (lot interrogation), trois valides et six invalides de réponse (refus_api, motif_manquante).
  // 188 → 192 : décisions de l'auteur du 2026-10-02 (suite du lot interrogation), un valide et trois invalides de réponse (brut_texte, brut_octets_sha256, requete.entetes).
  // 192 → 194 : décision D15 de l'auteur (lot notation), une notation valide et une invalide sous le motif extrait_invalide.
  // 194 → 196 : décision D17 de l'auteur, une notation et un verdict invalides portant la fraîcheur sans le drapeau obsolescence.
  // 196 → 202 : lot notation (entrées-sorties, §7), deux valides et quatre invalides de run (test contrefactuel publié : bloc, taux et effectifs des juges).
  it("le lister des exemples réels ne rate ni la table de vérité ni les 202 exemples", () => {
    expect(listerFichiersExemplesSurDisque(racineExemplesReels)).toHaveLength(202);
  });
});
