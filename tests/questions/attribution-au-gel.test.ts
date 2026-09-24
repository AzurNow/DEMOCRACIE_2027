/**
 * Constat 2 de la conformité du 2026-09-24 (protocole 0.6, §5 et annexe B) : la liste attendue
 * d'une question d'attribution est « la liste exacte des candidats du périmètre dont la position en
 * vigueur à la date du run est « pour » », et la question « n'est pas tirée lorsque, à la date du
 * gel, la position en vigueur d'un candidat du périmètre sur la mesure est conditionnelle ou sans
 * objet ».
 *
 * La position en vigueur se lit par les deux règles de date existantes, jamais recopiées :
 * `estEnVigueur` (fenêtre de validité semi-ouverte) et `etatEnVigueur` (état d'un item O). Les
 * questions sont engendrées par le vrai code (`engendrer`) : c'est lui qui décide quels items la
 * question porte.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import {
  listeAttendueDefinie,
  PositionsContradictoires,
  ReponseAttendueIndecidable,
  reponseAttendue,
} from "../../pipeline/questions/reponse-attendue.ts";
import { questionsTirables, tirer } from "../../pipeline/questions/tirage.ts";
import type { Item, Position, QuestionEngendree } from "../../pipeline/questions/types.ts";
import { candidat, completer, graine, itemF, itemO, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDATS = ["demo-alpha", "demo-beta", "demo-gamma"];
const PERIMETRE = perimetre(CANDIDATS);
const MESURE = mesure({ cle: "att-gel", libelle: "tarif social de l'eau" });
const MESURE_FICTIVE = mesure({ cle: "att-gel-fictive", libelle: "prime aux marcheurs", fictive: true });

/** La Q-ATT dont l'item principal est `principal`, engendrée avec tous les items du jeu. */
function attributionSur(principal: Item, items: readonly Item[]): QuestionEngendree {
  const trouvee = engendrer(items, [MESURE, MESURE_FICTIVE], PERIMETRE).find(
    (question) => question.gabarit === "Q-ATT" && question.grappe_id === principal.id,
  );
  if (trouvee === undefined) throw new Error(`Aucune Q-ATT engendrée sur l'item ${principal.id}.`);
  return trouvee;
}

function listeAttendue(principal: Item, items: readonly Item[]): readonly string[] | undefined {
  return reponseAttendue(attributionSur(principal, items), items, GEL).candidats_attendus;
}

function p(candidat_id: string, position: Position, cle = `${candidat_id}-${position}`): Item {
  return itemP({ cle: `att-gel-${cle}`, candidat_id, mesure: MESURE, position });
}

function o(candidat_id: string, avant: Position, apres: Position, date_changement: string): Item {
  return itemO({
    cle: `att-gel-${candidat_id}-${avant}-${apres}-${date_changement}`,
    candidat_id,
    mesure: MESURE,
    position: avant,
    position_posterieure: apres,
    date_changement,
  });
}

describe("liste attendue d'une Q-ATT, résolue au gel", () => {
  it("cas 1 : alpha P « contre », beta P « pour », gamma O passé de « contre » à « pour » avant le gel → [beta, gamma]", () => {
    const alpha = p("demo-alpha", "contre");
    const beta = p("demo-beta", "pour");
    const gamma = o("demo-gamma", "contre", "pour", "2026-10-01");
    const items = [alpha, beta, gamma];
    const attendue = reponseAttendue(attributionSur(alpha, items), items, GEL);
    expect(attendue.nature).toBe("liste_candidats");
    expect(attendue.candidats_attendus).toEqual(["demo-beta", "demo-gamma"]);
  });

  it("cas 1 bis : la liste est la même quel que soit l'item principal de la mesure", () => {
    const alpha = p("demo-alpha", "contre");
    const beta = p("demo-beta", "pour");
    const gamma = o("demo-gamma", "contre", "pour", "2026-10-01");
    const items = [alpha, beta, gamma];
    expect(listeAttendue(beta, items)).toEqual(["demo-beta", "demo-gamma"]);
  });

  it("cas 2 : un item O passé de « pour » à « contre » avant le gel est absent", () => {
    const beta = p("demo-beta", "pour");
    const gamma = o("demo-gamma", "pour", "contre", "2026-10-01");
    expect(listeAttendue(beta, [beta, gamma])).toEqual(["demo-beta"]);
  });

  it("cas 2 : un changement daté exactement du gel fait déjà foi (règle semi-ouverte) : absent", () => {
    const beta = p("demo-beta", "pour");
    const gamma = o("demo-gamma", "pour", "contre", "2026-12-01");
    expect(listeAttendue(beta, [beta, gamma])).toEqual(["demo-beta"]);
  });

  it("cas 2 : un changement daté après le gel laisse compter l'ancien état « pour » : présent", () => {
    const beta = p("demo-beta", "pour");
    const gamma = o("demo-gamma", "pour", "contre", "2026-12-15");
    expect(listeAttendue(beta, [beta, gamma])).toEqual(["demo-beta", "demo-gamma"]);
  });

  it("cas 2 : un passage à « pour » daté après le gel laisse compter l'ancien état « contre » : absent", () => {
    const beta = p("demo-beta", "pour");
    const gamma = o("demo-gamma", "contre", "pour", "2026-12-15");
    expect(listeAttendue(beta, [beta, gamma])).toEqual(["demo-beta"]);
  });

  it("cas 3 : un item P « pour » dont valide_au précède le gel est absent", () => {
    const beta = p("demo-beta", "pour");
    const perime = itemP({
      cle: "att-gel-perime",
      candidat_id: "demo-gamma",
      mesure: MESURE,
      position: "pour",
      valide_au: "2026-11-15",
    });
    expect(listeAttendue(beta, [beta, perime])).toEqual(["demo-beta"]);
  });

  it("cas 3 : un item P « pour » dont valide_au tombe exactement sur le gel est absent (déjà obsolète)", () => {
    const beta = p("demo-beta", "pour");
    const perime = itemP({
      cle: "att-gel-perime-gel",
      candidat_id: "demo-gamma",
      mesure: MESURE,
      position: "pour",
      valide_au: "2026-12-01",
    });
    expect(listeAttendue(beta, [beta, perime])).toEqual(["demo-beta"]);
  });

  it("cas 3 : un item P « pour » dont valide_du suit le gel est absent", () => {
    const beta = p("demo-beta", "pour");
    const futur = itemP({
      cle: "att-gel-futur",
      candidat_id: "demo-gamma",
      mesure: MESURE,
      position: "pour",
      valide_du: "2026-12-15",
    });
    expect(listeAttendue(beta, [beta, futur])).toEqual(["demo-beta"]);
  });

  it("cas 3 : un item hors validité ne rend pas la liste indéfinie, même conditionnel", () => {
    const beta = p("demo-beta", "pour");
    const perime = itemP({
      cle: "att-gel-perime-cond",
      candidat_id: "demo-gamma",
      mesure: MESURE,
      position: "conditionnel",
      valide_au: "2026-11-15",
    });
    expect(listeAttendue(beta, [beta, perime])).toEqual(["demo-beta"]);
  });

  it("cas 5 : aucun candidat « pour » (tous « contre ») → liste_candidats vide, question tirable", () => {
    const alpha = p("demo-alpha", "contre");
    const beta = p("demo-beta", "contre");
    const items = [alpha, beta];
    const question = attributionSur(alpha, items);
    const parId = new Map(items.map((item) => [item.id, item]));
    expect(listeAttendueDefinie(question, parId, GEL)).toBe(true);
    const attendue = reponseAttendue(question, items, GEL);
    expect(attendue.nature).toBe("liste_candidats");
    expect(attendue.candidats_attendus).toEqual([]);
  });

  it("cas 6 : item F → « aucun », inchangé", () => {
    const fictif = itemF({ cle: "att-gel-f", candidat_id: "demo-alpha", mesure: MESURE_FICTIVE });
    const attendue = reponseAttendue(attributionSur(fictif, [fictif]), [fictif], GEL);
    expect(attendue.nature).toBe("aucun_candidat");
    expect(attendue.candidats_attendus).toEqual([]);
  });

  it("un même candidat porté « pour » par deux items garde une seule place dans la liste", () => {
    const beta = p("demo-beta", "pour");
    const betaBis = p("demo-beta", "pour", "demo-beta-pour-bis");
    expect(listeAttendue(beta, [beta, betaBis])).toEqual(["demo-beta"]);
  });

  it("refuse, sans choisir, un candidat qui porte au gel « pour » et « contre » sur la mesure", () => {
    const beta = p("demo-beta", "pour");
    const gamma = p("demo-gamma", "pour");
    const gammaContre = o("demo-gamma", "pour", "contre", "2026-10-01");
    const items = [beta, gamma, gammaContre];
    expect(() => reponseAttendue(attributionSur(beta, items), items, GEL)).toThrow(PositionsContradictoires);
  });
});

describe("cas 4 : Q-ATT non tirable quand un candidat est « conditionnel » ou « sans_objet » au gel", () => {
  const JEUX: readonly { readonly nom: string; readonly construire: () => readonly Item[] }[] = [
    { nom: "item P conditionnel", construire: () => [p("demo-alpha", "pour"), p("demo-beta", "conditionnel")] },
    { nom: "item P sans_objet", construire: () => [p("demo-alpha", "pour"), p("demo-beta", "sans_objet")] },
    {
      nom: "item O dont l'état en vigueur est conditionnel",
      construire: () => [p("demo-alpha", "pour"), o("demo-beta", "pour", "conditionnel", "2026-10-01")],
    },
    {
      nom: "item O dont l'état en vigueur est sans_objet",
      construire: () => [p("demo-alpha", "pour"), o("demo-beta", "sans_objet", "pour", "2026-12-15")],
    },
  ];

  it.each(JEUX)("$nom : la liste n'est pas définie, et la réponse attendue refuse (filet)", ({ construire }) => {
    const items = construire();
    const principal = items[0] as Item;
    const question = attributionSur(principal, items);
    const parId = new Map(items.map((item) => [item.id, item]));
    expect(listeAttendueDefinie(question, parId, GEL)).toBe(false);
    expect(() => reponseAttendue(question, items, GEL)).toThrow(ReponseAttendueIndecidable);
  });

  it("un état conditionnel qui n'est PAS en vigueur au gel ne rend pas la question non tirable", () => {
    const items = [p("demo-alpha", "pour"), o("demo-beta", "conditionnel", "pour", "2026-10-01")];
    const question = attributionSur(items[0] as Item, items);
    const parId = new Map(items.map((item) => [item.id, item]));
    expect(listeAttendueDefinie(question, parId, GEL)).toBe(true);
    expect(reponseAttendue(question, items, GEL).candidats_attendus).toEqual(["demo-alpha", "demo-beta"]);
  });

  /**
   * Décidé avant le tirage : pour chaque graine, la Q-ATT est absente du tirage et `tirer` ne lève
   * rien ; pour une graine donnée, deux tirages sont identiques octet pour octet.
   */
  describe.each(["conditionnel", "sans_objet"] as const)("position « %s » au gel", (position) => {
    const alpha = p("demo-alpha", "pour");
    const beta = p("demo-beta", position);
    const autreMesure = mesure({ cle: "att-gel-autre", theme: "fiscalite_pouvoir_achat" });
    const libre = itemP({ cle: `att-gel-libre-${position}`, candidat_id: "demo-alpha", mesure: autreMesure });
    const items = [alpha, beta, libre];
    // Les seules Q-ATT : une Q-FER sur « sans_objet » échouerait après le tirage (constat 36 de la
    // conformité du 2026-09-24, hors de ce lot), ce qui n'est pas le sujet ici.
    const questions = engendrer(items, [MESURE, autreMesure], PERIMETRE)
      .map(completer)
      .filter((question) => question.gabarit === "Q-ATT");
    const bloquees = questions.filter((question) => question.grappe_id !== libre.id);
    const admise = questions.find((question) => question.grappe_id === libre.id);
    const RUN = run(
      CANDIDATS.slice(0, 2).map((candidat_id) => candidat({ candidat_id })),
      GEL,
    );

    const tirerAvec = (valeur: number) =>
      tirer({
        questions,
        items,
        mesures: [MESURE, autreMesure],
        run: RUN,
        graine: graine(valeur),
        parametres: { questions_par_strate: 10 },
      });

    it("la règle de tirabilité écarte les Q-ATT de la mesure, et elles seules", () => {
      expect(bloquees).toHaveLength(2);
      const tirables = questionsTirables(questions, items, GEL).map((question) => question.id);
      expect(tirables).toEqual([admise?.id]);
    });

    it("aucune graine ne tire ces Q-ATT, et aucune ne fait échouer le tirage", () => {
      for (const valeur of [1, 2, 3, 20261201, 20270101]) {
        const ids = tirerAvec(valeur).tirage.entrees.map((entree) => entree.question_id);
        for (const question of bloquees) expect(ids).not.toContain(question.id);
        expect(ids).toEqual([admise?.id]);
      }
    });

    it("le tirage reste reproductible pour une graine donnée", () => {
      expect(JSON.stringify(tirerAvec(20261201))).toBe(JSON.stringify(tirerAvec(20261201)));
    });
  });
});
