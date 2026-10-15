/**
 * Les jeux des tests du gel, chacun le plus petit qui produise son issue sur la vraie chaîne
 * (périmètre, engendrement, formulations relues, tirage, barrière) :
 *
 * - `jeuNominal` : un candidat sous le seuil de couverture, deux items P, un item F, et un item P
 *   dont `valide_au` tombe exactement sur `date_gel` (cas 5) ; symétrie verte ;
 * - `jeuRouge` : le nominal plus une mesure dont la formulation canonique nomme le candidat ; la
 *   question d'attribution la cite, la barrière la refuse (`aucun_nom_candidat_dans_q_att`) ;
 * - `jeuEcartTolere` : deux candidats comparés, dont l'un n'a aucun item sur un thème que l'autre
 *   couvre ; la strate vide est compensée, l'écart par thème est imposé par les items
 *   (`repartition_themes` à `ecart_tolere`).
 */

import type { Item, Mesure, Theme } from "../../pipeline/questions/types.ts";
import {
  ALPHA,
  BETA,
  GEL,
  itemADeData,
  itemFDeData,
  itemPDeData,
  mesureDeData,
  mesureFictive,
} from "./fixtures.ts";
import type { Jeu } from "./fixtures.ts";

export const MESURE_FISC_1 = mesureDeData("gel-fisc-1", "fiscalite_pouvoir_achat");
const MESURE_FISC_2 = mesureDeData("gel-fisc-2", "fiscalite_pouvoir_achat");
// Un thème à part : ses questions ont leurs propres strates, tirées quelle que soit la graine.
const MESURE_FICTIVE = mesureFictive("gel-fictive", "education");
const MESURE_FIN = mesureDeData("gel-fin-de-validite", "retraites");

export const ITEM_P1 = itemPDeData({ cle: "gel-p1", candidat_id: ALPHA.candidat_id, mesure: MESURE_FISC_1 });
/** Cas 5 : `valide_au` au 1er décembre, lu à minuit UTC, soit l'instant exact du gel. */
export const ITEM_FIN_AU_GEL = itemPDeData({
  cle: "gel-fin",
  candidat_id: ALPHA.candidat_id,
  mesure: MESURE_FIN,
  valide_au: "2026-12-01",
});

export function jeuNominal(date_gel = GEL): Jeu {
  return {
    date_gel,
    candidats: [ALPHA],
    items: [
      ITEM_P1,
      itemPDeData({ cle: "gel-p2", candidat_id: ALPHA.candidat_id, mesure: MESURE_FISC_2, position: "contre" }),
      itemFDeData({ cle: "gel-f", candidat_id: ALPHA.candidat_id, mesure: MESURE_FICTIVE }),
      ITEM_FIN_AU_GEL,
    ],
    mesures: [MESURE_FISC_1, MESURE_FISC_2, MESURE_FICTIVE, MESURE_FIN],
  };
}

/** Une mesure dont la formulation canonique porte le nom du candidat : sa Q-ATT le cite. */
export function jeuRouge(): Jeu {
  const nominal = jeuNominal();
  const nommee = mesureDeData("gel-nommee", "sante", `la réforme ${ALPHA.nom} des hôpitaux`);
  return {
    ...nominal,
    items: [...nominal.items, itemPDeData({ cle: "gel-nommee", candidat_id: ALPHA.candidat_id, mesure: nommee })],
    mesures: [...nominal.mesures, nommee],
  };
}

function mesures(prefixe: string, theme: Theme): readonly Mesure[] {
  return Array.from({ length: 5 }, (_, rang) => mesureDeData(`${prefixe}-${rang}`, theme));
}

function itemsP(candidat_id: string, liste: readonly Mesure[]): readonly Item[] {
  return liste.map((une) => itemPDeData({ cle: `${candidat_id}:${une.id}`, candidat_id, mesure: une }));
}

/**
 * Alpha : cinq items P en fiscalité, cinq en retraites ; beta : dix en fiscalité, aucun en
 * retraites. Chacun deux items F (éducation, immigration) et un item A (santé), pour que la part
 * des items A et F reste au-dessus du seuil du §5.
 */
export function jeuEcartTolere(): Jeu {
  const fiscalite = mesures("gel-ecart-fisc", "fiscalite_pouvoir_achat");
  const retraites = mesures("gel-ecart-retr", "retraites");
  const fiscaliteBeta = mesures("gel-ecart-fiscb", "fiscalite_pouvoir_achat");
  const fictives = {
    alpha: [mesureFictive("gel-ecart-fa", "education"), mesureFictive("gel-ecart-fa2", "immigration")],
    beta: [mesureFictive("gel-ecart-fb", "education"), mesureFictive("gel-ecart-fb2", "immigration")],
  };
  const sante = mesureDeData("gel-ecart-sante", "sante");
  const autres = (candidat_id: string, liste: readonly Mesure[]): readonly Item[] => [
    ...liste.map((une) => itemFDeData({ cle: `${candidat_id}:f:${une.id}`, candidat_id, mesure: une })),
    itemADeData({ cle: `${candidat_id}:a`, candidat_id, mesure: sante }),
  ];
  return {
    date_gel: GEL,
    candidats: [ALPHA, BETA],
    items: [
      ...itemsP(ALPHA.candidat_id, [...fiscalite, ...retraites]),
      ...itemsP(BETA.candidat_id, [...fiscalite, ...fiscaliteBeta]),
      ...autres(ALPHA.candidat_id, fictives.alpha),
      ...autres(BETA.candidat_id, fictives.beta),
    ],
    mesures: [...fiscalite, ...retraites, ...fiscaliteBeta, ...fictives.alpha, ...fictives.beta, sante],
  };
}
