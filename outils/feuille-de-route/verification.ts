/**
 * Comparaison pure utilisée par `--verifier` : le Markdown sur disque est-il celui que le
 * générateur produirait ? Séparée du reste pour être testée sans toucher au disque.
 */

export function estAJour(surDisque: string | undefined, genere: string): boolean {
  return surDisque === genere;
}
