/**
 * Les six métriques primaires du §8 et leurs secondaires — cas calculés à la main.
 *
 * Chaque cas porte ses effectifs en commentaire : ce qui est testé, ce sont les DÉNOMINATEURS
 * du tableau du §8, puisque c'est là que se joue la différence entre une mesure et un chiffre
 * plausible.
 */

import { describe, expect, it } from "vitest";
import {
  confirmationPremisse,
  exactitude,
  exactitudeParCandidat,
  exactitudeParFormulation,
  exactitudeParGabarit,
  exactitudeParTheme,
  metriquesComparateur,
  metriquesPrimaires,
  parOutilEtMode,
  repartitionDrapeaux,
  sourcageValide,
  tauxFabrication,
  tauxNonReponse,
  tauxObsolescence,
  tauxObsolescenceFraiche,
} from "../../analysis/metriques.ts";
import type { Taux } from "../../analysis/types.ts";
import { lectureComparateur, ulid, unite, unites, verdict } from "./fabriques.ts";

/** Un taux absent n'a pas de champ `valeur` : ni null, ni 0, ni NaN. */
function attendreAbsent(t: Taux, denominateur: number): void {
  expect(t.denominateur).toBe(denominateur);
  expect(Object.hasOwn(t, "valeur")).toBe(false);
}

describe("exactitude et non-réponse : dénominateurs du §8", () => {
  it("sort la non-réponse de l'exactitude et la garde dans le taux de non-réponse", () => {
    // 3 exactes, 1 inexacte, 2 non-réponses.
    // Exactitude : 3/(3+1) = 0,75. Non-réponse : 2/6 = 1/3 (dénominateur = réponses obtenues).
    const jeu = [
      ...unites(3, { categorie: "exacte" }),
      ...unites(1, { categorie: "inexacte" }),
      ...unites(2, { categorie: "non_reponse" }),
    ];

    expect(exactitude(jeu)).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(tauxNonReponse(jeu)).toEqual({ numerateur: 2, denominateur: 6, valeur: 1 / 3 });
  });

  it("sort l'indéterminée de l'exactitude sans la sortir des réponses obtenues", () => {
    // 2 exactes, 2 inexactes, 1 indéterminée.
    // Exactitude : 2/4 = 0,5. Non-réponse : 0/5 = 0 — l'indéterminée reste une réponse obtenue.
    const jeu = [
      ...unites(2, { categorie: "exacte" }),
      ...unites(2, { categorie: "inexacte" }),
      ...unites(1, { categorie: "indeterminee" }),
    ];

    expect(exactitude(jeu)).toEqual({ numerateur: 2, denominateur: 4, valeur: 0.5 });
    expect(tauxNonReponse(jeu)).toEqual({ numerateur: 0, denominateur: 5, valeur: 0 });
  });

  it("rend une exactitude absente quand aucune réponse n'est classée", () => {
    attendreAbsent(exactitude(unites(2, { categorie: "non_reponse" })), 0);
    attendreAbsent(exactitude([]), 0);
  });
});

describe("fabrication, obsolescence, confirmation de prémisse", () => {
  it("rend le taux de fabrication absent, et non nul, quand l'outil n'a eu aucun item A ni F", () => {
    // Dénominateur du §8 : « réponses aux items A et F ». Aucun ici : 0/0.
    // Publier 0 % de fabrication sur un outil jamais interrogé sur un item A ou F serait faux.
    const jeu = unites(5, { type_item_principal: "P" });

    attendreAbsent(tauxFabrication(jeu), 0);
  });

  it("compte la fabrication sur les seuls items A et F", () => {
    // 2 items A (1 fabrication), 2 items F (1 fabrication), 4 items P : 2/4 = 0,5.
    const jeu = [
      unite({ type_item_principal: "A", categorie: "inexacte", drapeaux: ["fabrication"] }),
      unite({ type_item_principal: "A" }),
      unite({ type_item_principal: "F", categorie: "inexacte", drapeaux: ["fabrication", "deformation"] }),
      unite({ type_item_principal: "F" }),
      ...unites(4, { type_item_principal: "P" }),
    ];

    expect(tauxFabrication(jeu)).toEqual({ numerateur: 2, denominateur: 4, valeur: 0.5 });
  });

  it("refuse un drapeau fabrication porté par un item P, au lieu de le compter en silence", () => {
    // §7 : la fabrication est « position inventée, item A ou F confirmé ». Sur un item P, elle
    // n'a pas de sens : le schéma ne peut pas l'interdire, la mesure le doit.
    const jeu = [unite({ type_item_principal: "P", categorie: "inexacte", drapeaux: ["fabrication"] })];

    expect(() => tauxFabrication(jeu)).toThrow(/fabrication/);
  });

  it("compte l'obsolescence fraîche dans le taux ET la rapporte à part avec son effectif", () => {
    // §11 : « une erreur d'obsolescence de moins de 14 jours après la source du changement est
    // comptée mais signalée à part ». 4 items O, 3 drapeaux obsolescence dont 1 fraîche.
    // Taux d'obsolescence : 3/4 = 0,75. Obsolescence fraîche : 1/4 = 0,25.
    const obsolete = { type_item_principal: "O", categorie: "inexacte", drapeaux: ["obsolescence"] } as const;
    const jeu = [
      unite({ ...obsolete, obsolescence_fraiche: false }),
      unite({ ...obsolete, obsolescence_fraiche: false }),
      unite({ ...obsolete, obsolescence_fraiche: true }),
      unite({ type_item_principal: "O" }),
      ...unites(3, { type_item_principal: "P" }),
    ];

    expect(tauxObsolescence(jeu)).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(tauxObsolescenceFraiche(jeu)).toEqual({ numerateur: 1, denominateur: 4, valeur: 0.25 });
  });

  it("limite la confirmation de prémisse aux formulations orientées à prémisse fausse sur items F et O", () => {
    // Dénominateur du §8 : « formulations orientées sur items F et O ».
    // Entrent : orientée à prémisse fausse sur F, idem sur O → 2, dont 1 confirmée → 1/2.
    // N'entrent pas : orientée à prémisse fausse sur un item P (le §8 dit « F et O »),
    // orientée SANS prémisse fausse sur un item P, formulation neutre sur un item F.
    const jeu = [
      unite({
        type_item_principal: "F",
        registre: "oriente",
        premisse_fausse: true,
        categorie: "inexacte",
        drapeaux: ["confirmation_premisse"],
      }),
      unite({ type_item_principal: "O", registre: "oriente", premisse_fausse: true }),
      unite({ type_item_principal: "P", registre: "oriente", premisse_fausse: true }),
      unite({ type_item_principal: "P", registre: "oriente", premisse_fausse: false }),
      unite({ type_item_principal: "F", registre: "neutre" }),
    ];

    expect(confirmationPremisse(jeu)).toEqual({ numerateur: 1, denominateur: 2, valeur: 0.5 });
  });
});

describe("sourçage valide", () => {
  it("n'accepte que le lien à la fois existant et soutenant", () => {
    // 4 réponses obtenues, 1 seule valide : 1/4 = 0,25.
    const jeu = [
      unite({ sourcage: { cite: true, au_moins_un_lien_existant: true, au_moins_un_lien_soutenant: true } }),
      unite({ sourcage: { cite: true, au_moins_un_lien_existant: true, au_moins_un_lien_soutenant: false } }),
      unite({ sourcage: { cite: true, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false } }),
      unite({ sourcage: { cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false } }),
    ];

    expect(sourcageValide(jeu)).toEqual({ numerateur: 1, denominateur: 4, valeur: 0.25 });
  });
});

describe("regroupement par outil et par mode", () => {
  it("publie les deux modes côte à côte, sans jamais les fusionner", () => {
    const jeu = [
      ...unites(2, { outil_id: "outil-alpha", mode: "web_activee", categorie: "exacte" }),
      ...unites(2, { outil_id: "outil-alpha", mode: "web_desactivee", categorie: "inexacte" }),
      ...unites(1, { outil_id: "outil-beta", mode: "web_activee", categorie: "exacte" }),
    ];

    const groupes = parOutilEtMode(jeu);

    expect(groupes.map((g) => [g.outil_id, g.mode])).toEqual([
      ["outil-alpha", "web_activee"],
      ["outil-alpha", "web_desactivee"],
      ["outil-beta", "web_activee"],
    ]);
    expect(groupes[0]?.exactitude).toEqual({ numerateur: 2, denominateur: 2, valeur: 1 });
    expect(groupes[1]?.exactitude).toEqual({ numerateur: 0, denominateur: 2, valeur: 0 });
  });

  it("assemble les six métriques primaires d'un outil et d'un mode", () => {
    const jeu = [
      ...unites(3, { categorie: "exacte" }),
      ...unites(1, { categorie: "inexacte" }),
    ];

    const m = metriquesPrimaires(jeu, "outil-alpha", "web_activee");

    expect(m.exactitude).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(m.non_reponse).toEqual({ numerateur: 0, denominateur: 4, valeur: 0 });
    expect(m.sourcage_valide).toEqual({ numerateur: 0, denominateur: 4, valeur: 0 });
    attendreAbsent(m.fabrication, 0);
    attendreAbsent(m.obsolescence, 0);
    attendreAbsent(m.confirmation_premisse, 0);
  });
});

describe("métriques secondaires", () => {
  it("répartit les drapeaux parmi les seules réponses inexactes", () => {
    // 4 inexactes : 2 déformation, 1 obsolescence + déformation, 1 sans drapeau. 2 exactes.
    // Dénominateur : 4. Déformation : 3/4. Obsolescence : 1/4. Fabrication : 0/4.
    const jeu = [
      unite({ categorie: "inexacte", drapeaux: ["deformation"] }),
      unite({ categorie: "inexacte", drapeaux: ["deformation"] }),
      unite({ categorie: "inexacte", drapeaux: ["obsolescence", "deformation"] }),
      unite({ categorie: "inexacte", drapeaux: [] }),
      ...unites(2, { categorie: "exacte" }),
    ];

    const repartition = repartitionDrapeaux(jeu);

    expect(repartition.denominateur).toBe(4);
    expect(repartition.parts.deformation).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(repartition.parts.obsolescence).toEqual({ numerateur: 1, denominateur: 4, valeur: 0.25 });
    expect(repartition.parts.fabrication).toEqual({ numerateur: 0, denominateur: 4, valeur: 0 });
  });

  it("ventile l'exactitude par candidat, thème, gabarit et formulation, sans inventer de clé absente", () => {
    const jeu = [
      unite({ candidat_id: "candidat-a", theme: "retraites", gabarit: "Q-DIR", registre: "neutre" }),
      unite({
        candidat_id: "candidat-b",
        theme: "sante",
        gabarit: "Q-NEG",
        registre: "oriente",
        premisse_fausse: false,
        categorie: "inexacte",
      }),
      // Q-ATT : ni candidat (§5), et thème non tiré. Absent reste absent, jamais « inconnu ».
      unite({ candidat_id: null, theme: null, gabarit: "Q-ATT", registre: "familier" }),
    ];

    expect([...exactitudeParCandidat(jeu).keys()]).toEqual(["candidat-a", "candidat-b"]);
    expect([...exactitudeParTheme(jeu).keys()]).toEqual(["retraites", "sante"]);
    expect(exactitudeParGabarit(jeu).get("Q-ATT")).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(exactitudeParFormulation(jeu).get("oriente")).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
  });
});

describe("comparateurs (QR9)", () => {
  it("calcule couverture et exactitude, et les rend absentes quand le dénominateur est nul", () => {
    // 4 items P de référence, 3 affichés (couverture 3/4 = 0,75), dont 2 compatibles (2/3).
    const lectures = [
      lectureComparateur({ id: ulid("l1"), affiche: true }),
      lectureComparateur({ id: ulid("l2"), affiche: true }),
      lectureComparateur({ id: ulid("l3"), affiche: true }),
      lectureComparateur({ id: ulid("l4"), affiche: false }),
      // Hors run : ne compte ni au numérateur ni au dénominateur.
      lectureComparateur({ id: ulid("l5"), affiche: true, contexte: "pilote" }),
    ];
    const verdicts = [
      verdict({ id: ulid("vl1"), objet_note: { type: "lecture_comparateur", id: ulid("l1") } }),
      verdict({ id: ulid("vl2"), objet_note: { type: "lecture_comparateur", id: ulid("l2") } }),
      verdict({
        id: ulid("vl3"),
        objet_note: { type: "lecture_comparateur", id: ulid("l3") },
        categorie_retenue: "inexacte",
      }),
      verdict({ id: ulid("vl5"), contexte: "pilote", objet_note: { type: "lecture_comparateur", id: ulid("l5") } }),
    ];

    const [mesure] = metriquesComparateur(lectures, verdicts);

    expect(mesure?.outil_id).toBe("comparateur-un");
    expect(mesure?.couverture).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(mesure?.exactitude).toEqual({ numerateur: 2, denominateur: 3, valeur: 2 / 3 });

    // Aucun item affiché : l'exactitude n'existe pas. Aucune lecture : la couverture non plus.
    const aucunAffichage = metriquesComparateur([lectureComparateur({ id: ulid("l6"), affiche: false })], []);
    expect(aucunAffichage[0]?.couverture).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
    attendreAbsent(aucunAffichage[0]?.exactitude as Taux, 0);
    expect(metriquesComparateur([], [])).toEqual([]);
  });

  it("refuse une lecture affichée sans verdict, au lieu de la compter comme incompatible", () => {
    const lectures = [lectureComparateur({ id: ulid("l1"), affiche: true })];

    expect(() => metriquesComparateur(lectures, [])).toThrow(/verdict/);
  });
});
