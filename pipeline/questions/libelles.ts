/**
 * Détection d'un nom de candidat dans un texte de question.
 *
 * §5 (protocole 0.6) : « aucun nom de candidat — prénom et nom, ou nom seul — dans les questions
 * d'attribution, qui ne nomment que la mesure ». La vérification est une comparaison de chaînes,
 * jamais un jugement de modèle — même esprit que le test verbatim (règle 5 de `CLAUDE.md`).
 *
 * La comparaison porte sur la suite complète des mots de chaque libellé cherché, jamais sur un
 * fragment de mot : le nom « Dupont » est trouvé dans « M. Dupont propose », pas dans
 * « Dupontel ». Les libellés cherchés sont fournis par l'appelant (le libellé complet ET le nom
 * seul de chaque candidat du périmètre, `symetrie.ts`) : ce module ne décide pas de ce qui est un
 * nom.
 *
 * Normalisation : casse ignorée, accents ignorés, ponctuation réduite à une séparation de mots. Les
 * accents sont retirés parce que le §5 prévoit une formulation familière « sans accent parfois » :
 * un nom écrit sans son accent y reste un nom.
 */

/** Minuscules, sans accents, ponctuation réduite à une séparation de mots. */
function enMots(texte: string): string {
  const reduit = texte
    .normalize("NFD")
    .replace(/\p{Mark}+/gu, "")
    .normalize("NFC")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
  return ` ${reduit} `;
}

/**
 * Vrai si le libellé ne contient aucun mot une fois normalisé (vide, blancs, ponctuation seule).
 * Un tel libellé ne peut rien détecter : l'appelant le refuse plutôt que de le sauter en silence.
 */
export function libelleSansMot(libelle: string): boolean {
  return enMots(libelle) === "  ";
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
