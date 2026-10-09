/**
 * Cas limite 18 du lot test-liens : le fournisseur d'existences adossé à `volume/liens/` d'un run.
 *
 * Verdicts lus et rendus pour les liens demandés seulement ; un fichier invalide au schéma ou
 * incohérent lève une erreur nommée à la construction ; un lien sans fichier est absent du résultat,
 * et la réponse qui le cite reste « en attente du test des liens ». Les fichiers posés ici sont les
 * fichiers dorés de `tests/liens/dore/`, ceux que `pipeline/liens` (Python) reproduit octet pour octet.
 */

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { etatDesTaches } from "../../notation-humaine/serveur/taches.ts";
import { FOURNISSEUR_SANS_EXISTENCE, fournisseurDuRun } from "../../notation-humaine/serveur/fournisseur.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import { FichierExistenceRefuse, fournisseurFichiers, nomResultat, repertoireLiens } from "../../pipeline/notation/fournisseur-fichiers.ts";
import { LIEN, monter, type Monde } from "../notation-humaine/fixture.ts";

const DORE = resolve(import.meta.dirname, "../liens/dore");
const EXISTE = "https://example.org/programme";
const MORT = "https://example.org/retire";
const INACCESSIBLE = "https://example.org/reserve";
const ECARTE = "https://example.org/ferme";
const ECHEC = "https://example.org/fragile";
const PAGE = Buffer.from("<!DOCTYPE html>\r\n<p>Programme — « éducation »</p>\r\n", "utf8");
/** D21 : la version brute de l'instantané de INACCESSIBLE, téléchargée par `pipeline/liens`. */
const COPIE = Buffer.from("<!DOCTYPE html>\r\n<p>Réservé — copie archivée</p>\r\n", "utf8");

let nettoyages: (() => void)[] = [];

afterEach(() => {
  for (const nettoyer of nettoyages) nettoyer();
  nettoyages = [];
});

function runVide(): string {
  const run = mkdtempSync(join(tmpdir(), "fournisseur-fichiers-"));
  nettoyages.push(() => rmSync(run, { recursive: true, force: true }));
  mkdirSync(join(repertoireLiens(run), "pages"), { recursive: true });
  return run;
}

function lireDore(nom: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(DORE, nom), "utf8")) as Record<string, unknown>;
}

function poser(run: string, url: string, contenu: Record<string, unknown>): void {
  writeFileSync(join(repertoireLiens(run), nomResultat(url)), `${JSON.stringify(contenu, null, 2)}\n`, "utf8");
}

function empreinte(octets: Buffer): string {
  return createHash("sha256").update(octets).digest("hex");
}

/**
 * Un run dont le test des liens a tranché cinq URL : existe (page conservée), mort, inaccessible avec
 * copie archivée téléchargée, inaccessible à instantané écarté, inaccessible à téléchargement en échec.
 */
function runTeste(): string {
  const run = runVide();
  for (const octets of [PAGE, COPIE]) writeFileSync(join(repertoireLiens(run), "pages", `${empreinte(octets)}.html`), octets);
  const dores = [
    [EXISTE, "existe.json"],
    [MORT, "mort.json"],
    [INACCESSIBLE, "inaccessible-instantane.json"],
    [ECARTE, "inaccessible-instantane-ecarte.json"],
    [ECHEC, "inaccessible-telechargement-echec.json"],
  ] as const;
  for (const [url, dore] of dores) copyFileSync(join(DORE, dore), join(repertoireLiens(run), nomResultat(url)));
  return run;
}

describe("18. fournisseur adossé aux fichiers du test des liens", () => {
  it("rend les verdicts des liens demandés, et seulement eux, un par lien distinct", () => {
    const fournisseur = fournisseurFichiers(runTeste());

    const existences = fournisseur.existencesDe("r1", [EXISTE, "https://example.org/jamais-teste", EXISTE, MORT]);

    expect(existences.map((e) => e.url_citee)).toEqual([EXISTE, MORT]);
    expect(existences[0]).toEqual({
      url_citee: EXISTE,
      verdict_existence: "existe",
      date_test: "2026-09-22T14:30:08+02:00",
      code_http: 200,
      url_finale: EXISTE,
      sha256_contenu: empreinte(PAGE),
      archive_url: "https://web.archive.org/web/20260922123005/https://example.org/programme",
    });
    expect(existences[1]).toEqual({ url_citee: MORT, verdict_existence: "mort", date_test: "2026-09-22T14:30:09+02:00", code_http: 404, url_finale: MORT });
    expect(fournisseur.existencesDe("r2", [])).toEqual([]);
  });

  it("D21 : la copie archivée téléchargée d'un lien inaccessible est rendue (archive_url et sha256_contenu)", () => {
    const [existence] = fournisseurFichiers(runTeste()).existencesDe("r1", [INACCESSIBLE]);
    expect(existence).toMatchObject({
      verdict_existence: "inaccessible",
      archive_url: "https://web.archive.org/web/20260918071500/https://example.org/reserve",
      sha256_contenu: empreinte(COPIE),
    });
  });

  /** Le doré de INACCESSIBLE, dont le téléchargement `id_` a été servi depuis `url_finale`. */
  function serviDepuis(url_finale: string, archive_url: string): Record<string, unknown> {
    const dore = lireDore("inaccessible-instantane.json");
    const wayback = dore["wayback"] as Record<string, unknown>;
    const telechargement = wayback["telechargement"] as Record<string, unknown>;
    return { ...dore, archive_url, wayback: { ...wayback, telechargement: { ...telechargement, url_finale } } };
  }

  const SERVI_T2 = "https://web.archive.org/web/20260915080000id_/https://example.org/reserve";

  it("D22 : archive_url désignant l'instantané servi, autre que l'instantané demandé, est acceptée", () => {
    const run = runTeste();
    poser(run, INACCESSIBLE, serviDepuis(SERVI_T2, "https://web.archive.org/web/20260915080000/https://example.org/reserve"));

    const [existence] = fournisseurFichiers(run).existencesDe("r1", [INACCESSIBLE]);

    expect(existence?.archive_url).toBe("https://web.archive.org/web/20260915080000/https://example.org/reserve");
  });

  it("D22 : archive_url incohérente avec l'URL finale du téléchargement est refusée", () => {
    const run = runTeste();
    const incoherentes = [
      "http://web.archive.org/web/20260918071500/https://example.org/reserve", // l'instantané demandé, pas le servi
      SERVI_T2, // la forme id_ elle-même
      "https://web.archive.org/web/20260915080000/https://example.org/autre",
    ];
    for (const archive_url of incoherentes) {
      poser(run, INACCESSIBLE, serviDepuis(SERVI_T2, archive_url));
      expect(() => fournisseurFichiers(run), archive_url).toThrow(FichierExistenceRefuse);
      expect(() => fournisseurFichiers(run), archive_url).toThrow(/archive_url n'est pas l'instantané/);
    }
  });

  it("D22 : un téléchargement réussi dont l'URL finale n'a pas la forme /web/<14 chiffres>id_/ est invalide au schéma", () => {
    const run = runTeste();
    poser(run, INACCESSIBLE, serviDepuis("https://web.archive.org/erreur", "https://web.archive.org/web/20260918071500/https://example.org/reserve"));
    expect(() => fournisseurFichiers(run)).toThrow(ErreurSchema);
  });

  it("D21 : instantané écarté ou téléchargement en échec, ni archive_url ni sha256_contenu", () => {
    const existences = fournisseurFichiers(runTeste()).existencesDe("r1", [ECARTE, ECHEC]);
    expect(existences.map((e) => e.verdict_existence)).toEqual(["inaccessible", "inaccessible"]);
    for (const existence of existences) {
      expect(existence.archive_url).toBeUndefined();
      expect(existence.sha256_contenu).toBeUndefined();
    }
  });

  it("D21 : la copie archivée absente, d'une autre taille ou mal nommée est refusée", () => {
    const run = runTeste();
    const chemin = join(repertoireLiens(run), "pages", `${empreinte(COPIE)}.html`);
    writeFileSync(chemin, COPIE.subarray(1));
    expect(() => fournisseurFichiers(run)).toThrow(/octets/);
    rmSync(chemin);
    expect(() => fournisseurFichiers(run)).toThrow(/absente/);
    writeFileSync(chemin, COPIE);
    poser(run, INACCESSIBLE, { ...lireDore("inaccessible-instantane.json"), sha256_contenu: "b".repeat(64) });
    expect(() => fournisseurFichiers(run)).toThrow(/n'est pas nommée par l'empreinte/);
  });

  it("un lien sans fichier est absent du résultat : jamais supposé", () => {
    expect(fournisseurFichiers(runTeste()).existencesDe("r1", ["https://example.org/jamais-teste"])).toEqual([]);
  });

  it("un fichier invalide au schéma lève ErreurSchema", () => {
    const run = runTeste();
    poser(run, INACCESSIBLE, { ...lireDore("inaccessible-instantane.json"), verdict_existence: "suppose" });
    expect(() => fournisseurFichiers(run)).toThrow(ErreurSchema);
  });

  it("un fichier qui n'est pas du JSON lève FichierExistenceRefuse", () => {
    const run = runTeste();
    writeFileSync(join(repertoireLiens(run), nomResultat(MORT)), "{ pas du json", "utf8");
    expect(() => fournisseurFichiers(run)).toThrow(FichierExistenceRefuse);
  });

  it("un fichier dont le nom n'est pas l'empreinte de son URL est refusé", () => {
    const run = runTeste();
    copyFileSync(join(DORE, "mort.json"), join(repertoireLiens(run), nomResultat("https://example.org/autre")));
    expect(() => fournisseurFichiers(run)).toThrow(/n'est pas le SHA-256 de l'URL citée/);
  });

  it("une archive_url qui n'est pas celle renvoyée (Save Page Now) ou servie (instantané) par Wayback est refusée", () => {
    const run = runTeste();
    poser(run, INACCESSIBLE, { ...lireDore("inaccessible-instantane.json"), archive_url: "https://web.archive.org/web/20200101000000/https://example.org/reserve" });
    expect(() => fournisseurFichiers(run)).toThrow(/archive_url n'est pas l'instantané/);
    poser(run, EXISTE, { ...lireDore("existe.json"), archive_url: "https://web.archive.org/web/20200101000000/https://example.org/programme" });
    expect(() => fournisseurFichiers(run)).toThrow(/archive_url n'est pas l'instantané/);
  });

  it("des tentatives incohérentes (trou, date_test ou code d'une autre tentative) sont refusées", () => {
    const run = runTeste();
    const mort = lireDore("mort.json");
    const [premiere] = mort["tentatives"] as Record<string, unknown>[];
    poser(run, MORT, { ...mort, tentatives: [{ ...premiere, numero: 2 }] });
    expect(() => fournisseurFichiers(run)).toThrow(/sans trou/);
    poser(run, MORT, { ...mort, date_test: "2026-09-22T14:31:07+02:00" });
    expect(() => fournisseurFichiers(run)).toThrow(/date_test/);
    poser(run, MORT, { ...mort, code_http: 410 });
    expect(() => fournisseurFichiers(run)).toThrow(/code_http/);
  });

  it("la page d'un lien existant absente, ou d'une autre taille, est refusée", () => {
    const run = runTeste();
    const sha = empreinte(PAGE);
    writeFileSync(join(repertoireLiens(run), "pages", `${sha}.html`), PAGE.subarray(1));
    expect(() => fournisseurFichiers(run)).toThrow(/octets/);
    rmSync(join(repertoireLiens(run), "pages", `${sha}.html`));
    expect(() => fournisseurFichiers(run)).toThrow(/absente/);
  });

  it("une entrée étrangère du répertoire est refusée, jamais ignorée", () => {
    const run = runTeste();
    writeFileSync(join(repertoireLiens(run), `.${nomResultat(MORT)}.x.partiel`), "", "utf8");
    expect(() => fournisseurFichiers(run)).toThrow(FichierExistenceRefuse);
  });
});

/** Toutes les réponses citent `LIEN` ; sans notation, la seule tâche de l'annotateur est la réponse tirée. */
describe("18. branchement dans l'écran de notation humaine", () => {
  let monde: Monde | null = null;

  afterEach(() => {
    monde?.nettoyer();
    monde = null;
  });

  it("sans volume/liens/, aucun verdict : le fournisseur vide", () => {
    monde = monter({ avec_lien: [0, 1, 2, 3] });
    expect(fournisseurDuRun(monde.repertoire_run)).toBe(FOURNISSEUR_SANS_EXISTENCE);
    expect(etatDesTaches(monde.contexte("a1", fournisseurDuRun(monde.repertoire_run))).en_attente_test_des_liens).toBe(1);
  });

  it("avec le résultat du lien, les réponses qui le citent sortent de l'attente", () => {
    monde = monter({ avec_lien: [0, 1, 2, 3] });
    const liens = repertoireLiens(monde.repertoire_run);
    mkdirSync(liens, { recursive: true });
    poser(monde.repertoire_run, LIEN, { ...lireDore("mort.json"), url_citee: LIEN, url_finale: LIEN });

    const etat = etatDesTaches(monde.contexte("a1", fournisseurDuRun(monde.repertoire_run)));

    expect(etat.en_attente_test_des_liens).toBe(0);
  });

  it("répertoire présent mais vide (passage interrompu avant tout résultat) : les réponses restent en attente", () => {
    monde = monter({ avec_lien: [0, 1, 2, 3] });
    mkdirSync(repertoireLiens(monde.repertoire_run), { recursive: true });
    expect(etatDesTaches(monde.contexte("a1", fournisseurDuRun(monde.repertoire_run))).en_attente_test_des_liens).toBe(1);
  });
});
