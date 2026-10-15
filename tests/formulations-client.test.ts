/**
 * L'état des cases de l'écran de relecture des formulations, sans DOM (D39, D42) : aucune case
 * pré-cochée, promotion seulement quand tout est coché, refus seulement avec un commentaire.
 */

import { describe, expect, it } from "vitest";
import {
  actionsPermises,
  etatInitial,
  libellePremisse,
  relectureDe,
  type EtatCases,
} from "../validation/client/cases-formulations.ts";
import type { VueFormulations } from "../validation/client/types.ts";

const VUE: VueFormulations = {
  question_id: "q_00000000000000000000000000000001",
  proposition_id: "01JA0000000000000000000001",
  gabarit: "Q-FER",
  candidat: "Libellé demo-alpha",
  mesure: "la création d’un jardin",
  position_demandee: "pour",
  textes: [
    { registre: "neutre", texte: "Neutre ?" },
    { registre: "familier", texte: "Familier ?" },
    { registre: "oriente", texte: "Orienté ?" },
  ],
};

function tout(etat: EtatCases): EtatCases {
  return { ...etat, sens: new Map([...etat.sens.keys()].map((registre) => [registre, true])), premisse: true };
}

describe("écran de relecture : cases et boutons", () => {
  it("aucune case n'est pré-cochée, et aucun bouton n'est actif à l'ouverture", () => {
    const etat = etatInitial(VUE);
    expect([...etat.sens.values()]).toEqual([false, false, false]);
    expect(etat.premisse).toBe(false);
    expect(actionsPermises(etat)).toEqual({ promouvoir: false, refuser: false });
  });

  it("tout coché ⇒ seule la promotion est permise, même avec un commentaire", () => {
    expect(actionsPermises(tout(etatInitial(VUE)))).toEqual({ promouvoir: true, refuser: false });
    expect(actionsPermises({ ...tout(etatInitial(VUE)), commentaire: "RAS" })).toEqual({ promouvoir: true, refuser: false });
  });

  it("une case décochée ⇒ refus permis seulement avec un commentaire non blanc", () => {
    const decoche = { ...tout(etatInitial(VUE)), premisse: false };
    expect(actionsPermises(decoche)).toEqual({ promouvoir: false, refuser: false });
    expect(actionsPermises({ ...decoche, commentaire: "   " })).toEqual({ promouvoir: false, refuser: false });
    expect(actionsPermises({ ...decoche, commentaire: "Prémisse fausse." })).toEqual({ promouvoir: false, refuser: true });
  });

  it("le libellé de la prémisse nomme la position demandée, ou l'absence de position", () => {
    expect(libellePremisse("contre")).toBe("La prémisse affirme bien : « contre »");
    expect(libellePremisse("AUCUNE")).toBe("La prémisse n'affirme aucune position");
  });

  it("la requête porte chaque case telle quelle", () => {
    const etat = { ...etatInitial(VUE), commentaire: "x" };
    expect(relectureDe(VUE, etat)).toEqual({
      question_id: VUE.question_id,
      proposition_id: VUE.proposition_id,
      sens_preserve: { neutre: false, familier: false, oriente: false },
      premisse_conforme: false,
      commentaire: "x",
    });
  });
});
