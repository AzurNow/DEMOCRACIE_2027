/**
 * Le registre des corrections de thème sur disque : `validation/mesures/decisions.json`.
 *
 * Deux propriétés, sur le modèle du journal des annotateurs :
 *
 * 1. **Ajout seul.** Ce module n'expose aucune fonction de modification ni de suppression. Une
 *    décision écrite reste au registre ; un revirement de l'auteur est une entrée de plus, et
 *    c'est la plus récente qui fait foi (`domaine/corrections-mesure.ts`). Le registre est
 *    publié : l'historique des arbitrages de thème en fait partie.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un fichier illisible ou une entrée
 *    malformée arrêtent la commande. Ignorer une ligne fautive ferait disparaître un arbitrage
 *    sans que personne ne le sache, et un item serait promu ou retenu sans raison traçable.
 *
 * Chaque entrée est confrontée à `decision-mesure.schema.json`, à la lecture comme avant
 * l'écriture, puis à `validerEntreeRegistre`, qui en construit la valeur typée.
 *
 * Un fichier **absent** est en revanche un registre vide, et non une erreur : aucune décision
 * n'a encore été prise. C'est une absence, pas une donnée manquante.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import {
  validerEntreeRegistre,
  type DecisionCorrectionMesure,
  type RegistreCorrectionsMesure,
} from "../domaine/corrections-mesure.ts";

export const NOM_FICHIER_REGISTRE = "decisions.json";

export function cheminRegistre(repertoire: string): string {
  return join(repertoire, NOM_FICHIER_REGISTRE);
}

export class RegistreIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(
      `Registre des corrections de mesure illisible : ${chemin}\n${detail}\n` +
        `Rien n'est réparé automatiquement : ce fichier est la trace publiée des arbitrages de ` +
        `thème, et une entrée perdue serait un item promu ou retenu sans raison connue.`,
    );
    this.name = "RegistreIllisible";
  }
}

export function lireRegistre(repertoire: string): RegistreCorrectionsMesure {
  const chemin = cheminRegistre(repertoire);
  if (!existsSync(chemin)) return [];
  const brut = analyser(readFileSync(chemin, "utf8"), chemin);
  return brut.map((valeur, index) => validerEntree(valeur, `${chemin}, entrée ${index + 1}`));
}

function validerEntree(valeur: unknown, provenance: string): DecisionCorrectionMesure {
  return validerEntreeRegistre(valider("decision-mesure", valeur, provenance), provenance);
}

function analyser(contenu: string, chemin: string): readonly unknown[] {
  const valeur = tenterJson(contenu, chemin);
  if (!Array.isArray(valeur)) throw new RegistreIllisible(chemin, "Le registre est un tableau JSON.");
  return valeur;
}

function tenterJson(contenu: string, chemin: string): unknown {
  try {
    return JSON.parse(contenu);
  } catch (erreur) {
    throw new RegistreIllisible(chemin, erreur instanceof Error ? erreur.message : String(erreur));
  }
}

/**
 * Ajoute une décision en fin de registre. Les entrées antérieures sont relues, validées et
 * réécrites telles quelles, dans leur ordre : la réécriture du fichier n'est qu'un ajout.
 */
export function ajouterAuRegistre(
  repertoire: string,
  entree: DecisionCorrectionMesure,
): RegistreCorrectionsMesure {
  const validee = validerEntree(entree, `décision à enregistrer dans ${cheminRegistre(repertoire)}`);
  const registre = [...lireRegistre(repertoire), validee];
  mkdirSync(repertoire, { recursive: true });
  writeFileSync(cheminRegistre(repertoire), `${JSON.stringify(registre, null, 2)}\n`, "utf8");
  return registre;
}
