/**
 * Validation structurelle de `docs/feuille-de-route.json`.
 *
 * La forme du JSON est un contrat : ce module est la seule frontière où une valeur `unknown`
 * devient une `FeuilleDeRoute`. Un champ absent, mal typé ou une référence qui pointe dans le
 * vide est une erreur explicite — jamais une valeur par défaut, jamais un champ ignoré.
 *
 * Deux passes sur les lots : la première vérifie la forme de chaque lot pris isolément (types,
 * énumérations, identifiants en double) ; la seconde vérifie les références croisées (jalon,
 * dépendances, décisions), une fois que tous les identifiants existants sont connus.
 */

import type {
  Decision,
  Dependance,
  Echelle,
  FeuilleDeRoute,
  Jalon,
  Lot,
  Niveau,
  StatutDecision,
  TypeDependance,
} from "./types.ts";

export class ErreurFeuilleDeRoute extends Error {}

const NIVEAUX: readonly Niveau[] = ["T0", "T1", "T2", "T3", "T4"];
const TYPES_DEPENDANCE: readonly TypeDependance[] = ["bloque", "informe"];
const STATUTS_DECISION: readonly StatutDecision[] = ["en_attente", "tranchee"];

function estRecord(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function exigerRecord(valeur: unknown, etiquette: string): Record<string, unknown> {
  if (!estRecord(valeur)) throw new ErreurFeuilleDeRoute(`${etiquette} : doit être un objet`);
  return valeur;
}

function exigerTableau(objet: Record<string, unknown>, cle: string, etiquette: string): readonly unknown[] {
  const valeur = objet[cle];
  if (!Array.isArray(valeur)) {
    throw new ErreurFeuilleDeRoute(`${etiquette} : champ manquant ou invalide : ${cle}`);
  }
  return valeur;
}

function exigerTexte(objet: Record<string, unknown>, cle: string, etiquette: string): string {
  const valeur = objet[cle];
  if (typeof valeur !== "string") {
    throw new ErreurFeuilleDeRoute(`${etiquette} : champ manquant ou invalide : ${cle}`);
  }
  return valeur;
}

function exigerNombre(objet: Record<string, unknown>, cle: string, etiquette: string): number {
  const valeur = objet[cle];
  if (typeof valeur !== "number") {
    throw new ErreurFeuilleDeRoute(`${etiquette} : champ manquant ou invalide : ${cle}`);
  }
  return valeur;
}

function exigerTableauTexte(objet: Record<string, unknown>, cle: string, etiquette: string): readonly string[] {
  const tableau = exigerTableau(objet, cle, etiquette);
  return tableau.map((element, index) => {
    if (typeof element !== "string") {
      throw new ErreurFeuilleDeRoute(`${etiquette} : l'élément ${index} de ${cle} n'est pas une chaîne`);
    }
    return element;
  });
}

function exigerEnum<T extends string>(
  valeur: string,
  valeursAdmises: readonly T[],
  etiquette: string,
  cle: string,
): T {
  if (!(valeursAdmises as readonly string[]).includes(valeur)) {
    throw new ErreurFeuilleDeRoute(`${etiquette} : ${cle} invalide : ${valeur}`);
  }
  return valeur as T;
}

function validerEchelle(racine: Record<string, unknown>): Echelle {
  const objet = exigerRecord(racine["echelle"], "racine.echelle");
  const resultat: Record<string, string> = {};
  for (const niveau of NIVEAUX) resultat[niveau] = exigerTexte(objet, niveau, "racine.echelle");
  return resultat as Echelle;
}

function validerJalon(brut: unknown, index: number): Jalon {
  const objet = exigerRecord(brut, `Jalon #${index + 1}`);
  const id = exigerTexte(objet, "id", `Jalon #${index + 1}`);
  const etiquette = `Jalon ${id}`;
  return {
    id,
    date: exigerTexte(objet, "date", etiquette),
    titre: exigerTexte(objet, "titre", etiquette),
    critere: exigerTexte(objet, "critere", etiquette),
  };
}

function validerJalons(racine: Record<string, unknown>): readonly Jalon[] {
  return exigerTableau(racine, "jalons", "racine").map((brut, index) => validerJalon(brut, index));
}

function validerDecision(brut: unknown, index: number): Decision {
  const objet = exigerRecord(brut, `Décision #${index + 1}`);
  const id = exigerTexte(objet, "id", `Décision #${index + 1}`);
  const etiquette = `Décision ${id}`;
  const statut = exigerEnum(exigerTexte(objet, "statut", etiquette), STATUTS_DECISION, etiquette, "statut");
  const commune = {
    id,
    question: exigerTexte(objet, "question", etiquette),
    contexte: exigerTexte(objet, "contexte", etiquette),
    options: exigerTableauTexte(objet, "options", etiquette),
    recommandation: exigerTexte(objet, "recommandation", etiquette),
  };
  if (statut === "en_attente") return { ...commune, statut };
  return {
    ...commune,
    statut,
    retenu: exigerTexte(objet, "retenu", etiquette),
    date_decision: exigerTexte(objet, "date_decision", etiquette),
  };
}

function validerDecisions(racine: Record<string, unknown>): readonly Decision[] {
  return exigerTableau(racine, "decisions", "racine").map((brut, index) => validerDecision(brut, index));
}

function validerDependance(brut: unknown, etiquetteLot: string, index: number): Dependance {
  const etiquette = `${etiquetteLot}.depend_de[${index}]`;
  const objet = exigerRecord(brut, etiquette);
  const lot = exigerTexte(objet, "lot", etiquette);
  const type = exigerEnum(exigerTexte(objet, "type", etiquette), TYPES_DEPENDANCE, etiquette, "type");
  return { lot, type };
}

function validerNote(objet: Record<string, unknown>, etiquette: string): string | undefined {
  const valeur = objet["note"];
  if (valeur === undefined) return undefined;
  if (typeof valeur !== "string") {
    throw new ErreurFeuilleDeRoute(`${etiquette} : champ manquant ou invalide : note`);
  }
  return valeur;
}

function validerLotStructurel(brut: unknown, index: number, idsVus: Set<string>): Lot {
  const objet = exigerRecord(brut, `Lot #${index + 1}`);
  const id = exigerTexte(objet, "id", `Lot #${index + 1}`);
  const etiquette = `Lot ${id}`;
  if (idsVus.has(id)) throw new ErreurFeuilleDeRoute(`${etiquette} : identifiant utilisé par un autre lot`);
  idsVus.add(id);

  const niveau = exigerEnum(exigerTexte(objet, "niveau", etiquette), NIVEAUX, etiquette, "niveau");
  const depend_de = exigerTableau(objet, "depend_de", etiquette).map((brutDependance, indexDependance) =>
    validerDependance(brutDependance, etiquette, indexDependance),
  );
  const base = {
    id,
    titre: exigerTexte(objet, "titre", etiquette),
    jalon: exigerTexte(objet, "jalon", etiquette),
    niveau,
    agent: exigerTexte(objet, "agent", etiquette),
    taille: exigerTexte(objet, "taille", etiquette),
    temps_auteur_h: exigerNombre(objet, "temps_auteur_h", etiquette),
    depend_de,
    decisions: exigerTableauTexte(objet, "decisions", etiquette),
  };
  const note = validerNote(objet, etiquette);
  return note === undefined ? base : { ...base, note };
}

function validerReferencesLot(
  lot: Lot,
  idsJalons: ReadonlySet<string>,
  idsDecisions: ReadonlySet<string>,
  idsLots: ReadonlySet<string>,
): void {
  const etiquette = `Lot ${lot.id}`;
  if (!idsJalons.has(lot.jalon)) throw new ErreurFeuilleDeRoute(`${etiquette} : jalon inconnu : ${lot.jalon}`);
  for (const dependance of lot.depend_de) {
    if (!idsLots.has(dependance.lot)) {
      throw new ErreurFeuilleDeRoute(`${etiquette} : dépendance vers un lot inconnu : ${dependance.lot}`);
    }
  }
  for (const decisionId of lot.decisions) {
    if (!idsDecisions.has(decisionId)) {
      throw new ErreurFeuilleDeRoute(`${etiquette} : décision inconnue : ${decisionId}`);
    }
  }
}

function validerLots(
  racine: Record<string, unknown>,
  idsJalons: ReadonlySet<string>,
  idsDecisions: ReadonlySet<string>,
): readonly Lot[] {
  const idsVus = new Set<string>();
  const lots = exigerTableau(racine, "lots", "racine").map((brut, index) =>
    validerLotStructurel(brut, index, idsVus),
  );
  const idsLots = new Set(lots.map((lot) => lot.id));
  for (const lot of lots) validerReferencesLot(lot, idsJalons, idsDecisions, idsLots);
  return lots;
}

export function validerFeuilleDeRoute(donnees: unknown): FeuilleDeRoute {
  const racine = exigerRecord(donnees, "racine");
  const date_maj = exigerTexte(racine, "date_maj", "racine");
  const echelle = validerEchelle(racine);
  const jalons = validerJalons(racine);
  const decisions = validerDecisions(racine);
  const idsJalons = new Set(jalons.map((jalon) => jalon.id));
  const idsDecisions = new Set(decisions.map((decision) => decision.id));
  const lots = validerLots(racine, idsJalons, idsDecisions);
  const anomalies = exigerTableauTexte(racine, "anomalies", "racine");
  return { date_maj, echelle, jalons, decisions, lots, anomalies };
}
