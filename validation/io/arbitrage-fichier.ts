/**
 * Le registre des décisions d'arbitrage sur disque : `validation/arbitrage/decisions.json`.
 *
 * Sur le modèle de `mesures-fichier.ts` :
 *
 * 1. **Ajout seul.** Aucune fonction de modification ni de suppression. Un revirement de l'arbitre
 *    est une entrée de plus ; la dernière qui vise un item fait foi (`domaine/arbitrage.ts`).
 * 2. **Une corruption bloque.** Un fichier illisible ou une entrée non conforme à
 *    `decision-arbitrage.schema.json` arrête la commande : une décision perdue serait un item promu
 *    ou retenu sans raison traçable.
 *
 * Un fichier absent est un registre vide. `validation/arbitrage/file.json`, à côté, n'est qu'un
 * rapport dérivé et non versionné : aucune décision ne s'y inscrit.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import type { DecisionArbitrage, RegistreArbitrage } from "../domaine/arbitrage.ts";

export function cheminRegistreArbitrage(repertoire: string): string {
  return join(repertoire, "decisions.json");
}

export class RegistreArbitrageIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(`Registre des décisions d'arbitrage illisible : ${chemin}\n${detail}\nRien n'est réparé automatiquement.`);
    this.name = "RegistreArbitrageIllisible";
  }
}

function analyser(chemin: string): readonly unknown[] {
  let valeur: unknown;
  try {
    valeur = JSON.parse(readFileSync(chemin, "utf8"));
  } catch (erreur) {
    throw new RegistreArbitrageIllisible(chemin, erreur instanceof Error ? erreur.message : String(erreur));
  }
  if (!Array.isArray(valeur)) throw new RegistreArbitrageIllisible(chemin, "Le registre est un tableau JSON.");
  return valeur;
}

export function lireRegistreArbitrage(repertoire: string): RegistreArbitrage {
  const chemin = cheminRegistreArbitrage(repertoire);
  if (!existsSync(chemin)) return [];
  return analyser(chemin).map((entree, rang) =>
    valider<DecisionArbitrage>("decision-arbitrage", entree, `${chemin}, entrée ${rang + 1}`),
  );
}

/** Ajoute une décision en fin de registre ; les entrées antérieures sont réécrites telles quelles. */
export function ajouterDecisionArbitrage(repertoire: string, decision: DecisionArbitrage): RegistreArbitrage {
  const chemin = cheminRegistreArbitrage(repertoire);
  const validee = valider<DecisionArbitrage>("decision-arbitrage", decision, `décision à ajouter à ${chemin}`);
  const registre = lireRegistreArbitrage(repertoire);
  if (registre.some((entree) => entree.id === validee.id)) {
    throw new RegistreArbitrageIllisible(chemin, `Identifiant déjà présent : ${validee.id}`);
  }
  const suite = [...registre, validee];
  mkdirSync(repertoire, { recursive: true });
  writeFileSync(chemin, `${JSON.stringify(suite, null, 2)}\n`, "utf8");
  return suite;
}
