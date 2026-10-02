/**
 * Cas limite 5 du brief (partie pure) : la fenêtre du run, [debut, fin), fin = debut + 48 h
 * absolues, debut un mardi à 06:00 heure de Paris.
 */

import { describe, expect, it } from "vitest";
import { DUREE_FENETRE_MS } from "../../pipeline/interrogation/conditions.ts";
import { FenetreRefusee, ouvrirFenetre, tentativePeutDemarrer } from "../../pipeline/interrogation/fenetre.ts";
import { dateParis, instantParis } from "../../pipeline/interrogation/heure-paris.ts";

describe("cas 5 : un début de fenêtre qui n'est pas un mardi 06:00 heure de Paris est refusé", () => {
  it("accepte le mardi 1er décembre 2026 à 06:00 (+01:00), et la même heure écrite en UTC", () => {
    expect(ouvrirFenetre("2026-12-01T06:00:00+01:00").debut_ms).toBe(Date.parse("2026-12-01T05:00:00Z"));
    expect(() => ouvrirFenetre("2026-12-01T05:00:00Z")).not.toThrow();
  });

  it.each([
    ["un lundi", "2026-11-30T06:00:00+01:00"],
    ["un mardi à 07:00", "2026-12-01T07:00:00+01:00"],
    ["06:00 UTC, soit 07:00 à Paris", "2026-12-01T06:00:00Z"],
    ["une seconde après 06:00", "2026-12-01T06:00:01+01:00"],
    ["une milliseconde après 06:00", "2026-12-01T06:00:00.001+01:00"],
    ["06:00 en heure d'été un mardi d'hiver (05:00 à Paris)", "2026-10-27T06:00:00+02:00"],
  ])("refuse %s", (_libelle, debut) => {
    expect(() => ouvrirFenetre(debut)).toThrow(FenetreRefusee);
  });

  it("refuse un instant sans décalage", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00")).toThrow(/décalage explicite/);
  });
});

describe("cas 5 : 48 heures absolues, de part et d'autre du passage à l'heure d'hiver du 25 octobre 2026", () => {
  // Le changement d'heure français tombe un dimanche : aucune fenêtre ouverte un mardi à 6 h ne le
  // contient (mardi 6 h + 48 h = jeudi 6 h). On vérifie donc les deux fenêtres qui l'encadrent :
  // l'une à l'heure d'été, l'autre à l'heure d'hiver, toutes deux de 48 heures absolues.
  it("mardi 20 octobre (heure d'été) : fin jeudi 22 à 06:00 +02:00, 48 h exactes", () => {
    const fenetre = ouvrirFenetre("2026-10-20T06:00:00+02:00");
    expect(fenetre.fin_ms - fenetre.debut_ms).toBe(48 * 3_600_000);
    expect(fenetre.fin).toBe("2026-10-22T06:00:00.000+02:00");
  });

  it("mardi 27 octobre (heure d'hiver) : fin jeudi 29 à 06:00 +01:00, 48 h exactes", () => {
    const fenetre = ouvrirFenetre("2026-10-27T06:00:00+01:00");
    expect(fenetre.fin_ms - fenetre.debut_ms).toBe(DUREE_FENETRE_MS);
    expect(fenetre.fin).toBe("2026-10-29T06:00:00.000+01:00");
  });

  it("l'heure de Paris suit le changement d'heure : 00:59:59 UTC le 25 = 02:59:59 +02:00, 01:00 UTC = 02:00 +01:00", () => {
    expect(instantParis(Date.parse("2026-10-25T00:59:59Z"))).toBe("2026-10-25T02:59:59.000+02:00");
    expect(instantParis(Date.parse("2026-10-25T01:00:00Z"))).toBe("2026-10-25T02:00:00.000+01:00");
  });
});

describe("cas 5 : la fenêtre est semi-ouverte", () => {
  const fenetre = ouvrirFenetre("2026-12-01T06:00:00+01:00");

  it("une tentative à fin − 1 ms peut démarrer", () => {
    expect(tentativePeutDemarrer(fenetre, fenetre.fin_ms - 1)).toBe(true);
  });

  it("une tentative à fin exactement ne démarre pas", () => {
    expect(tentativePeutDemarrer(fenetre, fenetre.fin_ms)).toBe(false);
  });

  it("une tentative au début exactement démarre ; une milliseconde avant, non", () => {
    expect(tentativePeutDemarrer(fenetre, fenetre.debut_ms)).toBe(true);
    expect(tentativePeutDemarrer(fenetre, fenetre.debut_ms - 1)).toBe(false);
  });
});

describe("date du répertoire d'un run", () => {
  it("est la date à Paris, pas la date UTC", () => {
    expect(dateParis(Date.parse("2026-11-26T23:30:00Z"))).toBe("2026-11-27");
  });
});
