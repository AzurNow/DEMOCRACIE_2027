/**
 * Analyses de robustesse préenregistrées (§8, protocole 0.3).
 *
 * « Recalcul des métriques primaires (a) sur la seule notation humaine de l'échantillon de 10 %,
 * (b) en excluant les items contestés à un run ultérieur, (c) en excluant les formulations
 * orientées, (d) en excluant les réponses tronquées. Un résultat qui ne survit pas à ces quatre
 * recalculs est signalé comme fragile. »
 */

import { describe, expect, it } from "vitest";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import {
  DivergenceSansArbitrage,
  EchantillonHumainIncoherent,
  evaluerRobustesse,
  exclureFormulationsOrientees,
  exclureItemsContestes,
  exclureReponsesTronquees,
  recalculEchantillonHumain,
  sourcageDeNotation,
} from "../../analysis/robustesse.ts";
import { exactitude, tauxFabrication } from "../../analysis/metriques.ts";
import type { Notation, Run } from "../../analysis/types.ts";
import { notation, run, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 100, graine_du_run: 20261201, cle: ["test", "robustesse"] };

function surItem(cle: string, partiel: Parameters<typeof unite>[0] = {}) {
  return unite({ ...partiel, grappe_id: ulid(cle), item_principal_id: ulid(cle) });
}

/** Chaque réponse d'un bras reçoit son propre identifiant : deux bras sont deux outils. */
function bras(nom: string, unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.map((u, i) => ({ ...u, reponse_id: ulid(`${nom}:${i}`) }));
}

/**
 * Les deux notations humaines de l'échantillon, d'accord avec la note retenue du verdict, pour
 * chaque unité de l'échantillon. Sert aux tests où la question n'est pas l'écart humains-juges.
 */
function conformes(unites: readonly UniteAnalyse[]): Notation[] {
  return unites
    .filter((u) => u.dans_echantillon_humain)
    .flatMap((u) =>
      ["a1", "a2"].map((annotateur) =>
        notation({
          id: ulid(`n:${u.reponse_id}:${annotateur}`),
          objet_note: { type: "reponse", id: u.reponse_id },
          notateur: { type: "humain", id: annotateur },
          categorie: u.categorie,
          drapeaux: u.drapeaux,
        }),
      ),
    );
}

function evaluer(a: readonly UniteAnalyse[], b: readonly UniteAnalyse[], perimetre: Run = run()) {
  const brasA = bras("a", a);
  const brasB = bras("b", b);
  const sources = { run: perimetre, notations: conformes([...brasA, ...brasB]) };
  return evaluerRobustesse(brasA, brasB, sources, exactitude, OPTIONS);
}

describe("les quatre restrictions", () => {
  it("(b) écarte les items contestés après le gel du run", () => {
    const jeu = [surItem("i1"), surItem("i2")];
    const perimetre = run({
      contestations_posterieures: [
        { item_id: ulid("i2"), contestation_id: ulid("c1"), date_reception: "2026-12-10T09:00:00+01:00" },
      ],
    });

    const restant = exclureItemsContestes(jeu, perimetre);

    expect(restant).toHaveLength(1);
    expect(restant[0]?.item_principal_id).toBe(ulid("i1"));
    // Aucune contestation reçue : rien n'est retiré, et l'absence de liste n'est pas une erreur.
    expect(exclureItemsContestes(jeu, run())).toHaveLength(2);
  });

  it("(c) écarte les formulations orientées", () => {
    const jeu = [
      surItem("i1", { registre: "neutre" }),
      surItem("i2", { registre: "familier" }),
      surItem("i3", { registre: "oriente", premisse_fausse: true }),
    ];

    expect(exclureFormulationsOrientees(jeu).map((u) => u.registre)).toEqual(["neutre", "familier"]);
  });

  it("(d) retire exactement les réponses tronquées et garde toutes les autres", () => {
    // Deux réponses sur le même item : l'une tronquée, l'autre entière. La restriction porte sur
    // la réponse, pas sur l'item : la réponse entière de i1 reste.
    const jeu = [
      surItem("i1", { verdict_id: ulid("v-i1-entiere"), tronquee: false }),
      surItem("i1", { verdict_id: ulid("v-i1-tronquee"), tronquee: true }),
      surItem("i2", { verdict_id: ulid("v-i2-tronquee"), tronquee: true }),
      surItem("i3", { verdict_id: ulid("v-i3-entiere"), tronquee: false }),
    ];

    const restant = exclureReponsesTronquees(jeu);

    expect(restant.map((u) => u.verdict_id)).toEqual([ulid("v-i1-entiere"), ulid("v-i3-entiere")]);
  });
});

describe("ordre des recalculs", () => {
  it("rend quatre recalculs, dans l'ordre (a), (b), (c), (d) du §8", () => {
    const a = [surItem("i1", { categorie: "exacte" })];
    const b = [surItem("i1", { categorie: "inexacte" })];

    const resultat = evaluer(a, b);

    expect(resultat.recalculs.map((r) => r.recalcul)).toEqual([
      "echantillon_humain",
      "items_contestes",
      "formulations_orientees",
      "reponses_tronquees",
    ]);
  });
});

describe("marquage fragile", () => {
  it("laisse intact un résultat établi qui survit aux quatre recalculs", () => {
    // 4 items, toutes les réponses dans l'échantillon humain, aucune contestée, aucune orientée,
    // aucune tronquée. Bras A : exactes. Bras B : inexactes. Différence 1 dans les cinq calculs.
    const cles = ["i1", "i2", "i3", "i4"];
    const a = cles.map((c) => surItem(c, { dans_echantillon_humain: true, categorie: "exacte" }));
    const b = cles.map((c) => surItem(c, { dans_echantillon_humain: true, categorie: "inexacte" }));

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs.map((r) => r.difference.qualificatif)).toEqual([
      "etablie",
      "etablie",
      "etablie",
      "etablie",
    ]);
    expect(resultat.fragile).toBe(false);
    expect(resultat.motifs_fragilite).toEqual([]);
  });

  it("marque fragile un résultat établi qui devient non établi sur la seule notation humaine", () => {
    // 4 items. Sur l'ensemble : A exactes, B inexactes → différence 1, établie.
    // Dans l'échantillon humain (le seul item i4) : les deux bras sont inexacts → différence 0,
    // intervalle contenant 0 → non établie. Le résultat ne survit pas au recalcul (a).
    const communs = ["i1", "i2", "i3"];
    const a = [
      ...communs.map((c) => surItem(c, { categorie: "exacte" })),
      surItem("i4", { categorie: "inexacte", dans_echantillon_humain: true }),
    ];
    const b = [
      ...communs.map((c) => surItem(c, { categorie: "inexacte" })),
      surItem("i4", { categorie: "inexacte", dans_echantillon_humain: true }),
    ];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[0]?.recalcul).toBe("echantillon_humain");
    expect(resultat.recalculs[0]?.difference.qualificatif).toBe("non_etablie");
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("marque fragile un résultat dont un recalcul ne peut plus être calculé", () => {
    // Aucune réponse dans l'échantillon humain : le recalcul (a) n'a pas de différence à
    // qualifier. Une absence de confirmation n'est pas une confirmation.
    const a = [surItem("i1", { categorie: "exacte" }), surItem("i2", { categorie: "exacte" })];
    const b = [surItem("i1", { categorie: "inexacte" }), surItem("i2", { categorie: "inexacte" })];

    const resultat = evaluer(a, b);

    expect(resultat.recalculs[0]?.difference.qualificatif).toBeNull();
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("ne marque pas fragile ce qui n'était pas établi", () => {
    // §8 marque fragile « un résultat qui ne survit pas » : une différence non établie n'avait
    // rien à faire survivre, et la marquer fragile laisserait croire à un résultat rabaissé.
    const a = [surItem("i1", { categorie: "exacte" }), surItem("i2", { categorie: "inexacte" })];
    const b = [surItem("i1", { categorie: "exacte" }), surItem("i2", { categorie: "inexacte" })];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("non_etablie");
    expect(resultat.fragile).toBe(false);
  });

  it("marque fragile un résultat établi qui cesse de l'être seulement quand on retire les tronquées", () => {
    // 4 items, tous dans l'échantillon humain, aucun contesté, aucune formulation orientée : (a),
    // (b) et (c) recalculent sur le jeu entier et confirment le calcul principal.
    // i1 à i3, tronquées : A exacte, B inexacte. i4, entière : A et B inexactes.
    // Principal : 3/4 contre 0/4, établie. Sans les tronquées (le seul i4) : 0/1 contre 0/1,
    // différence 0, non établie. Le résultat tient aux seules réponses tronquées.
    const tronquees = ["i1", "i2", "i3"];
    const commun = { dans_echantillon_humain: true } as const;
    const a = [
      ...tronquees.map((c) => surItem(c, { ...commun, categorie: "exacte", tronquee: true })),
      surItem("i4", { ...commun, categorie: "inexacte" }),
    ];
    const b = [
      ...tronquees.map((c) => surItem(c, { ...commun, categorie: "inexacte", tronquee: true })),
      surItem("i4", { ...commun, categorie: "inexacte" }),
    ];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs.map((r) => r.difference.qualificatif)).toEqual([
      "etablie",
      "etablie",
      "etablie",
      "non_etablie",
    ]);
    expect(resultat.recalculs[3]?.difference.difference).toBe(0);
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["reponses_tronquees"]);
  });

  it("marque fragile un résultat établi dont toutes les réponses sont tronquées", () => {
    // Le recalcul (d) ne laisse plus aucune réponse : il n'a pas de différence à qualifier.
    // Une absence de confirmation n'est pas une confirmation, en (d) comme en (a).
    const cles = ["i1", "i2", "i3", "i4"];
    const commun = { dans_echantillon_humain: true, tronquee: true } as const;
    const a = cles.map((c) => surItem(c, { ...commun, categorie: "exacte" }));
    const b = cles.map((c) => surItem(c, { ...commun, categorie: "inexacte" }));

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[3]?.recalcul).toBe("reponses_tronquees");
    expect(resultat.recalculs[3]?.difference.difference).toBeNull();
    expect(resultat.recalculs[3]?.difference.qualificatif).toBeNull();
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["reponses_tronquees"]);
  });

  it("sans aucune réponse tronquée, le recalcul (d) rend exactement le calcul principal", () => {
    // Même jeu, même graine : retirer zéro réponse ne doit rien changer, intervalle compris.
    const a = [
      surItem("i1", { categorie: "exacte" }),
      surItem("i2", { categorie: "inexacte" }),
      surItem("i3", { categorie: "exacte" }),
    ];
    const b = [
      surItem("i1", { categorie: "inexacte" }),
      surItem("i2", { categorie: "inexacte" }),
      surItem("i3", { categorie: "exacte" }),
    ];

    const resultat = evaluer(a, b);

    expect(resultat.recalculs[3]?.recalcul).toBe("reponses_tronquees");
    expect(resultat.recalculs[3]?.difference).toEqual(resultat.principal);
  });
});

/*
 * Recalcul (a) sur la seule notation humaine (constats n° 8 et 49 ; §7 depuis la 0.7) : « Pour une
 * réponse de l'échantillon, la note humaine prévaut sur celle des juges. Quand les deux humains
 * s'accordent, leur note est retenue ; quand ils divergent, la réponse est arbitrée par un
 * troisième humain, et c'est cette note que retient le recalcul (a) du §8. »
 *
 * Remplace le test « (a) ne garde que les verdicts de l'échantillon humain », qui figeait la
 * lecture de `verdict.categorie_retenue` : c'est précisément ce que le protocole exclut.
 */
describe("(a) : la note humaine de l'échantillon, lue dans les notations individuelles", () => {
  const R = ulid("r-echantillon");
  const dansEchantillon = surItem("i1", { reponse_id: R, dans_echantillon_humain: true, categorie: "exacte" });

  function humaine(annotateur: string, partiel: Parameters<typeof notation>[0] = {}) {
    return notation({
      id: ulid(`n:${annotateur}`),
      objet_note: { type: "reponse", id: R },
      notateur: { type: "humain", id: annotateur },
      ...partiel,
    });
  }

  const juge = (id: string, partiel: Parameters<typeof notation>[0] = {}) =>
    notation({
      id: ulid(`n:${id}`),
      objet_note: { type: "reponse", id: R },
      notateur: { type: "juge", id },
      motif_notation: "notation_juge",
      ...partiel,
    });

  it("deux humains d'accord contre les juges : la note humaine remplace la note retenue", () => {
    // Verdict : exacte (accord des juges). Les deux humains : inexacte, déformation, un lien
    // existant qui soutient. Tout ce que lisent les métriques vient des humains.
    const noteHumaine = {
      categorie: "inexacte",
      drapeaux: ["deformation"],
      sourcage: { cite: true, liens: [{ verdict_existence: "existe", verdict_soutien: "soutient" }] },
    } as const;
    const notations = [
      juge("juge-1"),
      juge("juge-2"),
      humaine("a1", noteHumaine),
      humaine("a2", noteHumaine),
    ];

    const [recalculee] = recalculEchantillonHumain([dansEchantillon], notations);

    expect(recalculee?.categorie).toBe("inexacte");
    expect(recalculee?.drapeaux).toEqual(["deformation"]);
    expect(recalculee?.sourcage).toEqual({
      cite: true,
      au_moins_un_lien_existant: true,
      au_moins_un_lien_soutenant: true,
    });
    expect(recalculee?.reponse_id).toBe(R);
  });

  it("deux humains divergents et un troisième : la note du troisième", () => {
    const notations = [
      humaine("a1", { categorie: "exacte" }),
      humaine("a2", { categorie: "non_reponse" }),
      humaine("a3", { categorie: "indeterminee", motif_notation: "arbitrage_echantillon_10" }),
    ];

    expect(recalculEchantillonHumain([dansEchantillon], notations)[0]?.categorie).toBe("indeterminee");
  });

  it("deux humains d'accord sur la catégorie mais pas sur les drapeaux divergent", () => {
    // « Leur note » n'existe que si les deux notes sont identiques sur tout ce que lisent les
    // métriques primaires ; sinon il n'y a pas de note commune à retenir.
    const notations = [
      humaine("a1", { categorie: "inexacte", drapeaux: ["deformation"] }),
      humaine("a2", { categorie: "inexacte", drapeaux: ["obsolescence"], obsolescence_fraiche: false }),
    ];

    expect(() => recalculEchantillonHumain([dansEchantillon], notations)).toThrow(DivergenceSansArbitrage);
  });

  it("divergence sans troisième humain : erreur nommée, jamais la note des juges en repli", () => {
    const notations = [juge("juge-1"), juge("juge-2"), humaine("a1"), humaine("a2", { categorie: "inexacte" })];

    expect(() => recalculEchantillonHumain([dansEchantillon], notations)).toThrow(DivergenceSansArbitrage);
    expect(() => recalculEchantillonHumain([dansEchantillon], notations)).toThrow(R);
  });

  it("une réponse hors échantillon n'entre pas dans le recalcul (a)", () => {
    const hors = surItem("i2", { reponse_id: ulid("r-hors"), dans_echantillon_humain: false });
    const notations = [humaine("a1"), humaine("a2")];

    const recalculees = recalculEchantillonHumain([dansEchantillon, hors], notations);

    expect(recalculees.map((u) => u.reponse_id)).toEqual([R]);
  });

  it("une notation d'échantillon sur une réponse marquée hors échantillon est une incohérence", () => {
    const hors = surItem("i2", { reponse_id: R, dans_echantillon_humain: false });

    expect(() => recalculEchantillonHumain([hors], [humaine("a1"), humaine("a2")])).toThrow(
      EchantillonHumainIncoherent,
    );
  });

  it("ne lit jamais une notation de juge, même portant un motif d'échantillon ou d'arbitrage", () => {
    // Deux humains d'accord (exacte). Des juges notent inexacte, dont un sous le motif
    // d'échantillon et un sous le motif d'arbitrage : s'ils étaient lus, il y aurait trois
    // notations d'échantillon, ou un arbitrage sans divergence, et la note changerait.
    const notations = [
      juge("juge-1", { categorie: "inexacte", drapeaux: ["deformation"], motif_notation: "echantillon_aleatoire_10" }),
      juge("juge-2", { categorie: "inexacte", drapeaux: ["deformation"], motif_notation: "arbitrage_echantillon_10" }),
      humaine("a1"),
      humaine("a2"),
    ];

    expect(recalculEchantillonHumain([dansEchantillon], notations)[0]?.categorie).toBe("exacte");
  });

  it("ne lit pas un humain appelé pour une autre raison que l'échantillon", () => {
    // Un humain qui tranche un désaccord de juges ou revoit une erreur grave n'est pas tiré au sort.
    const notations = [
      humaine("a1"),
      humaine("a2"),
      humaine("a3", { categorie: "inexacte", drapeaux: ["fabrication"], motif_notation: "erreur_grave" }),
      humaine("a4", { categorie: "non_reponse", motif_notation: "desaccord_juges" }),
    ];

    expect(recalculEchantillonHumain([dansEchantillon], notations)[0]?.categorie).toBe("exacte");
  });

  it("ne lit pas une notation hors contexte run", () => {
    const notations = [
      humaine("a1"),
      humaine("a2"),
      humaine("a3", { categorie: "inexacte", contexte: "contrefactuel_candidat" }),
    ];

    expect(recalculEchantillonHumain([dansEchantillon], notations)[0]?.categorie).toBe("exacte");
  });

  it("refuse une réponse de l'échantillon qui n'a pas ses deux notations humaines", () => {
    expect(() => recalculEchantillonHumain([dansEchantillon], [humaine("a1")])).toThrow(EchantillonHumainIncoherent);
    expect(() => recalculEchantillonHumain([dansEchantillon], [])).toThrow(EchantillonHumainIncoherent);
  });

  it("refuse une double notation par le même annotateur, et un arbitre qui a déjà noté", () => {
    expect(() => recalculEchantillonHumain([dansEchantillon], [humaine("a1"), humaine("a1")])).toThrow(
      EchantillonHumainIncoherent,
    );
    const arbitreDejaVu = [
      humaine("a1"),
      humaine("a2", { categorie: "inexacte" }),
      notation({
        id: ulid("n:a1-arbitre"),
        objet_note: { type: "reponse", id: R },
        notateur: { type: "humain", id: "a1" },
        motif_notation: "arbitrage_echantillon_10",
      }),
    ];
    expect(() => recalculEchantillonHumain([dansEchantillon], arbitreDejaVu)).toThrow(EchantillonHumainIncoherent);
  });

  it("refuse un arbitrage alors que les deux humains s'accordent, et deux arbitrages", () => {
    const arbitre = (id: string) =>
      humaine(id, { categorie: "inexacte", motif_notation: "arbitrage_echantillon_10" });

    expect(() =>
      recalculEchantillonHumain([dansEchantillon], [humaine("a1"), humaine("a2"), arbitre("a3")]),
    ).toThrow(EchantillonHumainIncoherent);
    expect(() =>
      recalculEchantillonHumain(
        [dansEchantillon],
        [humaine("a1"), humaine("a2", { categorie: "non_reponse" }), arbitre("a3"), arbitre("a4")],
      ),
    ).toThrow(EchantillonHumainIncoherent);
  });

  it("marque fragile un résultat établi que la note humaine contredit sur tout l'échantillon", () => {
    // 4 items, tous dans l'échantillon. Verdicts : A exacte, B inexacte → différence 1, établie.
    // Les humains notent les deux bras inexacts : sur la seule notation humaine, différence 0.
    // Avant la correction, (a) relisait les verdicts et confirmait à tort le résultat.
    const cles = ["i1", "i2", "i3", "i4"];
    const a = bras("a", cles.map((c) => surItem(c, { dans_echantillon_humain: true, categorie: "exacte" })));
    const b = bras("b", cles.map((c) => surItem(c, { dans_echantillon_humain: true, categorie: "inexacte" })));
    const notations = [...a, ...b].flatMap((u) =>
      ["a1", "a2"].map((annotateur) =>
        notation({
          id: ulid(`n:${u.reponse_id}:${annotateur}`),
          objet_note: { type: "reponse", id: u.reponse_id },
          notateur: { type: "humain", id: annotateur },
          categorie: "inexacte",
        }),
      ),
    );

    const resultat = evaluerRobustesse(a, b, { run: run(), notations }, exactitude, OPTIONS);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[0]?.difference.difference).toBe(0);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("les métriques à drapeau se recalculent aussi sur la note humaine", () => {
    // Item A : verdict sans fabrication, humains d'accord sur une fabrication.
    const itemA = surItem("i-a", { reponse_id: R, dans_echantillon_humain: true, type_item_principal: "A" });
    const notations = ["a1", "a2"].map((annotateur) =>
      humaine(annotateur, { categorie: "inexacte", drapeaux: ["fabrication"] }),
    );

    expect(tauxFabrication([itemA]).numerateur).toBe(0);
    expect(tauxFabrication(recalculEchantillonHumain([itemA], notations)).numerateur).toBe(1);
  });
});

describe("sourçage d'une notation humaine (§8 : « au moins une source existante qui soutient »)", () => {
  it("un lien mort qui soutient et un lien vivant hors sujet ne font pas un sourçage soutenant", () => {
    const n = notation({
      sourcage: {
        cite: true,
        liens: [
          { verdict_existence: "mort", verdict_soutien: "soutient" },
          { verdict_existence: "existe", verdict_soutien: "ne_soutient_pas" },
        ],
      },
    });

    expect(sourcageDeNotation(n)).toEqual({
      cite: true,
      au_moins_un_lien_existant: true,
      au_moins_un_lien_soutenant: false,
    });
  });

  it("un même lien existant et soutenant fait un sourçage soutenant", () => {
    const n = notation({
      sourcage: { cite: true, liens: [{ verdict_existence: "existe", verdict_soutien: "soutient" }] },
    });

    expect(sourcageDeNotation(n).au_moins_un_lien_soutenant).toBe(true);
  });
});
