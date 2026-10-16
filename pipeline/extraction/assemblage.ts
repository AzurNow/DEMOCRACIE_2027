/**
 * Assemblage d'un item de staging et de sa mesure proposée, depuis l'item retenu d'une paire.
 *
 * Champs venus du modèle retenu (D52 (3)), recopiés sans retouche : type, position, citation,
 * paraphrase, quantification, libellé et thème proposés. Champs remplis par le code seul :
 *
 * - identifiants : un générateur d'ULID passé en port (`validation/domaine/ulid.ts` en production) ;
 * - `empreinte` : `validation/domaine/empreinte.ts:empreinteContenuNotant` ;
 * - `valide_du` : la date de la source de la citation, règle de `validation/domaine/dates-sources.ts`
 *   pour un item P (§4, « date de la source ») ; `valide_au` à `null` ;
 * - `statut_validation` : `en_attente`, ou `a_confirmer` pour une source T3 (§4 : « un item T3 est
 *   conservé avec le statut "à confirmer" »), lu dans une table par tier ;
 * - `source` : le bloc assemblé reçu en entrée, plus la page et l'extrait calculés de la citation ;
 * - `historique` : une entrée de création datée par l'horloge passée en port, avec le commit du code
 *   et, en motif, la version du prompt et les modèles — l'item n'a pas d'autre champ pour eux.
 *
 * **Mesure proposée** : une mesure de staging nouvelle par item, version 1, au libellé et au thème
 * proposés. Le prompt ne demande pas de `formulation_canonique`, que `mesure.schema.json` exige :
 * elle reçoit ici le libellé proposé, tel quel, isolé dans `formulationProposee` (décision D53 (1)).
 * La formulation canonique est le texte substitué dans les gabarits des questions (§5) : la
 * promotion d'un item extrait reste bloquée tant que l'interface de validation ne sait pas
 * rattacher l'item à une mesure ni relire cette formulation (PR séparée, D53 (1)).
 */

import { empreinteContenuNotant, empreinteDe } from "../../validation/domaine/empreinte.ts";
import type { EtatPositionnel, Item, Mesure, Source } from "../../validation/domaine/types.ts";
import type { Candidat } from "./appariement.ts";
import type { AccordDePaire } from "./comparaison.ts";
import type { ConfigurationExtraction } from "./configuration.ts";
import type { Localisation } from "./localisation.ts";
import type { MesureProposee } from "./types.ts";

export interface EntreeHistorique {
  readonly date: string;
  readonly changement: string;
  readonly motif: string;
  readonly commit: string;
  readonly version_resultante: number;
}

export interface MesureStaging extends Mesure {
  readonly historique: readonly EntreeHistorique[];
}

export interface Depot {
  readonly item: Item;
  readonly mesure: MesureStaging;
}

export interface ContexteDepot {
  readonly configuration: ConfigurationExtraction;
  readonly candidat_id: string;
  readonly source: Source;
  readonly instant: string;
  readonly commit: string;
  readonly nouvelUlid: () => string;
}

const CHANGEMENT_CREATION = "création par extraction double";

/** §4 : un item T3 « n'engendre aucune question » et reste « à confirmer » ; T1 et T2 attendent la validation. */
const STATUT_INITIAL: Readonly<Record<Source["tier"], "en_attente" | "a_confirmer">> = {
  T1: "en_attente",
  T2: "en_attente",
  T3: "a_confirmer",
};

/** Décision D53 (1) : la formulation canonique d'une mesure de staging extraite est son libellé proposé. */
function formulationProposee(proposee: MesureProposee): string {
  return proposee.libelle;
}

function historique(contexte: ContexteDepot, accord: AccordDePaire): readonly EntreeHistorique[] {
  const [premier, second] = contexte.configuration.modeles;
  return [
    {
      date: contexte.instant,
      changement: CHANGEMENT_CREATION,
      motif: `${contexte.configuration.version_prompt}, modèles ${premier} puis ${second}, ${accord.accord}`,
      commit: contexte.commit,
      version_resultante: 1,
    },
  ];
}

function mesureDe(proposee: MesureProposee, contexte: ContexteDepot, accord: AccordDePaire): MesureStaging {
  const contenu = {
    libelle: proposee.libelle,
    theme: proposee.theme,
    formulation_canonique: formulationProposee(proposee),
    fictive: false,
  };
  return {
    id: contexte.nouvelUlid(),
    version: 1,
    // mesure.schema.json : « sha256 de la forme canonique de {libelle, theme, formulation_canonique, fictive} ».
    empreinte: empreinteDe(contenu),
    ...contenu,
    historique: historique(contexte, accord),
  };
}

function sourceLocalisee(source: Source, localisation: Localisation): Source {
  return {
    ...source,
    ...(localisation.page === null ? {} : { page: localisation.page }),
    ...(localisation.extrait === null ? {} : { extrait: localisation.extrait }),
  };
}

function assertionDe(retenu: Candidat, localisation: Localisation, accord: AccordDePaire, contexte: ContexteDepot): EtatPositionnel {
  const propose = retenu.item;
  return {
    position: propose.position,
    paraphrase: propose.paraphrase,
    citation_verbatim: propose.citation_verbatim,
    ...(propose.quantification === undefined ? {} : { quantification: propose.quantification }),
    source: sourceLocalisee(contexte.source, localisation),
    test_verbatim: {
      passe: true,
      date: contexte.instant,
      version_normalisation: localisation.version_normalisation,
      offset_debut: localisation.offset_debut,
      offset_fin: localisation.offset_fin,
    },
    extraction: { modeles: [...contexte.configuration.modeles], ...accord },
  };
}

export function deposer(retenu: Candidat, localisation: Localisation, accord: AccordDePaire, contexte: ContexteDepot): Depot {
  const mesure = mesureDe(retenu.item.mesure_proposee, contexte, accord);
  const item: Item = {
    id: contexte.nouvelUlid(),
    version: 1,
    empreinte: "",
    type: retenu.item.type,
    candidat_id: contexte.candidat_id,
    mesure_id: mesure.id,
    mesure_version: mesure.version,
    statut_validation: STATUT_INITIAL[contexte.source.tier],
    statut_contestation: "aucune",
    valide_du: contexte.source.date_source,
    valide_au: null,
    assertion: assertionDe(retenu, localisation, accord, contexte),
    validations: [],
    contestations: [],
    historique: historique(contexte, accord),
  };
  return { item: { ...item, empreinte: empreinteContenuNotant(item) }, mesure };
}
