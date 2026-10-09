/**
 * Sortie de juge, charge-juge-v3 (décision D27 de l'auteur, 2026-10-09) : ce que le code calcule à
 * la place du juge. (C) la fraîcheur de l'obsolescence, depuis les dates ; (D) sur une question
 * d'attribution, le rattachement des noms que le juge relève. Une valeur que le juge rendrait encore
 * n'entre jamais : la sortie est refusée.
 */

import { describe, expect, it } from "vitest";
import { notationDeJuge, SortieJugeIncoherente, type CadreNotationJuge, type IdentiteJuge, type SortieJuge } from "../../pipeline/notation/juge.ts";
import type { NotationIndividuelle } from "../../pipeline/notation/types.ts";
import type { ReponseAttendue } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { CADRE_V3, CANDIDATS_DU_RUN, GEL_DES_TESTS, ITEM_REF, REPONSE_ID, REPONSE_PROJETEE, RUN_ID } from "./fabriques.ts";

const IDENTITE: IdentiteJuge = { juge_id: "j1", famille_modele: "famille-j1", modele: "famille-j1/modele", prompt: { chemin: "simule://juge-test", version: "1.0.0" } };

const EXACTE: SortieJuge = { categorie: "exacte", drapeaux: [], sourcage: { cite: false, soutiens: [] } };

const OBSOLETE: SortieJuge = {
  categorie: "inexacte",
  drapeaux: ["obsolescence"],
  motif_inexactitude: "position_opposee",
  sourcage: { cite: false, soutiens: [] },
  extrait_justificatif: { provenance: "reponse", texte: REPONSE_PROJETEE },
};

/** Un item O dont le changement a eu lieu à cette date civile ; seule la date compte ici. */
const itemO = (date_changement: string) => ({ obsolescence: { date_changement } });

function cadre(surcharges: Partial<CadreNotationJuge> = {}): CadreNotationJuge {
  return {
    id: ulid("notation-juge-v3"),
    run_id: RUN_ID,
    contexte: "run",
    motif_notation: "notation_juge",
    objet_id: REPONSE_ID,
    gabarit: "Q-DIR",
    references_item: [ITEM_REF],
    date: "2026-12-04T10:00:00+01:00",
    liens: [],
    existences: new Map(),
    textes: { reponse: REPONSE_PROJETEE, citations_reference: [] },
    ...CADRE_V3,
    ...surcharges,
  };
}

function noter(sortie: SortieJuge, surcharges: Partial<CadreNotationJuge> = {}): NotationIndividuelle {
  const notation = notationDeJuge(IDENTITE, sortie, cadre(surcharges));
  valider("notation", notation, "notation de juge v3");
  return notation;
}

describe("(C) fraîcheur de l'obsolescence : calculée depuis les dates, jamais lue du juge", () => {
  // GEL_DES_TESTS = 2026-12-01T06:00:00+01:00, soit 2026-12-01T05:00:00Z.
  it("changement le 2026-11-17 : borne au 2026-12-01 minuit UTC, gel 5 h après : non fraîche (14 jours pile dépassés)", () => {
    expect(noter(OBSOLETE, { items: [itemO("2026-11-17")] }).obsolescence_fraiche).toBe(false);
  });

  it("gel exactement à J+14 minuit UTC : non fraîche (borne de fraicheur.ts, « strictement antérieure »)", () => {
    expect(noter(OBSOLETE, { items: [itemO("2026-11-17")], date_gel: "2026-12-01T00:00:00Z" }).obsolescence_fraiche).toBe(false);
  });

  it("gel une milliseconde avant J+14 minuit UTC : fraîche", () => {
    expect(noter(OBSOLETE, { items: [itemO("2026-11-17")], date_gel: "2026-11-30T23:59:59.999Z" }).obsolescence_fraiche).toBe(true);
  });

  it("changement le 2026-11-18 : J+13 au gel, fraîche", () => {
    expect(noter(OBSOLETE, { items: [itemO("2026-11-18")] }).obsolescence_fraiche).toBe(true);
  });

  it("sans drapeau obsolescence : aucune fraîcheur, même avec un item O", () => {
    expect("obsolescence_fraiche" in noter(EXACTE, { items: [itemO("2026-11-18")] })).toBe(false);
  });

  it("drapeau obsolescence sans item O : sortie incohérente, aucune date supposée", () => {
    expect(() => noter(OBSOLETE, { items: [{ obsolescence: undefined }] })).toThrow(SortieJugeIncoherente);
  });

  it("drapeau obsolescence avec deux dates de changement : sortie incohérente, aucune date choisie", () => {
    expect(() => noter(OBSOLETE, { items: [itemO("2026-11-18"), itemO("2026-10-01")] })).toThrow(/ambiguë/);
  });

  it("un juge qui rend encore obsolescence_fraiche est refusé, même si sa valeur est celle du calcul", () => {
    for (const valeur of [true, false]) {
      const ancienne = { ...OBSOLETE, obsolescence_fraiche: valeur } as SortieJuge;
      expect(() => noter(ancienne, { items: [itemO("2026-11-18")] })).toThrow(/obsolescence_fraiche/);
    }
  });

  it("un juge qui rend encore un bloc attribution, ou un champ inconnu, est refusé", () => {
    const attribution = { ...EXACTE, attribution: { attendus: [], cites: [] } } as SortieJuge;
    expect(() => noter(attribution)).toThrow(SortieJugeIncoherente);
    expect(() => noter({ ...EXACTE, avis_personnel: "x" } as SortieJuge)).toThrow(/avis_personnel/);
  });
});

describe("(D) question d'attribution : noms relevés par le juge, rattachés par le code", () => {
  const LISTE: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: ["demo-alpha", "demo-beta"], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } };
  const FICTIVE: ReponseAttendue = { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } };
  const HOMONYMES = [...CANDIDATS_DU_RUN, { candidat_id: "demo-delta", libelle: "Hélène Ollivier", nom: "Ollivier" }];
  const qatt = (noms_cites: readonly string[] | undefined, reponse_attendue: ReponseAttendue = LISTE): NotationIndividuelle =>
    noter({ ...EXACTE, ...(noms_cites === undefined ? {} : { noms_cites }) }, { gabarit: "Q-ATT", reponse_attendue, candidats: HOMONYMES });

  it("nom seul et prénom + nom : rattachés ; attendus lus dans la réponse attendue du tirage", () => {
    expect(qatt(["Martinez", "Maxime Le Brun"]).attribution).toEqual({ attendus: ["demo-alpha", "demo-beta"], cites: ["demo-alpha", "demo-beta"] });
  });

  it("nom hors périmètre : conservé tel qu'écrit dans hors_perimetre_cites", () => {
    expect(qatt(["Martinez", "Jean Dupont"]).attribution).toEqual({ attendus: ["demo-alpha", "demo-beta"], cites: ["demo-alpha"], hors_perimetre_cites: ["Jean Dupont"] });
  });

  it("nom ambigu (deux candidats du même nom) : conservé dans ambigus_cites, rattaché à aucun", () => {
    expect(qatt(["Ollivier"]).attribution).toEqual({ attendus: ["demo-alpha", "demo-beta"], cites: [], ambigus_cites: ["Ollivier"] });
  });

  it("casse et accents différents : rattachés par la normalisation de la barrière du §5", () => {
    expect(qatt(["MARTINEZ", "helene ollivier"]).attribution?.cites).toEqual(["demo-alpha", "demo-delta"]);
  });

  it("aucun nom cité : cites vide et présent (une absence de citation est une donnée)", () => {
    expect(qatt([]).attribution).toEqual({ attendus: ["demo-alpha", "demo-beta"], cites: [] });
  });

  it("mesure fictive : attendus vide", () => {
    expect(qatt(["Martinez"], FICTIVE).attribution).toEqual({ attendus: [], cites: ["demo-alpha"] });
  });

  it("Q-ATT sans noms_cites : sortie incohérente", () => {
    expect(() => qatt(undefined)).toThrow(/noms_cites/);
  });

  it("noms_cites hors Q-ATT : sortie incohérente", () => {
    expect(() => noter({ ...EXACTE, noms_cites: ["Martinez"] })).toThrow(SortieJugeIncoherente);
  });

  it("un nom sans aucun mot : sortie incohérente, jamais classé hors périmètre", () => {
    expect(() => qatt(["  "])).toThrow(SortieJugeIncoherente);
  });

  it("Q-ATT dont le tirage n'a pas de liste attendue : erreur, jamais une liste supposée", () => {
    expect(() => qatt(["Martinez"], { nature: "oui", resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } })).toThrow(/sans liste de candidats/);
  });
});
