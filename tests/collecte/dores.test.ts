/**
 * Accord entre le code Python de collecte, les schémas et leurs exemples (C1-bis, cas limites 11
 * et 12), sans validateur JSON Schema côté Python :
 * - pytest vérifie que `pipeline/collecte` reproduit les fichiers dorés octet pour octet
 *   (`tests/collecte/test_dores.py`) ;
 * - ce test les valide contre leur schéma avec le registre ajv de `pnpm check` ;
 * - et il vérifie que chaque exemple valide de `schema/exemples/` pour ces trois objets est
 *   identique octet pour octet à son fichier doré. Les exemples sont des copies, parce que
 *   l'outillage des exemples (`outils/schemas/validation.ts`, décompte sur disque de
 *   `tests/questions/invariants.test.ts`) ne lit que `schema/exemples/` ; ce test empêche la copie
 *   de diverger en silence.
 * Si l'un des trois côtés dérive, un test rougit.
 */
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chargerManifeste } from "../../outils/schemas/manifeste.ts";
import { construireRegistre } from "../../outils/schemas/registre.ts";
import { urnSchema } from "../../outils/schemas/noms.ts";
import type { NomSchema } from "../../outils/schemas/noms.ts";

const racineSchema = resolve(import.meta.dirname, "../../schema");
const racineExemples = resolve(racineSchema, "exemples");
const racineDore = resolve(import.meta.dirname, "dore");

interface Paire {
  readonly dore: string;
  readonly schema: NomSchema;
  readonly exemple: string;
}

/** Chaque fichier doré, le schéma qui le décrit, et l'exemple valide qui en est la copie. */
const PAIRES: readonly Paire[] = [
  { dore: "manifeste-archive.json", schema: "collecte", exemple: "collecte/valide-01-archive-wayback.json" },
  { dore: "manifeste-echec-archivage.json", schema: "collecte", exemple: "collecte/valide-02-echec-archivage.json" },
  { dore: "fiche-programme-pdf.json", schema: "fiche-source", exemple: "fiche-source/valide-01-programme-pdf.json" },
  { dore: "fiche-site-parti.json", schema: "fiche-source", exemple: "fiche-source/valide-02-site-parti-redirige.json" },
  { dore: "reprise-archivage.json", schema: "reprise-archivage", exemple: "reprise-archivage/valide-01-reprise-reussie.json" },
];

const OBJETS_COLLECTE: readonly NomSchema[] = ["collecte", "fiche-source", "reprise-archivage"];

/** Paires dont l'exemple n'est pas identique octet pour octet au fichier doré. */
function divergences(paires: readonly Paire[], dore: string, exemples: string): readonly string[] {
  return paires
    .filter((paire) => !readFileSync(join(dore, paire.dore)).equals(readFileSync(join(exemples, paire.exemple))))
    .map((paire) => `${paire.exemple} diverge de tests/collecte/dore/${paire.dore}`);
}

function lireDore(nom: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(racineDore, nom), "utf8")) as Record<string, unknown>;
}

describe("fichiers dorés produits par pipeline/collecte", () => {
  const { ajv } = construireRegistre(racineSchema);

  for (const paire of PAIRES) {
    it(`cas 11 : ${paire.dore} est conforme à schema/${paire.schema}.schema.json`, () => {
      const valider = ajv.getSchema(urnSchema(paire.schema));
      if (valider === undefined) throw new Error(`schéma ${paire.schema} absent du registre`);
      const valide = valider(lireDore(paire.dore));
      expect(valider.errors).toBeNull();
      expect(valide).toBe(true);
    });
  }

  it("les deux branches d'archivage du manifeste de contenu sont couvertes", () => {
    const archive = lireDore("manifeste-archive.json");
    const echec = lireDore("manifeste-echec-archivage.json");
    expect(archive).toHaveProperty("archive_url");
    expect(archive).not.toHaveProperty("echec_archivage");
    expect(echec).toHaveProperty("echec_archivage");
    expect(echec).not.toHaveProperty("archive_url");
  });

  it("chaque fichier doré sur le disque est apparié à un exemple, et réciproquement", () => {
    const surDisque = readdirSync(racineDore).filter((nom) => nom.endsWith(".json")).sort();
    expect(surDisque).toEqual(PAIRES.map((paire) => paire.dore).sort());
  });

  it("chaque exemple valide de collecte, fiche-source et reprise-archivage a son fichier doré", () => {
    const manifeste = chargerManifeste(resolve(racineExemples, "manifeste.json"));
    const valides = manifeste.exemples
      .filter((entree) => entree.attendu === "valide" && (OBJETS_COLLECTE as readonly string[]).includes(entree.objet))
      .map((entree) => entree.fichier)
      .sort();
    expect(valides).toEqual(PAIRES.map((paire) => paire.exemple).sort());
  });

  it("cas 12 : chaque exemple valide est identique octet pour octet à son fichier doré", () => {
    expect(divergences(PAIRES, racineDore, racineExemples)).toEqual([]);
  });
});

describe("cas 12 : la comparaison dorés/exemples voit une divergence", () => {
  function banc(contenuDore: string, contenuExemple: string): { dore: string; exemples: string; paire: Paire } {
    const racine = mkdtempSync(join(tmpdir(), "dores-"));
    const paire: Paire = { dore: "d.json", schema: "collecte", exemple: "collecte/valide-01.json" };
    const dore = join(racine, "dore");
    const exemples = join(racine, "exemples");
    mkdirSync(dore);
    mkdirSync(dirname(join(exemples, paire.exemple)), { recursive: true });
    writeFileSync(join(dore, paire.dore), contenuDore);
    writeFileSync(join(exemples, paire.exemple), contenuExemple);
    return { dore, exemples, paire };
  }

  it("un exemple qui diverge d'un seul octet (espace de fin) est nommé", () => {
    const { dore, exemples, paire } = banc('{\n  "a": 1\n}\n', '{\n  "a": 1\n} \n');
    expect(divergences([paire], dore, exemples)).toEqual([
      "collecte/valide-01.json diverge de tests/collecte/dore/d.json",
    ]);
  });

  it("un exemple identique n'est pas signalé", () => {
    const { dore, exemples, paire } = banc('{\n  "a": 1\n}\n', '{\n  "a": 1\n}\n');
    expect(divergences([paire], dore, exemples)).toEqual([]);
  });
});

describe("exemples invalides de la collecte : une seule raison chacun", () => {
  const { ajv } = construireRegistre(racineSchema);

  /** Erreur ajv attendue, seule, pour chaque exemple invalide. L'erreur « if » d'enveloppe d'un
   * then non satisfait n'est pas une seconde raison : elle accompagne toujours le required. */
  const ATTENDUES: readonly { schema: NomSchema; fichier: string; chemin: string; motCle: string }[] = [
    { schema: "collecte", fichier: "collecte/invalide-01-archive-url-et-echec.json", chemin: "", motCle: "oneOf" },
    { schema: "collecte", fichier: "collecte/invalide-02-sans-url-soumise.json", chemin: "", motCle: "required" },
    { schema: "fiche-source", fichier: "fiche-source/invalide-01-site-parti-sans-mention.json", chemin: "", motCle: "required" },
    { schema: "fiche-source", fichier: "fiche-source/invalide-02-lien-d-archive-dans-la-fiche.json", chemin: "", motCle: "additionalProperties" },
    { schema: "reprise-archivage", fichier: "reprise-archivage/invalide-01-lien-non-date.json", chemin: "/archive_url", motCle: "pattern" },
  ];

  for (const attendue of ATTENDUES) {
    it(`${attendue.fichier} échoue sur ${attendue.motCle} seulement`, () => {
      const valider = ajv.getSchema(urnSchema(attendue.schema));
      if (valider === undefined) throw new Error(`schéma ${attendue.schema} absent du registre`);
      expect(valider(JSON.parse(readFileSync(resolve(racineExemples, attendue.fichier), "utf8")))).toBe(false);
      if (valider.errors === null || valider.errors === undefined) throw new Error("ajv n'a rendu aucune erreur");
      const raisons = valider.errors.filter((erreur) => erreur.keyword !== "if");
      expect(raisons.map((erreur) => [erreur.instancePath, erreur.keyword])).toEqual([[attendue.chemin, attendue.motCle]]);
    });
  }
});
