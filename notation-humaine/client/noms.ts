/**
 * Les noms cités d'une Q-ATT (D29 (4)), saisis un par ligne, tels qu'écrits : seuls les blancs de
 * bord et les lignes vides tombent. Pas de virgule comme séparateur : un nom peut en porter une.
 * Sans DOM, pour être testé hors navigateur.
 */
export function nomsParLigne(texte: string): readonly string[] {
  return texte
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);
}
