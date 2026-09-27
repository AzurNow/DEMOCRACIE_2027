/**
 * Conformité n° 10 : inclusion d'un candidat dans le régime « avant la liste officielle » (§3).
 *
 * Texte 0.11, confirmé par l'auteur le 2026-09-27 : « la fenêtre va de 60 jours avant l'instant de
 * gel jusqu'à cet instant, bornes comprises, une date de publication se lisant à minuit UTC ». Le
 * JSON Schema ne sait pas comparer des dates : cette fonction pure le fait, et chaque cas limite
 * du brief a son test nommé. Les instants attendus sont écrits en clair à côté de chaque cas.
 */

import { describe, expect, it } from "vitest";
import {
  FENETRE_SONDAGES_JOURS,
  inclusionAvantListe,
  SONDAGES_MINIMUM,
  sondageDansLaFenetre,
} from "../../pipeline/questions/perimetre.ts";
import type { CandidatAvantListe, PreuveSondage } from "../../pipeline/questions/perimetre.ts";

const GEL_DIX_HEURES = "2026-11-20T10:00:00Z";
const GEL_MINUIT = "2026-11-20T00:00:00Z";

function sondage(date_publication: string, cle: string): PreuveSondage {
  return { date_publication, url: `https://institut.invalid/${cle}` };
}

const DECLARATION = { url: "https://candidat.invalid/declaration", date: "2026-06-02" };

function candidat(preuves: readonly PreuveSondage[], declaration = true): CandidatAvantListe {
  return declaration ? { preuves_inclusion: preuves, declaration_candidature: DECLARATION } : { preuves_inclusion: preuves };
}

describe("constantes du §3", () => {
  it("60 jours, deux sondages", () => {
    expect(FENETRE_SONDAGES_JOURS).toBe(60);
    expect(SONDAGES_MINIMUM).toBe(2);
  });
});

describe("sondageDansLaFenetre : bornes de la fenêtre de 60 jours", () => {
  it("exclut un sondage daté 2026-09-21 pour un gel à 2026-11-20T10:00Z (minuit UTC = gel − 60 j − 10 h)", () => {
    // Borne basse : 2026-11-20T10:00Z − 60 j = 2026-09-21T10:00Z ; le sondage se lit 2026-09-21T00:00Z,
    // dix heures avant cette borne.
    expect(sondageDansLaFenetre("2026-09-21", GEL_DIX_HEURES)).toBe(false);
  });

  it("retient un sondage daté 2026-09-22 pour le même gel (premier jour entièrement dans la fenêtre)", () => {
    expect(sondageDansLaFenetre("2026-09-22", GEL_DIX_HEURES)).toBe(true);
  });

  it("retient un sondage daté exactement de gel − 60 jours quand le gel est à 00:00:00Z (borne comprise)", () => {
    // 2026-11-20T00:00Z − 60 j = 2026-09-21T00:00Z, instant du sondage lui-même.
    expect(sondageDansLaFenetre("2026-09-21", GEL_MINUIT)).toBe(true);
  });

  it("exclut la veille de cette borne avec un gel à minuit", () => {
    expect(sondageDansLaFenetre("2026-09-20", GEL_MINUIT)).toBe(false);
  });

  it("retient un sondage daté du jour du gel avec un gel à 10:00Z", () => {
    expect(sondageDansLaFenetre("2026-11-20", GEL_DIX_HEURES)).toBe(true);
  });

  it("retient un sondage daté du jour du gel avec un gel à minuit (borne haute comprise)", () => {
    expect(sondageDansLaFenetre("2026-11-20", GEL_MINUIT)).toBe(true);
  });

  it("exclut un sondage daté du lendemain du gel", () => {
    expect(sondageDansLaFenetre("2026-11-21", GEL_DIX_HEURES)).toBe(false);
  });

  it("lit un gel à décalage non nul sur l'instant, pas sur la date affichée", () => {
    // 2026-11-20T00:30:00+01:00 = 2026-11-19T23:30Z : le sondage du 20 (00:00Z) est postérieur.
    expect(sondageDansLaFenetre("2026-11-20", "2026-11-20T00:30:00+01:00")).toBe(false);
  });

  it("refuse une date de publication illisible au lieu de l'exclure en silence", () => {
    expect(() => sondageDansLaFenetre("2026-13-45", GEL_DIX_HEURES)).toThrow();
  });

  it("refuse un gel sans décalage horaire", () => {
    expect(() => sondageDansLaFenetre("2026-11-01", "2026-11-20T10:00:00")).toThrow();
  });
});

describe("inclusionAvantListe : les deux conditions du §3", () => {
  it("inclut un candidat déclaré avec deux sondages dans la fenêtre", () => {
    const verdict = inclusionAvantListe(
      candidat([sondage("2026-10-01", "a"), sondage("2026-11-20", "b")]),
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: true, declaration_au_gel: true, sondages_dans_la_fenetre: 2 });
  });

  it("n'inclut pas un candidat dont un seul des deux sondages déclarés est dans la fenêtre", () => {
    const verdict = inclusionAvantListe(
      candidat([sondage("2026-09-21", "hors"), sondage("2026-11-01", "dans")]),
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 1 });
  });

  it("n'inclut pas un candidat dont le second sondage est daté du lendemain du gel", () => {
    const verdict = inclusionAvantListe(
      candidat([sondage("2026-11-01", "dans"), sondage("2026-11-21", "lendemain")]),
      GEL_DIX_HEURES,
    );
    expect(verdict.inclus).toBe(false);
    expect(verdict.sondages_dans_la_fenetre).toBe(1);
  });

  it("n'inclut pas un candidat sans déclaration de candidature, même avec deux sondages", () => {
    const verdict = inclusionAvantListe(
      candidat([sondage("2026-10-01", "a"), sondage("2026-11-01", "b")], false),
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: false, sondages_dans_la_fenetre: 2 });
  });

  it("n'inclut pas un candidat dont la déclaration est postérieure au gel", () => {
    const verdict = inclusionAvantListe(
      {
        preuves_inclusion: [sondage("2026-10-01", "a"), sondage("2026-11-01", "b")],
        declaration_candidature: { url: DECLARATION.url, date: "2026-11-21" },
      },
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: false, sondages_dans_la_fenetre: 2 });
  });

  it("retient une déclaration datée du jour du gel (minuit UTC ≤ gel)", () => {
    const verdict = inclusionAvantListe(
      {
        preuves_inclusion: [sondage("2026-10-01", "a"), sondage("2026-11-01", "b")],
        declaration_candidature: { url: DECLARATION.url, date: "2026-11-20" },
      },
      GEL_DIX_HEURES,
    );
    expect(verdict.inclus).toBe(true);
  });

  it("n'inclut pas un candidat sans aucune preuve de sondage", () => {
    const verdict = inclusionAvantListe({ declaration_candidature: DECLARATION }, GEL_DIX_HEURES);
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 0 });
  });

  it("compte une seule fois le même sondage déclaré deux fois (même URL)", () => {
    const doublon = sondage("2026-11-01", "meme");
    const verdict = inclusionAvantListe(candidat([doublon, { ...doublon }]), GEL_DIX_HEURES);
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 1 });
  });
});
