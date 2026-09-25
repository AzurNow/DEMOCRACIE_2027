/**
 * §10 : « les copies intégrales de documents ne sont publiées que lorsque leur licence le permet
 * […] ; les enregistrements T2 sont conservés à des fins de vérification et seuls la transcription
 * de l'extrait, le lien et l'horodatage sont publiés ». Le dépôt est public : un texte canonique
 * ou une transcription intégrale versionnés seraient publiés (constat de conformité n° 31).
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function estIgnore(chemin: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", chemin]);
    return true;
  } catch (erreur) {
    if ((erreur as { status?: number }).status === 1) return false;
    throw erreur;
  }
}

function fichiersVersionnes(...motifs: string[]): string[] {
  const sortie = execFileSync("git", ["ls-files", "--", ...motifs], { encoding: "utf8" });
  return sortie.split("\n").filter((ligne) => ligne !== "");
}

const SHA = "0".repeat(64);

describe("textes intégraux hors du dépôt public (§10)", () => {
  it("ignore le texte canonique et la transcription intégrale d'une source", () => {
    expect(estIgnore(`staging/textes/${SHA}.txt`)).toBe(true);
    expect(estIgnore(`staging/transcriptions/${SHA}.vtt`)).toBe(true);
  });

  it("garde versionnées les fiches de production, qui tracent la transcription (§9)", () => {
    expect(estIgnore(`staging/transcriptions/${SHA}.json`)).toBe(false);
    expect(estIgnore(`staging/sources/${SHA}.json`)).toBe(false);
    expect(estIgnore(`staging/extractions/${SHA}/${SHA}.json`)).toBe(false);
  });

  it("n'ignore pas les jeux de démonstration qui portent le même nom de répertoire", () => {
    expect(estIgnore(`validation/fixtures/staging/textes/${SHA}.txt`)).toBe(false);
  });

  it("aucun texte canonique ni aucune transcription intégrale n'est déjà versionné", () => {
    expect(fichiersVersionnes("staging/textes/*.txt", "staging/transcriptions/*.vtt")).toEqual([]);
  });
});
