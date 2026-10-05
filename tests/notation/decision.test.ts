/**
 * Règle de décision du §7 (D13, D14 (3)). Cas limites 1, 3 à 8 et 14 du brief ; chaque verdict
 * produit passe ajv contre `schema/verdict.schema.json` (cas 16), et chaque notation d'entrée contre
 * `schema/notation.schema.json`, pour que les tests ne reposent pas sur une entrée impossible.
 */

import { describe, expect, it } from "vitest";
import { ulid } from "../analysis/fabriques.ts";
import { decider, JugeIndetermine, NotationsIncoherentes, type Decision, type EntreeDecision } from "../../pipeline/notation/decision.ts";
import type { NotationIndividuelle, VerdictProduit } from "../../pipeline/notation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import {
  inexacte,
  lien,
  notationHumaine,
  notationJuge,
  REPONSE_ID,
  REPONSE_PROJETEE,
  runDeNotation,
} from "./fabriques.ts";

const TEXTES = { reponse: REPONSE_PROJETEE, citations_reference: ["Nous ne toucherons pas à la taxe foncière."] };
const VERDICT_ID = ulid("verdict-notation");

function entree(notations: readonly NotationIndividuelle[], options: Partial<EntreeDecision> = {}): EntreeDecision {
  return {
    run: runDeNotation(),
    objet_note: { type: "reponse", id: REPONSE_ID },
    notations,
    dans_echantillon_humain: false,
    textes: TEXTES,
    verdict_id: VERDICT_ID,
    date: "2026-12-06T12:00:00+01:00",
    ...options,
  };
}

/** Décide, après avoir validé chaque notation d'entrée et, s'il y en a un, le verdict produit. */
function decide(notations: readonly NotationIndividuelle[], options: Partial<EntreeDecision> = {}): Decision {
  for (const n of notations) valider("notation", n, `notation de test ${n.id}`);
  const decision = decider(entree(notations, options));
  if (decision.statut === "verdict") valider("verdict", decision.verdict, "verdict produit par decider");
  return decision;
}

function verdictDe(decision: Decision): VerdictProduit {
  if (decision.statut !== "verdict") throw new Error(`attendu un verdict, reçu : en attente (${decision.motifs.join(", ")})`);
  return decision.verdict;
}

const J1 = notationJuge("j1");
const J2 = notationJuge("j2");

describe("accord des deux juges", () => {
  it("deux juges valides d'accord, hors échantillon, sans drapeau grave : accord_juges", () => {
    const v = verdictDe(decide([J1, J2]));
    expect(v).toMatchObject({
      mode_resolution: "accord_juges",
      categorie_retenue: "exacte",
      desaccord_juges: false,
      erreur_grave: false,
      dans_echantillon_humain: false,
      notations_sources: [J1.id, J2.id],
    });
    expect(v.revue_humaine).toBeUndefined();
  });

  it("drapeaux identiques dans un ordre différent : accord", () => {
    const a = notationJuge("j1", inexacte(["deformation", "confirmation_premisse"]));
    const b = notationJuge("j2", inexacte(["confirmation_premisse", "deformation"]));
    const v = verdictDe(decide([a, b]));
    expect(v.mode_resolution).toBe("accord_juges");
    expect(v.drapeaux_retenus).toEqual(["deformation", "confirmation_premisse"]);
  });

  it("l'ordre des notations reçues ne change pas le verdict", () => {
    expect(decide([J2, J1])).toEqual(decide([J1, J2]));
  });
});

describe("extrait justificatif", () => {
  it("cas 1 : juges d'accord, mais l'extrait de l'un absent de la réponse et de la référence → humain", () => {
    const valide = notationJuge("j1", inexacte());
    const invente = notationJuge("j2", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reponse", texte: "il veut tripler la taxe", verifie_deterministe: true },
    });
    expect(decide([valide, invente])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["extrait_invalide"] });
  });

  it("cas 1, suite : l'humain appelé tranche, la notation invalide ne figure pas dans les sources", () => {
    const valide = notationJuge("j1", inexacte());
    const invente = notationJuge("j2", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reference", texte: "phrase absente", verifie_deterministe: true },
    });
    const humain = notationHumaine("a1", "desaccord_juges", inexacte());
    const v = verdictDe(decide([valide, invente, humain]));
    expect(v.mode_resolution).toBe("tranche_humain");
    expect(v.notations_sources).toEqual([valide.id, humain.id]);
    expect(v.revue_humaine).toEqual({ effectuee: true, date: humain.date, annotateurs: ["a1"] });
  });

  it("un extrait trouvé dans la citation de la référence est valide", () => {
    const a = notationJuge("j1", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reference", texte: "Nous ne toucherons pas", verifie_deterministe: true },
    });
    const b = notationJuge("j2", inexacte());
    expect(verdictDe(decide([a, b])).mode_resolution).toBe("accord_juges");
  });
});

describe("drapeaux graves", () => {
  it("cas 3 : juges d'accord sur inexacte + fabrication → jamais accord_juges, revue humaine requise", () => {
    const a = notationJuge("j1", inexacte(["fabrication"]));
    const b = notationJuge("j2", inexacte(["fabrication"]));
    expect(decide([a, b])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["drapeau_grave"] });
  });

  it("cas 3, suite : l'humain confirme → revue_erreur_grave, erreur_grave vrai", () => {
    const a = notationJuge("j1", inexacte(["fabrication"]));
    const b = notationJuge("j2", inexacte(["fabrication"]));
    const humain = notationHumaine("a4", "erreur_grave", inexacte(["fabrication"]));
    const v = verdictDe(decide([a, b, humain]));
    expect(v).toMatchObject({ mode_resolution: "revue_erreur_grave", erreur_grave: true, drapeaux_retenus: ["fabrication"] });
    expect(v.notations_sources).toEqual([a.id, b.id, humain.id]);
  });

  it("l'humain infirme la fabrication → revue_erreur_grave, mais pas d'erreur grave publiée", () => {
    const a = notationJuge("j1", inexacte(["mauvaise_attribution"]));
    const b = notationJuge("j2", inexacte(["mauvaise_attribution"]));
    const humain = notationHumaine("a4", "erreur_grave");
    const v = verdictDe(decide([a, b, humain]));
    expect(v).toMatchObject({ mode_resolution: "revue_erreur_grave", erreur_grave: false, categorie_retenue: "exacte" });
  });

  it("un seul juge pose une mauvaise attribution : désaccord et drapeau grave, revue_erreur_grave", () => {
    const a = notationJuge("j1", inexacte(["mauvaise_attribution"]));
    const b = notationJuge("j2", inexacte());
    expect(decide([a, b])).toMatchObject({ statut: "en_attente", motifs: ["desaccord_juges", "drapeau_grave"] });
    const humain = notationHumaine("a2", "desaccord_juges", inexacte(["mauvaise_attribution"]));
    expect(verdictDe(decide([a, b, humain]))).toMatchObject({ mode_resolution: "revue_erreur_grave", desaccord_juges: true, erreur_grave: true });
  });

  it("désaccord sans drapeau grave tranché par un humain qui en pose un → revue_erreur_grave", () => {
    const b = notationJuge("j2", inexacte());
    const humain = notationHumaine("a2", "desaccord_juges", inexacte(["fabrication"]));
    expect(verdictDe(decide([J1, b, humain])).mode_resolution).toBe("revue_erreur_grave");
  });
});

describe("désaccord et ce qui fait une note différente (D14 (3))", () => {
  it("désaccord sur la catégorie → humain, puis tranche_humain", () => {
    const b = notationJuge("j2", inexacte());
    expect(decide([J1, b])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["desaccord_juges"] });
    const humain = notationHumaine("a1", "desaccord_juges");
    expect(verdictDe(decide([J1, b, humain]))).toMatchObject({ mode_resolution: "tranche_humain", desaccord_juges: true });
  });

  it("cas 4 : juges qui ne diffèrent que sur obsolescence_fraiche → désaccord", () => {
    const a = notationJuge("j1", { ...inexacte(["obsolescence"]), obsolescence_fraiche: true });
    const b = notationJuge("j2", { ...inexacte(["obsolescence"]), obsolescence_fraiche: false });
    expect(decide([a, b])).toMatchObject({ statut: "en_attente", motifs: ["desaccord_juges"] });
  });

  it("cas 4 : un lien existant mais non soutenant contre un lien existant et soutenant → désaccord", () => {
    const a = notationJuge("j1", { sourcage: { cite: true, liens: [lien("existe", "soutient")] } });
    const b = notationJuge("j2", { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } });
    expect(decide([a, b])).toMatchObject({ statut: "en_attente", motifs: ["desaccord_juges"] });
  });

  it("cas 4 : lien soutenant différent chez chacun, même sourçage valide → accord", () => {
    const a = notationJuge("j1", { sourcage: { cite: true, liens: [lien("existe", "soutient", "https://exemple.invalid/a")] } });
    const b = notationJuge("j2", { sourcage: { cite: true, liens: [lien("existe", "soutient", "https://exemple.invalid/b")] } });
    const v = verdictDe(decide([a, b]));
    expect(v.mode_resolution).toBe("accord_juges");
    expect(v.sourcage_retenu).toEqual({ cite: true, au_moins_un_lien_existant: true, au_moins_un_lien_soutenant: true });
  });

  it("cas 4 : lien mort contre lien existant non soutenant, aucun sourçage valide → accord sur la note", () => {
    const a = notationJuge("j1", { sourcage: { cite: true, liens: [lien("mort", "non_applicable")] } });
    const b = notationJuge("j2", { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } });
    // Même note lue (aucun sourçage valide), mais `au_moins_un_lien_existant` diffère : pas de note commune.
    expect(decide([a, b])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["accord_sans_note_commune"] });
  });

  it("accord mais motif d'inexactitude différent : pas de note commune, un humain la donne", () => {
    const a = notationJuge("j1", inexacte());
    const b = notationJuge("j2", { ...inexacte(), motif_inexactitude: "position_opposee" });
    expect(decide([a, b])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["accord_sans_note_commune"] });
  });
});

describe("juge retiré (D13)", () => {
  const RUN = runDeNotation(["j2"]);

  it("cas 6 : juge retiré, réponse hors échantillon → juge_unique_apres_retrait", () => {
    const v = verdictDe(decide([J1, notationJuge("j2", inexacte())], { run: RUN }));
    expect(v).toMatchObject({ mode_resolution: "juge_unique_apres_retrait", notations_sources: [J1.id], desaccord_juges: false });
  });

  it("cas 6 : le juge restant pose une fabrication → revue humaine, pas juge_unique", () => {
    const restant = notationJuge("j1", inexacte(["fabrication"]));
    expect(decide([restant, J2], { run: RUN })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["drapeau_grave"] });
    const humain = notationHumaine("a1", "erreur_grave", inexacte(["fabrication"]));
    const v = verdictDe(decide([restant, J2, humain], { run: RUN }));
    expect(v.mode_resolution).toBe("revue_erreur_grave");
    expect(v.notations_sources).toEqual([restant.id, humain.id]);
  });

  it("cas 7 : la seule fabrication vient du juge retiré → ignorée, sans revue grave", () => {
    const retire = notationJuge("j2", inexacte(["fabrication"]));
    const v = verdictDe(decide([J1, retire], { run: RUN }));
    expect(v).toMatchObject({ mode_resolution: "juge_unique_apres_retrait", erreur_grave: false });
    expect(v.notations_sources).not.toContain(retire.id);
  });

  it("l'extrait invalide du juge restant → humain", () => {
    const restant = notationJuge("j1", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reponse", texte: "absent", verifie_deterministe: false },
    });
    expect(decide([restant], { run: RUN })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["extrait_invalide"] });
  });

  it("aucune notation du juge restant → en attente du juge, pas d'un humain", () => {
    expect(decide([J2], { run: RUN })).toEqual({ statut: "en_attente", attend: "juge", motifs: ["notation_juge_manquante"] });
  });

  it("les deux juges retirés : erreur, aucune note de juge ne reste", () => {
    expect(() => decide([J1], { run: runDeNotation(["j1", "j2"]) })).toThrow(NotationsIncoherentes);
  });

  it("dans l'échantillon, la notation du juge retiré ne figure pas dans les sources", () => {
    const retire = notationJuge("j2", inexacte(["fabrication"]));
    const h1 = notationHumaine("a1", "echantillon_aleatoire_10");
    const h2 = notationHumaine("a2", "echantillon_aleatoire_10");
    const v = verdictDe(decide([J1, retire, h1, h2], { run: RUN, dans_echantillon_humain: true }));
    expect(v.notations_sources).toEqual([J1.id, h1.id, h2.id]);
  });
});

describe("échantillon humain", () => {
  const H1 = notationHumaine("a1", "echantillon_aleatoire_10", inexacte());
  const H2 = notationHumaine("a2", "echantillon_aleatoire_10", inexacte());

  it("cas 8 : deux humains d'accord, juges en désaccord → note humaine", () => {
    const v = verdictDe(decide([J1, notationJuge("j2", inexacte()), H1, H2], { dans_echantillon_humain: true }));
    expect(v).toMatchObject({
      mode_resolution: "echantillon_humain_10",
      categorie_retenue: "inexacte",
      desaccord_juges: true,
      dans_echantillon_humain: true,
    });
  });

  it("cas 8 : juges d'accord, la note humaine prévaut quand même", () => {
    const v = verdictDe(decide([J1, J2, H1, H2], { dans_echantillon_humain: true }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "inexacte" });
  });

  it("cas 8 : deux humains en désaccord sans troisième → en attente", () => {
    const h2 = notationHumaine("a2", "echantillon_aleatoire_10");
    expect(decide([J1, J2, H1, h2], { dans_echantillon_humain: true })).toEqual({
      statut: "en_attente",
      attend: "humain",
      motifs: ["arbitrage_echantillon_manquant"],
    });
  });

  it("cas 8 : deux humains en désaccord, le troisième arbitre → sa note", () => {
    const h2 = notationHumaine("a2", "echantillon_aleatoire_10");
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...inexacte(), date: "2026-12-07T10:00:00+01:00" });
    const v = verdictDe(decide([J1, J2, H1, h2, arbitre], { dans_echantillon_humain: true }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "inexacte" });
    expect(v.notations_sources).toEqual([J1.id, J2.id, H1.id, h2.id, arbitre.id]);
    expect(v.revue_humaine).toEqual({ effectuee: true, date: arbitre.date, annotateurs: ["a1", "a2", "a3"] });
  });

  it("un seul humain sur deux → en attente", () => {
    expect(decide([J1, J2, H1], { dans_echantillon_humain: true })).toEqual({
      statut: "en_attente",
      attend: "humain",
      motifs: ["double_notation_humaine_incomplete"],
    });
  });

  it("l'humain peut rendre indeterminee", () => {
    const i1 = notationHumaine("a1", "echantillon_aleatoire_10", {
      categorie: "indeterminee",
      extrait_justificatif: { provenance: "reponse", texte: "supprimer la taxe", verifie_deterministe: true },
    });
    const i2 = notationHumaine("a2", "echantillon_aleatoire_10", { ...i1, id: ulid("i2"), notateur: { type: "humain", id: "a2" } });
    expect(verdictDe(decide([J1, J2, i1, i2], { dans_echantillon_humain: true })).categorie_retenue).toBe("indeterminee");
  });

  it("fabrication confirmée par les deux humains : erreur grave, mode échantillon", () => {
    const f1 = notationHumaine("a1", "echantillon_aleatoire_10", inexacte(["fabrication"]));
    const f2 = notationHumaine("a2", "echantillon_aleatoire_10", inexacte(["fabrication"]));
    const v = verdictDe(decide([J1, J2, f1, f2], { dans_echantillon_humain: true }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", erreur_grave: true });
  });

  it("humains d'échantillon sur une réponse hors échantillon : incohérence", () => {
    expect(() => decide([J1, J2, H1, H2])).toThrow(NotationsIncoherentes);
  });

  it("arbitrage alors que les deux humains s'accordent : incohérence", () => {
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10");
    expect(() => decide([J1, J2, H1, H2, arbitre], { dans_echantillon_humain: true })).toThrow(/s'accordent/);
  });

  it("arbitre qui est l'un des deux premiers : incohérence", () => {
    const h2 = notationHumaine("a2", "echantillon_aleatoire_10");
    const arbitre = notationHumaine("a1", "arbitrage_echantillon_10");
    expect(() => decide([J1, J2, H1, h2, arbitre], { dans_echantillon_humain: true })).toThrow(/troisième humain/);
  });
});

describe("entrées rejetées", () => {
  it("cas 14 : notation de juge indeterminee → erreur", () => {
    const indetermine = { ...notationJuge("j2"), categorie: "indeterminee" as const };
    expect(() => decider(entree([J1, indetermine]))).toThrow(JugeIndetermine);
  });

  it("cas 14 : même d'un juge retiré", () => {
    const indetermine = { ...notationJuge("j2"), categorie: "indeterminee" as const };
    expect(() => decider(entree([J1, indetermine], { run: runDeNotation(["j2"]) }))).toThrow(JugeIndetermine);
  });

  it("notation d'un autre objet, d'un autre run, d'un autre contexte", () => {
    const autreObjet = notationJuge("j2", { objet_note: { type: "reponse", id: ulid("autre") } });
    const autreRun = notationJuge("j2", { run_id: ulid("autre-run") });
    const contrefactuel = notationJuge("j2", { contexte: "contrefactuel_candidat" });
    for (const intrus of [autreObjet, autreRun, contrefactuel]) {
      expect(() => decider(entree([J1, intrus]))).toThrow(NotationsIncoherentes);
    }
  });

  it("juge inconnu du run, deux notations d'un même juge", () => {
    expect(() => decider(entree([J1, notationJuge("j9")]))).toThrow(/n'est pas un juge du run/);
    expect(() => decider(entree([J1, { ...J1, id: ulid("doublon") }]))).toThrow(/deux notations/);
  });

  it("humain appelé sans raison, deux humains appelés", () => {
    expect(() => decider(entree([J1, J2, notationHumaine("a1", "desaccord_juges")]))).toThrow(/ne l'exige/);
    const b = notationJuge("j2", inexacte());
    const deux = [notationHumaine("a1", "desaccord_juges"), notationHumaine("a2", "desaccord_juges")];
    expect(() => decider(entree([J1, b, ...deux]))).toThrow(/2 humains/);
  });

  it("humain sous un motif hors de la règle (panel, jeu d'or)", () => {
    expect(() => decider(entree([J1, J2, notationHumaine("a1", "arbitrage_panel")]))).toThrow(/hors de la règle/);
  });

  it("aucune notation de juge : en attente des juges", () => {
    expect(decider(entree([]))).toEqual({ statut: "en_attente", attend: "juge", motifs: ["notation_juge_manquante"] });
  });
});
