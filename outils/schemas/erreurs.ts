import type { ErrorObject } from "ajv";

/**
 * ajv réutilise et mute `validate.errors` d'un appel à l'autre : toute conservation au-delà de
 * l'appel immédiat doit en copier le contenu. `null` (succès) devient un tableau vide — ceci décrit
 * l'API d'ajv, pas une donnée métier absente.
 */
export function copierErreurs(erreurs: ErrorObject[] | null | undefined): readonly ErrorObject[] {
  if (erreurs === null || erreurs === undefined) return [];
  return [...erreurs];
}

export function formaterErreur(erreur: ErrorObject): string {
  const chemin = erreur.instancePath === "" ? "(racine)" : erreur.instancePath;
  // ajv type `message` en optionnel (option `messages: false`, jamais utilisée ici) : rendu
  // visible plutôt que de laisser passer la chaîne littérale "undefined".
  const message = erreur.message === undefined ? "(ajv n'a pas fourni de message)" : erreur.message;
  return `${chemin} : ${message}`;
}
