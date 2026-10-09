/**
 * Construction et contrôle d'une notation humaine (§7 ; D17, D18). Cas limites 2, 3 et 9 du brief
 * notation-humaine. Chaque notation acceptée est revalidée ici contre `schema/notation.schema.json`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  construireNotationHumaine,
  ContexteNotationInvalide,
  PseudonymeVide,
  type ContexteNotationHumaine,
  type ResultatNotationHumaine,
  type SaisieHumaine,
} from "../../pipeline/notation/notation-humaine.ts";
import { construireVue, type ExistenceEtablie } from "../../pipeline/notation/vue-annotateur.ts";
import type { NotationIndividuelle } from "../../pipeline/notation/types.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import type { Gabarit } from "../../analysis/types.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { itemO, itemP } from "../aides/fabriques.ts";
import { pagesSansTexte, REPONSE_PROJETEE, RESOLU_POSITION_POUR, RUN_ID } from "./fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");
const LIEN_A = "https://exemple.invalid/a";
const LIEN_B = "https://exemple.invalid/b";
const REPONSE_ID = ulid("reponse-humaine");

function reponse(liens: readonly string[]): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return valider<ReponseObtenue>("reponse", { ...lue, id: REPONSE_ID, normalise: { ...lue.normalise, texte: REPONSE_PROJETEE, liens: [...liens] } }, "réponse de test");
}

function existence(url: string, verdict: ExistenceEtablie["verdict_existence"]): ExistenceEtablie {
  return { url_citee: url, verdict_existence: verdict, date_test: "2026-12-03T11:05:00+01:00" };
}

interface OptionsContexte {
  readonly items?: readonly Item[];
  readonly liens?: readonly ExistenceEtablie[];
  readonly gabarit?: Gabarit;
  readonly date_gel?: string;
  readonly surcharges?: Partial<ContexteNotationHumaine>;
}

function contexte(options: OptionsContexte = {}): ContexteNotationHumaine {
  const items = options.items ?? [itemP()];
  const liens = options.liens ?? [];
  const date_gel = options.date_gel ?? "2026-12-01T06:00:00+01:00";
  const vue = construireVue({
    reponse: reponse(liens.map((l) => l.url_citee)),
    question: { gabarit: options.gabarit ?? "Q-DIR", registre: "neutre", texte: "Quelle est la position de Alix Martinez ?" },
    references: items.map((item, rang) => ({ item, role: rang === 0 ? "principal" : "distracteur" })),
    date_run: date_gel,
    resolu_au_gel: RESOLU_POSITION_POUR,
    pages_citees: pagesSansTexte(liens.map((l) => l.url_citee), "sans_copie"),
    existences: liens,
  });
  return {
    notation_id: ulid("notation-humaine"),
    run_id: RUN_ID,
    objet_note: { type: "reponse", id: REPONSE_ID },
    motif_notation: "echantillon_aleatoire_10",
    annotateur_id: "a1",
    date: "2026-12-05T09:30:00+01:00",
    vue,
    items,
    date_gel,
    ...options.surcharges,
  };
}

const EXACTE: SaisieHumaine = { categorie: "exacte", drapeaux: [], cite: false, soutiens: [] };

function inexacte(surcharges: Partial<SaisieHumaine> = {}): SaisieHumaine {
  return {
    categorie: "inexacte",
    drapeaux: [],
    motif_inexactitude: "position_inventee",
    cite: false,
    soutiens: [],
    extrait: { texte: "supprimer la taxe", provenance: "reponse" },
    ...surcharges,
  };
}

function acceptee(resultat: ResultatNotationHumaine): NotationIndividuelle {
  if (resultat.statut !== "acceptee") throw new Error(`attendu acceptée, reçu : ${resultat.motifs.map((m) => `${m.code} ${m.detail}`).join(" | ")}`);
  return valider<NotationIndividuelle>("notation", resultat.notation, "notation humaine produite");
}

function codes(resultat: ResultatNotationHumaine): readonly string[] {
  if (resultat.statut !== "refusee") throw new Error("attendu un refus");
  return resultat.motifs.map((m) => m.code);
}

describe("notation acceptée", () => {
  it("une note exacte sans extrait : notateur humain au pseudonyme, items épinglés de la vue, motif reçu", () => {
    const n = acceptee(construireNotationHumaine(EXACTE, contexte()));
    expect(n).toMatchObject({
      id: ulid("notation-humaine"),
      run_id: RUN_ID,
      contexte: "run",
      objet_note: { type: "reponse", id: REPONSE_ID },
      notateur: { type: "humain", id: "a1", a_vu_identite_outil: false },
      gabarit: "Q-DIR",
      categorie: "exacte",
      drapeaux: [],
      sourcage: { cite: false, liens: [] },
      date: "2026-12-05T09:30:00+01:00",
      motif_notation: "echantillon_aleatoire_10",
    });
    const item = itemP();
    expect(n.references_item).toEqual([{ item_id: item.id, item_version: item.version, item_empreinte: item.empreinte }]);
    expect(n).not.toHaveProperty("obsolescence_fraiche");
    expect(n).not.toHaveProperty("extrait_justificatif");
    expect(n.notateur).not.toHaveProperty("sensibilite_declaree_famille");
  });

  it("une note inexacte dont l'extrait figure dans la réponse : extrait vérifié", () => {
    const n = acceptee(construireNotationHumaine(inexacte(), contexte()));
    expect(n.extrait_justificatif).toEqual({ provenance: "reponse", texte: "supprimer la taxe", verifie_deterministe: true });
  });

  it("extrait trouvé dans la référence seulement : accepté", () => {
    const saisie = inexacte({ extrait: { texte: "Nous ramènerons la TVA", provenance: "reference" } });
    expect(acceptee(construireNotationHumaine(saisie, contexte())).extrait_justificatif?.provenance).toBe("reference");
  });

  it("« indeterminee » humaine acceptée (§7 : réservée aux humains)", () => {
    const saisie: SaisieHumaine = { ...EXACTE, categorie: "indeterminee", extrait: { texte: "selon la presse", provenance: "reponse" } };
    expect(acceptee(construireNotationHumaine(saisie, contexte())).categorie).toBe("indeterminee");
  });

  it("Q-ATT avec attribution : acceptée", () => {
    const saisie: SaisieHumaine = { ...EXACTE, attribution: { attendus: ["demo-alpha"], cites: ["demo-alpha"] } };
    expect(acceptee(construireNotationHumaine(saisie, contexte({ gabarit: "Q-ATT" }))).attribution).toEqual({ attendus: ["demo-alpha"], cites: ["demo-alpha"] });
  });

  it("chaque lien reçoit son existence établie et le soutien saisi", () => {
    const liens = [{ ...existence(LIEN_A, "existe"), code_http: 200 }, existence(LIEN_B, "mort")];
    const saisie: SaisieHumaine = {
      ...EXACTE,
      cite: true,
      soutiens: [
        { url_citee: LIEN_A, verdict_soutien: "soutient" },
        { url_citee: LIEN_B, verdict_soutien: "non_applicable" },
      ],
    };
    expect(acceptee(construireNotationHumaine(saisie, contexte({ liens }))).sourcage).toEqual({
      cite: true,
      liens: [
        { url_citee: LIEN_A, verdict_existence: "existe", date_test: "2026-12-03T11:05:00+01:00", code_http: 200, verdict_soutien: "soutient" },
        { url_citee: LIEN_B, verdict_existence: "mort", date_test: "2026-12-03T11:05:00+01:00", verdict_soutien: "non_applicable" },
      ],
    });
  });
});

describe("extrait justificatif (controlerExtrait, règle 5)", () => {
  it("extrait introuvable : refus, et aucune notation", () => {
    const resultat = construireNotationHumaine(inexacte({ extrait: { texte: "phrase absente partout", provenance: "reponse" } }), contexte());
    expect(codes(resultat)).toEqual(["extrait_introuvable"]);
    expect(resultat).not.toHaveProperty("notation");
  });

  it("extrait vide : refus (schéma et test verbatim)", () => {
    expect(codes(construireNotationHumaine(inexacte({ extrait: { texte: "", provenance: "reponse" } }), contexte()))).toContain("extrait_vide");
  });

  it("extrait fait d'espaces seulement : refus, vide après normalisation", () => {
    expect(codes(construireNotationHumaine(inexacte({ extrait: { texte: "   ", provenance: "reponse" } }), contexte()))).toEqual(["extrait_vide"]);
  });

  it("extrait déclaré dans la réponse mais présent seulement dans la référence : refus, provenance inexacte", () => {
    const saisie = inexacte({ extrait: { texte: "Nous ramènerons la TVA", provenance: "reponse" } });
    expect(codes(construireNotationHumaine(saisie, contexte()))).toEqual(["provenance_inexacte"]);
  });

  it("extrait déclaré dans la référence mais présent seulement dans la réponse : refus, provenance inexacte", () => {
    const saisie = inexacte({ extrait: { texte: "supprimer la taxe", provenance: "reference" } });
    expect(codes(construireNotationHumaine(saisie, contexte()))).toEqual(["provenance_inexacte"]);
  });

  it("note autre qu'exacte sans extrait : refus par le schéma", () => {
    const { extrait: _extrait, ...sans } = inexacte();
    expect(codes(construireNotationHumaine(sans, contexte()))).toContain("non_conforme_au_schema");
  });
});

describe("règles portées par le schéma, non réécrites", () => {
  it("drapeau sur une note exacte : refus par le schéma, chemin /drapeaux", () => {
    const resultat = construireNotationHumaine({ ...EXACTE, drapeaux: ["deformation"] }, contexte());
    if (resultat.statut !== "refusee") throw new Error("attendu un refus");
    expect(resultat.motifs.every((m) => m.code === "non_conforme_au_schema")).toBe(true);
    expect(resultat.motifs.map((m) => m.chemin)).toContain("/drapeaux");
  });

  it("Q-ATT sans attribution : refus par le schéma", () => {
    expect(codes(construireNotationHumaine(EXACTE, contexte({ gabarit: "Q-ATT" })))).toContain("non_conforme_au_schema");
  });

  it("attribution hors Q-ATT : refus par le schéma", () => {
    expect(codes(construireNotationHumaine({ ...EXACTE, attribution: { attendus: [], cites: [] } }, contexte()))).toContain("non_conforme_au_schema");
  });

  it("lien mort noté « soutient » : refus par le schéma", () => {
    const saisie: SaisieHumaine = { ...EXACTE, cite: true, soutiens: [{ url_citee: LIEN_A, verdict_soutien: "soutient" }] };
    expect(codes(construireNotationHumaine(saisie, contexte({ liens: [existence(LIEN_A, "mort")] })))).toContain("non_conforme_au_schema");
  });

  it("un motif de refus du schéma est lisible : chemin et message ajv", () => {
    const resultat = construireNotationHumaine({ ...EXACTE, drapeaux: ["deformation"] }, contexte());
    if (resultat.statut !== "refusee") throw new Error("attendu un refus");
    const drapeaux = resultat.motifs.find((m) => m.chemin === "/drapeaux");
    expect(drapeaux?.detail).toMatch(/drapeaux/);
    expect(drapeaux?.detail.length).toBeGreaterThan("/drapeaux".length);
  });
});

describe("soutien des liens", () => {
  it("un lien de la vue sans soutien saisi : refus", () => {
    const saisie: SaisieHumaine = { ...EXACTE, cite: true, soutiens: [] };
    expect(codes(construireNotationHumaine(saisie, contexte({ liens: [existence(LIEN_A, "existe")] })))).toEqual(["soutien_manquant"]);
  });

  it("un soutien pour un lien que la vue ne porte pas, ou dans un autre ordre : refus", () => {
    const saisie: SaisieHumaine = { ...EXACTE, cite: true, soutiens: [{ url_citee: LIEN_B, verdict_soutien: "soutient" }] };
    expect(codes(construireNotationHumaine(saisie, contexte({ liens: [existence(LIEN_A, "existe")] })))).toEqual(["soutien_hors_vue"]);
    const enTrop: SaisieHumaine = { ...EXACTE, cite: true, soutiens: [{ url_citee: LIEN_A, verdict_soutien: "soutient" }, { url_citee: LIEN_B, verdict_soutien: "soutient" }] };
    expect(codes(construireNotationHumaine(enTrop, contexte({ liens: [existence(LIEN_A, "existe")] })))).toEqual(["soutien_hors_vue"]);
  });
});

describe("fraîcheur de l'obsolescence (§11, D17) : calculée, jamais saisie", () => {
  const O = itemO(); // date_changement 2026-11-03
  const obsolete = inexacte({ drapeaux: ["obsolescence"] });

  it("gel à J+13 du changement : fraîche", () => {
    const n = acceptee(construireNotationHumaine(obsolete, contexte({ items: [O], date_gel: "2026-11-16T00:00:00Z" })));
    expect(n.obsolescence_fraiche).toBe(true);
  });

  it("gel à J+14 pile, minuit UTC : non fraîche", () => {
    const n = acceptee(construireNotationHumaine(obsolete, contexte({ items: [O], date_gel: "2026-11-17T00:00:00Z" })));
    expect(n.obsolescence_fraiche).toBe(false);
  });

  it("fuseau : 00:30 à Paris le 17 est le 16 à 23:30 UTC, donc fraîche", () => {
    const n = acceptee(construireNotationHumaine(obsolete, contexte({ items: [O], date_gel: "2026-11-17T00:30:00+01:00" })));
    expect(n.obsolescence_fraiche).toBe(true);
  });

  it("drapeau obsolescence absent : champ absent, même sur un item O", () => {
    expect(acceptee(construireNotationHumaine(inexacte(), contexte({ items: [O] })))).not.toHaveProperty("obsolescence_fraiche");
  });

  it("drapeau obsolescence sans item O parmi les items soumis : refus, la date du changement manque", () => {
    expect(codes(construireNotationHumaine(obsolete, contexte()))).toContain("obsolescence_sans_item_o");
  });

  it("deux items O de dates de changement différentes : refus, la fraîcheur est ambiguë", () => {
    const autre = itemO({ id: ulid("autre-item-o"), obsolescence: { ...(O.obsolescence as NonNullable<Item["obsolescence"]>), date_changement: "2026-11-20" } });
    expect(codes(construireNotationHumaine(obsolete, contexte({ items: [O, autre], date_gel: "2026-11-16T00:00:00Z" })))).toContain("obsolescence_ambigue");
  });
});

describe("refus complet", () => {
  it("tous les motifs sont rendus ensemble, pas seulement le premier", () => {
    const saisie: SaisieHumaine = {
      ...inexacte({ extrait: { texte: "phrase absente partout", provenance: "reponse" }, drapeaux: ["obsolescence"] }),
      cite: true,
      soutiens: [],
    };
    const c = codes(construireNotationHumaine(saisie, contexte({ liens: [existence(LIEN_A, "existe")] })));
    expect(c).toEqual(expect.arrayContaining(["soutien_manquant", "extrait_introuvable", "obsolescence_sans_item_o"]));
  });
});

describe("contexte invalide : erreur, pas un refus de saisie", () => {
  it("pseudonyme vide : erreur", () => {
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { annotateur_id: "" } }))).toThrow(PseudonymeVide);
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { annotateur_id: "   " } }))).toThrow(PseudonymeVide);
  });

  it("motif de juge ou de panel : erreur, un humain n'y note pas", () => {
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { motif_notation: "notation_juge" as never } }))).toThrow(ContexteNotationInvalide);
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { motif_notation: "contrefactuel" as never } }))).toThrow(ContexteNotationInvalide);
  });

  it("objet noté différent de la réponse de la vue : erreur", () => {
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { objet_note: { type: "reponse", id: ulid("autre") } } }))).toThrow(ContexteNotationInvalide);
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { objet_note: { type: "lecture_comparateur", id: REPONSE_ID } } }))).toThrow(ContexteNotationInvalide);
  });

  it("items soumis différents de ceux de la vue : erreur", () => {
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { items: [itemO()] } }))).toThrow(ContexteNotationInvalide);
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { items: [] } }))).toThrow(ContexteNotationInvalide);
  });
});
