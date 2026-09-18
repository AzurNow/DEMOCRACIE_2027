/**
 * Détection d'un libellé de candidat dans un texte de question.
 *
 * §5 : « aucun nom de candidat dans les questions d'attribution, qui ne nomment que la mesure ».
 * La vérification est une comparaison de chaînes, jamais un jugement de modèle — même esprit
 * que le test verbatim (règle 5 de `CLAUDE.md`).
 *
 * La comparaison porte sur la suite complète des mots du libellé, jamais sur un fragment : une
 * mesure qui s'appelle « prime alpha » ne doit pas faire échouer un run parce qu'un candidat
 * s'appelle « Camille Alpha ». À l'inverse, le libellé entier trouvé dans le texte est une
 * fuite, où qu'il se trouve.
 */

/** Minuscules, accents conservés, ponctuation réduite à une séparation de mots. */
function enMots(texte: string): string {
  const reduit = texte
    .normalize("NFC")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
  return ` ${reduit} `;
}

/** Vrai si l'un des libellés figure dans le texte comme suite de mots complète. */
export function contientLibelle(texte: string, libelles: readonly string[]): boolean {
  return trouverLibelle(texte, libelles) !== null;
}

/** Le premier libellé trouvé, ou `null`. Rendre le libellé plutôt qu'un booléen permet de le nommer dans le rapport. */
export function trouverLibelle(texte: string, libelles: readonly string[]): string | null {
  const aiguille = enMots(texte);
  for (const libelle of libelles) {
    const motif = enMots(libelle);
    if (motif === "  ") continue;
    if (aiguille.includes(motif)) return libelle;
  }
  return null;
}
