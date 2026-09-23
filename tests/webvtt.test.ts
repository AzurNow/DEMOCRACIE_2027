/**
 * Parseur WebVTT et calcul de l'horodatage d'un offset — logique pure extraite de
 * `validation/client/source.ts` (docs/DETTE.md, décision du 2026-09-18).
 *
 * Portée volontairement limitée à ce que `docs/PROTOCOLE.md` et `docs/CONTRATS.md` exigent :
 * les cues, leurs horodatages, leur texte, et la dérivation du texte canonique qu'ils décrivent
 * (§2). Le style, la position et les autres métadonnées WebVTT ne sont pas interprétés ; ils
 * sont seulement ignorés sans faire dériver les offsets qui suivent.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyserVtt,
  ErreurVtt,
  horodatageDebut,
  secondesDeHorodatage,
  type Cue,
  type DocumentVtt,
} from "../validation/domaine/webvtt.ts";

const RACINE_DEPOT = join(import.meta.dirname, "..");

/** Le cue de rang `index`, ou une erreur qui dit lequel manque. */
function cue(document: DocumentVtt, index: number): Cue {
  const trouve = document.cues[index];
  if (trouve === undefined) throw new Error(`cue ${index} absent (${document.cues.length} cues)`);
  return trouve;
}
const VTT_FIXTURE = join(
  RACINE_DEPOT,
  "validation/fixtures/staging-demo/transcriptions/b6db45bad6003978deea167807cc2f9b1d0080b35bacc4c1a8800ad5f6aafd0c.vtt",
);
const TXT_FIXTURE_CORRESPONDANT = join(
  RACINE_DEPOT,
  "validation/fixtures/staging-demo/textes/f7c3b51e5eb8f98dbbb6c87e18d6961476b8f10cbc00f40a388c5e611d57494a.txt",
);

describe("analyserVtt", () => {
  it("10. le fichier réel est analysé, le texte canonique dérivé est la jonction des cues par un saut de ligne", () => {
    const contenu = readFileSync(VTT_FIXTURE, "utf8");
    const document = analyserVtt(contenu);

    expect(document.cues).toHaveLength(3);
    expect(document.texte).toBe(document.cues.map((cue) => cue.texte).join("\n"));

    // Le fichier texte canonique correspondant existe déjà dans les fixtures (apparié par
    // sha256 dans l'item qui le référence) : la dérivation doit produire exactement ce texte.
    const texteAttendu = readFileSync(TXT_FIXTURE_CORRESPONDANT, "utf8");
    expect(document.texte).toBe(texteAttendu);
  });

  it("11. un cue contenant un emoji : l'offset du cue suivant compte en points de code", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:02.000",
      "Objectif 🌍 conclusion.",
      "",
      "00:00:02.000 --> 00:00:04.000",
      "Deuxieme cue.",
    ].join("\n");
    const document = analyserVtt(vtt);

    const longueurEnPointsDeCode = [...cue(document, 0).texte].length;
    const longueurEnUnitesUtf16 = cue(document, 0).texte.length;
    // 🌍 occupe deux unités UTF-16 pour un seul point de code : les deux longueurs diffèrent,
    // sans quoi ce test ne vérifierait rien.
    expect(longueurEnUnitesUtf16).not.toBe(longueurEnPointsDeCode);

    expect(cue(document, 1).offset).toBe(longueurEnPointsDeCode + 1);
  });

  it("12. horodatages à deux champs (MM:SS.mmm) et à trois champs (HH:MM:SS.mmm)", () => {
    expect(secondesDeHorodatage("01:02.500")).toBe(62.5);
    expect(secondesDeHorodatage("00:42:10.000")).toBe(42 * 60 + 10);
    expect(secondesDeHorodatage("01:00:42.000")).toBe(3600 + 42);
  });

  it("12 bis. un horodatage illisible ou mal découpé lève, il ne rend jamais un nombre plausible", () => {
    // Le lecteur se positionnerait alors ailleurs que sur la citation, sans rien signaler.
    for (const illisible of ["abc", "", "01:xx.500", "00:00:12.500 align:start"]) {
      expect(() => secondesDeHorodatage(illisible)).toThrow(ErreurVtt);
    }
    // Un seul champ ou quatre champs ne sont pas des horodatages WebVTT.
    expect(() => secondesDeHorodatage("12.500")).toThrow(ErreurVtt);
    expect(() => secondesDeHorodatage("1:2:3:4")).toThrow(ErreurVtt);
  });

  it("12 ter. les réglages de cue après la borne de fin sont écartés, pas refusés", () => {
    // `align:start` et consorts sont légaux en WebVTT et sans effet sur le minutage.
    const avecReglages = "WEBVTT\n\n00:00:02.000 --> 00:00:08.000 align:start position:50%\nPremière.\n";
    const cues = analyserVtt(avecReglages).cues;
    expect(cues).toHaveLength(1);
    expect(cues[0]?.debut).toBe(2);
    expect(cues[0]?.fin).toBe(8);
  });

  it("13. un offset dans le deuxième cue rend l'horodatage de début de ce cue, pas du premier", () => {
    const contenu = readFileSync(VTT_FIXTURE, "utf8");
    const document = analyserVtt(contenu);
    const offsetDansLeDeuxiemeCue = cue(document, 1).offset + 2;
    expect(horodatageDebut(document, offsetDansLeDeuxiemeCue)).toBe(cue(document, 1).debut);
    expect(horodatageDebut(document, offsetDansLeDeuxiemeCue)).not.toBe(cue(document, 0).debut);
  });

  it("14. offset antérieur au premier cue et offset au-delà du dernier : comportement explicite, jamais inventé", () => {
    const contenu = readFileSync(VTT_FIXTURE, "utf8");
    const document = analyserVtt(contenu);
    expect(() => horodatageDebut(document, -1)).toThrow(ErreurVtt);
    expect(() => horodatageDebut(document, document.texte.length)).toThrow(ErreurVtt);
    expect(() => horodatageDebut(document, document.texte.length + 100)).toThrow(ErreurVtt);
  });

  it("15. un fichier sans en-tête WEBVTT lève une erreur nommée", () => {
    const sansEntete = "00:00:00.000 --> 00:00:01.000\nTexte.";
    expect(() => analyserVtt(sansEntete)).toThrow(ErreurVtt);
  });

  it("16. un bloc sans flèche d'horodatage lève une erreur nommée qui indique le bloc fautif", () => {
    const blocFautif = ["WEBVTT", "", "00:00:00.000 --> 00:00:02.000", "Premier cue.", "", "Bloc sans horodatage."].join(
      "\n",
    );
    expect(() => analyserVtt(blocFautif)).toThrow(ErreurVtt);
    try {
      analyserVtt(blocFautif);
      throw new Error("analyserVtt aurait dû lever une erreur");
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(ErreurVtt);
      expect((erreur as Error).message).toContain("Bloc sans horodatage.");
    }
  });

  it("17. un cue vide entre deux cues pleins laisse les offsets suivants justes", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:02.000",
      "Premier cue.",
      "",
      "00:00:02.000 --> 00:00:02.500",
      "",
      "00:00:02.500 --> 00:00:04.000",
      "Troisieme cue.",
    ].join("\n");
    const document = analyserVtt(vtt);

    expect(document.cues).toHaveLength(3);
    expect(cue(document, 1).texte).toBe("");
    // « Premier cue. » (12 points de code) + 1 saut de ligne = offset 13 pour le cue vide.
    expect(cue(document, 1).offset).toBe(13);
    // Le cue vide ne contribue que son propre saut de ligne : offset 14 pour le troisième cue.
    expect(cue(document, 2).offset).toBe(14);
    expect(document.texte).toBe("Premier cue.\n\nTroisieme cue.");
  });
});
