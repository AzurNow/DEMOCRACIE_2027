/**
 * D33 : l'écran ne demande pas l'extrait justificatif sur un refus de l'API, et le demande partout
 * ailleurs. Le test d'alignement confronte la règle de l'écran au schéma de notation : une
 * non-réponse humaine sans extrait n'est valide que marquée sur_refus_api, marqueur que le serveur
 * pose d'après la réponse.
 */

import { describe, expect, it } from "vitest";
import { extraitDemande } from "../../notation-humaine/client/extrait.ts";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { notationHumaine } from "../notation/fabriques.ts";

describe("D33 : extrait justificatif sur l'écran de notation humaine", () => {
  it("n'est pas demandé sur un refus de l'API, l'est sur toute autre réponse", () => {
    expect(extraitDemande({ reponse: { refus_api: true } } as Parameters<typeof extraitDemande>[0])).toBe(false);
    expect(extraitDemande({ reponse: { refus_api: false } } as Parameters<typeof extraitDemande>[0])).toBe(true);
  });

  it("s'aligne sur le schéma : sans extrait, une non-réponse humaine passe si et seulement si elle porte sur un refus", () => {
    for (const refus_api of [true, false]) {
      const notation = notationHumaine("a1", "echantillon_aleatoire_10", { categorie: "non_reponse", ...(refus_api ? { sur_refus_api: true as const } : {}) });
      const valide = erreurDeSchema("notation", notation, "non-réponse humaine sans extrait") === null;
      expect(valide).toBe(!extraitDemande({ reponse: { refus_api } } as Parameters<typeof extraitDemande>[0]));
    }
  });
});
