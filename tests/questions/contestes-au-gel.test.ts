/**
 * Décision 8 de l'auteur du 2026-09-29 (`docs/TACHES-AUTEUR.md`, texte à écrire au §5 en 0.14) :
 * « Le rapport du run publie, pour chaque candidat interrogé, les items P vérifiés que leur
 * contestation tient hors du tirage à la date du gel. » Compte par item, pas par question.
 *
 * Champ `tirage.contestes_au_gel` : une entrée par candidat interrogé, zéro compris, triée par
 * `candidat_id`, ses `item_ids` triés. Un item y figure si sa place au gel est `conteste`
 * (`place-au-gel.ts`) et si, sans sa contestation, il compterait au seuil de couverture : même
 * fenêtre de validité, même version de mesure (`couverture.ts`, règle retenue par défaut, à
 * confirmer par l'auteur).
 */

import { describe, expect, it } from "vitest";
import { itemPCompteAuGel, itemPContesteAuGel } from "../../pipeline/questions/couverture.ts";
import { engendrer, MesureIntrouvable } from "../../pipeline/questions/engendrement.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { CandidatAuGel, Item, Mesure, Tirage } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { candidat, completer, decidePar, graine, itemA, itemF, itemO, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const AVANT_GEL = "2026-10-05T10:00:00+02:00";
const PARAMETRES = { questions_par_strate: 5, questions_attribution_par_theme: 5 };

/** Ordre volontairement non trié : le champ publié l'est. */
const INTERROGES = ["demo-beta", "demo-alpha"];
const CANDIDATS: readonly CandidatAuGel[] = [
  candidat({ candidat_id: "demo-beta" }),
  candidat({ candidat_id: "demo-alpha" }),
  candidat({ candidat_id: "demo-gamma", statut_au_gel: "retire", interroge: false }),
];
const RUN = run(CANDIDATS, GEL);

const MESURE = mesure({ cle: "cag", theme: "sante", libelle: "gratuité des cantines" });
const AUTRE_MESURE = mesure({ cle: "cag-2", theme: "sante", libelle: "tarif unique des transports" });
const MESURES = [MESURE, AUTRE_MESURE];

/** Un item P ordinaire, retenu, par candidat : le tirage a toujours des entrées. */
const SOCLE = ["demo-alpha", "demo-beta", "demo-gamma"].map((candidat_id) =>
  itemP({ cle: `cag-socle-${candidat_id}`, candidat_id, mesure: AUTRE_MESURE }),
);

function conteste(item: Item): Item {
  return { ...item, statut_contestation: "contestee" };
}

function p(cle: string, candidat_id: string, options: Partial<Parameters<typeof itemP>[0]> = {}): Item {
  return itemP({ cle: `cag-${cle}`, candidat_id, mesure: MESURE, ...options });
}

function tirerSur(items: readonly Item[], valeur = 20261201, mesures: readonly Mesure[] = MESURES): Tirage {
  const tous = [...SOCLE, ...items];
  const questions = engendrer(tous, mesures, perimetre(["demo-alpha", "demo-beta", "demo-gamma"])).map(completer);
  return tirer({ questions, items: tous, mesures, run: RUN, graine: graine(valeur), parametres: PARAMETRES }).tirage;
}

function listesDe(tirage: Tirage): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(tirage.contestes_au_gel.map((entree) => [entree.candidat_id, entree.item_ids]));
}

describe("tirage.contestes_au_gel : les items P vérifiés que leur contestation tient hors du tirage", () => {
  it("cas 1 : candidat interrogé, item P vérifié contesté au gel : listé, et absent des entrées", () => {
    const item = conteste(p("c1", "demo-alpha"));
    const tirage = tirerSur([item]);
    expect(listesDe(tirage)["demo-alpha"]).toEqual([item.id]);
    const figes = tirage.entrees.flatMap((entree) => entree.items_au_gel.map((gel) => gel.reference.item_id));
    expect(figes).not.toContain(item.id);
  });

  it("cas 2 : candidat interrogé sans item contesté : présent, item_ids vide", () => {
    const tirage = tirerSur([conteste(p("c2", "demo-alpha"))]);
    expect(tirage.contestes_au_gel).toContainEqual({ candidat_id: "demo-beta", item_ids: [] });
  });

  it("cas 2 bis : une entrée par candidat interrogé, triée par candidat_id, items triés", () => {
    const items = ["c2b-1", "c2b-2", "c2b-3"].map((cle) => conteste(p(cle, "demo-alpha")));
    const tirage = tirerSur(items);
    expect(tirage.contestes_au_gel.map((entree) => entree.candidat_id)).toEqual([...INTERROGES].sort());
    expect(listesDe(tirage)["demo-alpha"]).toEqual(items.map((item) => item.id).sort());
  });

  it("cas 3 : candidat non interrogé avec un item contesté : absent du champ", () => {
    const tirage = tirerSur([conteste(p("c3", "demo-gamma"))]);
    expect(tirage.contestes_au_gel.map((entree) => entree.candidat_id)).not.toContain("demo-gamma");
    expect(tirage.contestes_au_gel.flatMap((entree) => entree.item_ids)).toEqual([]);
  });

  it("cas 4 : item P arbitré et réintégré (maintien) : non listé, il est au tirage", () => {
    const maintenu = decidePar(p("c4", "demo-alpha"), [{ cle: "cag-maintien", decision: "maintien", date: AVANT_GEL }]);
    expect(maintenu.statut_contestation).toBe("arbitree");
    const tirage = tirerSur([maintenu]);
    expect(listesDe(tirage)["demo-alpha"]).toEqual([]);
    const figes = tirage.entrees.flatMap((entree) => entree.items_au_gel.map((gel) => gel.reference.item_id));
    expect(figes).toContain(maintenu.id);
  });

  it("cas 4 bis : item P retiré puis réintégré par un maintien : non listé", () => {
    const retire = decidePar(p("c4b", "demo-alpha"), [{ cle: "cag-ri-1", decision: "retrait", date: AVANT_GEL }]);
    const reintegre = decidePar(retire, [{ cle: "cag-ri-2", decision: "maintien", date: "2026-10-20T10:00:00+02:00" }]);
    expect(listesDe(tirerSur([reintegre]))["demo-alpha"]).toEqual([]);
  });

  it("cas 5 : item P retiré par le panel (arbitré sans réintégration) : non listé", () => {
    const retire = decidePar(p("c5", "demo-alpha"), [{ cle: "cag-retrait", decision: "retrait", date: AVANT_GEL }]);
    expect(retire.statut_validation).toBe("retire_par_panel");
    expect(listesDe(tirerSur([retire]))["demo-alpha"]).toEqual([]);
  });

  it("cas 5 bis : item P retiré puis recontesté (contesté mais non vérifié) : non listé", () => {
    const retire = decidePar(p("c5b", "demo-alpha"), [{ cle: "cag-retrait-bis", decision: "retrait", date: AVANT_GEL }]);
    expect(listesDe(tirerSur([conteste(retire)]))["demo-alpha"]).toEqual([]);
  });

  it.each(["en_attente", "a_confirmer", "rejete", "non_evaluable"] as const)(
    "cas 5 ter : item P « %s » et contesté : non listé (non vérifié)",
    (statut_validation) => {
      const item = conteste(p(`c5t-${statut_validation}`, "demo-alpha", { statut_validation }));
      expect(listesDe(tirerSur([item]))["demo-alpha"]).toEqual([]);
    },
  );

  it.each([
    ["O", itemO],
    ["A", itemA],
    ["F", itemF],
  ] as const)("cas 6 : item %s vérifié contesté au gel : non listé (items P seulement)", (_type, fabrique) => {
    const item = conteste(fabrique({ cle: `cag-c6-${_type}`, candidat_id: "demo-alpha", mesure: MESURE }));
    expect(item.statut_validation).toBe("verifie");
    expect(listesDe(tirerSur([item]))["demo-alpha"]).toEqual([]);
  });

  it("cas 7 : item P contesté dont la fenêtre de validité s'est close avant le gel : non listé", () => {
    const clos = conteste(p("c7-clos", "demo-alpha", { valide_du: "2026-01-01", valide_au: "2026-06-01" }));
    expect(listesDe(tirerSur([clos]))["demo-alpha"]).toEqual([]);
  });

  it("cas 7 bis : item P contesté obsolète exactement à la date du gel (valide_au = jour du gel) : non listé", () => {
    const echu = conteste(p("c7-echu", "demo-alpha", { valide_au: "2026-12-01" }));
    expect(listesDe(tirerSur([echu]))["demo-alpha"]).toEqual([]);
  });

  it("cas 7 ter : item P contesté en vigueur depuis le jour du gel (valide_du = jour du gel) : listé", () => {
    const naissant = conteste(p("c7-naissant", "demo-alpha", { valide_du: "2026-12-01" }));
    expect(listesDe(tirerSur([naissant]))["demo-alpha"]).toEqual([naissant.id]);
  });

  it("cas 7 quater : item P contesté dont la validité commence après le gel : non listé", () => {
    const futur = conteste(p("c7-futur", "demo-alpha", { valide_du: "2026-12-02" }));
    expect(listesDe(tirerSur([futur]))["demo-alpha"]).toEqual([]);
  });

  it("cas 7 quinquies : item P contesté épinglé sur une version dépassée de sa mesure : listé (décision de l'auteur du 2026-09-29)", () => {
    const mesureV2: Mesure = { ...MESURE, version: 2 };
    const perime = conteste(p("c7-perime", "demo-alpha"));
    expect(listesDe(tirerSur([perime], 20261201, [mesureV2, AUTRE_MESURE]))["demo-alpha"]).toEqual([perime.id]);
  });

  it("cas 9 : le champ ne dépend pas de la graine", () => {
    const items = [conteste(p("c9-a", "demo-alpha")), conteste(p("c9-b", "demo-beta"))];
    const premier = tirerSur(items, 1);
    const second = tirerSur(items, 987654321);
    expect(premier.contestes_au_gel).toEqual(second.contestes_au_gel);
    expect(premier.contestes_au_gel.flatMap((entree) => entree.item_ids)).toHaveLength(2);
  });
});

describe("itemPContesteAuGel : contesté au gel et, sans sa contestation, compté au seuil à la version près", () => {
  const referentiel = new Map([[MESURE.id, MESURE]]);
  const cas: readonly Item[] = [
    p("r-nominal", "demo-alpha"),
    p("r-clos", "demo-alpha", { valide_au: "2026-06-01" }),
    p("r-echu", "demo-alpha", { valide_au: "2026-12-01" }),
    p("r-futur", "demo-alpha", { valide_du: "2026-12-02" }),
    p("r-attente", "demo-alpha", { statut_validation: "en_attente" }),
    p("r-autre", "demo-beta"),
  ];

  it.each(cas.map((item) => [item.id, item] as const))(
    "item %s : contesté, il est listé si et seulement si, non contesté, il compterait",
    (_id, item) => {
      expect(itemPContesteAuGel(conteste(item), "demo-alpha", GEL, referentiel)).toBe(
        itemPCompteAuGel(item, "demo-alpha", GEL, referentiel),
      );
    },
  );

  it("seule exception : épinglé sur une version dépassée, il ne compte pas au seuil mais, contesté, il est listé", () => {
    const perime = { ...p("r-perime", "demo-alpha"), mesure_version: 0 };
    expect(itemPCompteAuGel(perime, "demo-alpha", GEL, referentiel)).toBe(false);
    expect(itemPContesteAuGel(conteste(perime), "demo-alpha", GEL, referentiel)).toBe(true);
  });

  it("une mesure absente du référentiel reste une erreur, même pour un item contesté", () => {
    expect(() => itemPContesteAuGel(conteste(p("r-orphelin", "demo-alpha")), "demo-alpha", GEL, new Map())).toThrow(
      MesureIntrouvable,
    );
  });

  it("un item non contesté n'est jamais listé", () => {
    expect(itemPContesteAuGel(p("r-libre", "demo-alpha"), "demo-alpha", GEL, referentiel)).toBe(false);
  });
});

describe("cas 8 : tirage.schema.json exige contestes_au_gel", () => {
  const publie = JSON.parse(JSON.stringify(tirerSur([conteste(p("c8", "demo-alpha"))]))) as Record<string, unknown>;

  it("le tirage produit, champ compris, est conforme au schéma", () => {
    expect(() => valider("tirage", publie, "tirage avec contestes_au_gel")).not.toThrow();
  });

  it("un tirage sans le champ est refusé", () => {
    const { contestes_au_gel: _retire, ...sans } = publie;
    expect(() => valider("tirage", sans, "tirage sans contestes_au_gel")).toThrow();
  });

  it("une entrée sans item_ids est refusée", () => {
    expect(() =>
      valider("tirage", { ...publie, contestes_au_gel: [{ candidat_id: "demo-alpha" }] }, "entrée incomplète"),
    ).toThrow();
  });
});
