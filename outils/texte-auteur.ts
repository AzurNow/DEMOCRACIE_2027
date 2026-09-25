/**
 * Lecture d'un texte rédigé par un humain dans un fichier (motivation d'arbitrage ou du panel,
 * opinion dissidente, texte d'une contestation). Jamais passé sur la ligne de commande : un texte
 * long, multiligne ou accentué y serait déformé par le shell.
 *
 * Seul le saut de ligne final que tout éditeur ajoute est retiré : c'est la fin du fichier, pas du
 * texte. Rien d'autre n'est touché. Un texte vide, ou fait seulement d'espaces, est refusé : une
 * motivation absente reste absente, jamais remplacée.
 */

import { readFileSync } from "node:fs";

export class TexteAuteurVide extends Error {
  constructor(nom: string, chemin: string) {
    super(`${nom} vide : ${chemin}. Un texte publié ne se remplace pas par rien.`);
    this.name = "TexteAuteurVide";
  }
}

export function sansSautFinal(brut: string): string {
  return brut.endsWith("\n") ? brut.slice(0, -1) : brut;
}

export function lireTexteAuteur(chemin: string, nom: string): string {
  const texte = sansSautFinal(readFileSync(chemin, "utf8"));
  if (texte.trim().length === 0) throw new TexteAuteurVide(nom, chemin);
  return texte;
}
