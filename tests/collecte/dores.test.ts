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
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chargerManifeste } from "../../outils/schemas/manifeste.ts";
import { construireRegistre } from "../../outils/schemas/registre.ts";
import { urnSchema } from "../../outils/schemas/noms.ts";
import type { NomSchema } from "../../outils/schemas/noms.ts";
import { testerVerbatim } from "../../validation/domaine/verbatim.ts";
import { analyserVtt, horodatageDebut } from "../../validation/domaine/webvtt.ts";
import { lireTexteCanonique, lireTranscription } from "../../validation/io/staging.ts";

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
  { dore: "extraction-pdf.json", schema: "extraction-texte", exemple: "extraction-texte/valide-01-pdf.json" },
  { dore: "extraction-html.json", schema: "extraction-texte", exemple: "extraction-texte/valide-02-html.json" },
  { dore: "manifeste-video.json", schema: "collecte", exemple: "collecte/valide-03-video-yt-dlp.json" },
  { dore: "manifeste-audio.json", schema: "collecte", exemple: "collecte/valide-04-audio-yt-dlp.json" },
  { dore: "fiche-video.json", schema: "fiche-source", exemple: "fiche-source/valide-03-enregistrement-video.json" },
  { dore: "fiche-audio.json", schema: "fiche-source", exemple: "fiche-source/valide-04-enregistrement-audio.json" },
  { dore: "extraction-vtt.json", schema: "extraction-texte", exemple: "extraction-texte/valide-03-webvtt.json" },
  { dore: "transcription.json", schema: "transcription", exemple: "transcription/valide-01-video.json" },
];

const OBJETS_COLLECTE: readonly NomSchema[] = [
  "collecte",
  "fiche-source",
  "reprise-archivage",
  "extraction-texte",
  "transcription",
];

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

  it("chaque exemple valide de collecte, fiche-source, reprise-archivage, extraction-texte et transcription a son fichier doré", () => {
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
    { schema: "extraction-texte", fichier: "extraction-texte/invalide-01-pdf-avec-encodage.json", chemin: "", motCle: "not" },
    { schema: "extraction-texte", fichier: "extraction-texte/invalide-02-html-sans-encodage.json", chemin: "", motCle: "required" },
    { schema: "extraction-texte", fichier: "extraction-texte/invalide-03-webvtt-sans-vtt-sha256.json", chemin: "", motCle: "required" },
    {
      schema: "transcription",
      fichier: "transcription/invalide-01-temperature-non-nulle.json",
      chemin: "/parametres/decodage/temperature",
      motCle: "const",
    },
    { schema: "transcription", fichier: "transcription/invalide-02-revision-non-epinglee.json", chemin: "/modele/revision", motCle: "pattern" },
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

describe("source assemblée par pipeline/collecte/source.py:source_de", () => {
  const { ajv } = construireRegistre(racineSchema);

  it("sources/source-programme-pdf.json est conforme à commun#/$defs/source", () => {
    const valider = ajv.getSchema(`${urnSchema("commun")}#/$defs/source`);
    if (valider === undefined) throw new Error("commun#/$defs/source absent du registre");
    const valide = valider(lireDore("sources/source-programme-pdf.json"));
    expect(valider.errors).toBeNull();
    expect(valide).toBe(true);
  });

  it("la source et la fiche d'extraction désignent le même texte", () => {
    const source = lireDore("sources/source-programme-pdf.json");
    const extraction = lireDore("extraction-pdf.json");
    expect(source["texte_sha256"]).toBe(extraction["texte_sha256"]);
    expect(source["sha256"]).toBe(extraction["sha256_source"]);
  });
});

const SAUT_DE_LIGNE = String.fromCodePoint(0x0a);
const LIGATURE_FI = String.fromCodePoint(0xfb01);

describe("texte canonique écrit par Python, relu par l'interface de validation", () => {
  const extraction = lireDore("extraction-pdf.json");
  const texteSha = extraction["texte_sha256"] as string;
  const pages = extraction["pages"] as readonly { numero: number; debut: number; fin: number }[];
  const texte = lireTexteCanonique(racineDore, texteSha);
  const pageDeux = pages[1];
  if (pageDeux === undefined) throw new Error("extraction-pdf.json doit décrire deux pages");

  it("lireTexteCanonique le trouve sous son empreinte, qui est bien celle de ses octets", () => {
    if (texte === null) throw new Error(`textes/${texteSha}.txt absent`);
    expect(createHash("sha256").update(readFileSync(resolve(racineDore, "textes", `${texteSha}.txt`))).digest("hex")).toBe(texteSha);
  });

  it("longueur et intervalles de pages comptés en points de code, comme en Python (emoji compris)", () => {
    if (texte === null) throw new Error("texte absent");
    const points = Array.from(texte);
    expect(points.length).toBe(extraction["longueur"]);
    expect(texte.length).toBe(points.length + 1); // l'emoji compte double en UTF-16
    expect(points.slice(pageDeux.debut, pageDeux.fin).join("")).toBe(`Page deux${SAUT_DE_LIGNE}`);
  });

  it("testerVerbatim rend les offsets que Python a calculés", () => {
    if (texte === null) throw new Error("texte absent");
    const resultat = testerVerbatim("Page deux", texte);
    expect([resultat.offset_debut, resultat.offset_fin]).toEqual([40, 49]);
    expect(pageDeux.debut <= 40 && 49 <= pageDeux.fin).toBe(true);
  });

  it("une ligature conservée par l'extraction fait échouer une citation retapée sans elle", () => {
    if (texte === null) throw new Error("texte absent");
    expect(testerVerbatim("financement", texte).passe).toBe(false);
    expect(testerVerbatim(`${LIGATURE_FI}nancement`, texte).offset_debut).toBe(12);
  });
});

describe("transcription écrite par Python, relue par l'interface de validation (C3)", () => {
  const transcription = lireDore("transcription.json");
  const extraction = lireDore("extraction-vtt.json");
  const shaSource = transcription["sha256_source"] as string;
  const vtt = lireTranscription(racineDore, shaSource);
  const texte = lireTexteCanonique(racineDore, extraction["texte_sha256"] as string);

  it("lireTranscription trouve le .vtt sous l'empreinte du média, et ses octets sont ceux que les fiches nomment", () => {
    if (vtt === null) throw new Error(`transcriptions/${shaSource}.vtt absent`);
    const empreinte = createHash("sha256")
      .update(readFileSync(resolve(racineDore, "transcriptions", `${shaSource}.vtt`)))
      .digest("hex");
    expect(empreinte).toBe(transcription["vtt_sha256"]);
    expect(empreinte).toBe(extraction["vtt_sha256"]);
    expect(extraction["sha256_source"]).toBe(shaSource);
  });

  it("le texte que TypeScript dérive du .vtt est, au point de code près, celui que Python a écrit", () => {
    if (vtt === null || texte === null) throw new Error("transcription ou texte absent");
    const document = analyserVtt(vtt);
    expect(document.texte).toBe(texte);
    expect(Array.from(texte).length).toBe(extraction["longueur"]);
    expect(document.cues).toHaveLength(transcription["cues"] as number);
  });

  it("un offset du texte dérivé retombe sur l'horodatage de son cue, frontière comprise (NFD, emoji)", () => {
    if (vtt === null) throw new Error("transcription absente");
    const document = analyserVtt(vtt);
    expect(horodatageDebut(document, 0)).toBeCloseTo(3598.24, 6);
    expect(horodatageDebut(document, 29)).toBeCloseTo(3598.24, 6); // saut de ligne de jonction
    expect(horodatageDebut(document, 30)).toBe(3602); // « Seconde », mêmes offsets qu'en Python
    expect(horodatageDebut(document, 47)).toBe(3602); // « fin. », après l'emoji
  });
});
