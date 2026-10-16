/**
 * Le registre des rattachements d'item sur disque : `validation/mesures/rattachements.json`
 * (décision D53 (1) du 2026-10-16), à côté des registres des corrections de thème et des
 * relectures, dont il reprend les propriétés :
 *
 * 1. **Ajout seul.** La seule écriture est `ajouterRattachement`, appelée par
 *    `pnpm mesures --rattacher --ecrire` après la réécriture de l'item en staging. Aucune fonction
 *    ici ne modifie ni ne supprime une entrée.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un fichier illisible ou une entrée
 *    malformée arrêtent la commande : une décision de rattachement perdue serait un item changé de
 *    mesure sans trace publiée.
 *
 * Chaque entrée est confrontée à `rattachement-item.schema.json`, puis à
 * `validerEntreeRattachement`, à la lecture comme avant l'écriture. La pose est celle du registre
 * des relectures (`relectures-fichier.ts:poserRegistreAjoutSeul`) : atomique, refusée si le fichier
 * a changé depuis sa lecture, et le registre est relu après.
 *
 * Un fichier **absent** est un registre vide : aucun item n'a encore été rattaché.
 */

import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import {
  validerEntreeRattachement,
  type RattachementItem,
  type RegistreRattachementsItem,
} from "../domaine/rattachements-item.ts";
import { poserRegistreAjoutSeul, texteDuRegistre } from "./relectures-fichier.ts";

export const NOM_FICHIER_RATTACHEMENTS = "rattachements.json";

export function cheminRattachements(repertoire: string): string {
  return join(repertoire, NOM_FICHIER_RATTACHEMENTS);
}

export class RegistreRattachementsIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(
      `Registre des rattachements d'item illisible : ${chemin}\n${detail}\n` +
        `Rien n'est réparé automatiquement : ce fichier est la trace publiée des rattachements ` +
        `décidés par l'auteur.`,
    );
    this.name = "RegistreRattachementsIllisible";
  }
}

export function lireRattachements(repertoire: string): RegistreRattachementsItem {
  const chemin = cheminRattachements(repertoire);
  const texte = texteDuRegistre(chemin);
  return texte === null ? [] : entreesDe(texte, chemin);
}

function entreesDe(texte: string, chemin: string): RegistreRattachementsItem {
  return analyser(texte, chemin).map((valeur, index) => validerEntree(valeur, `${chemin}, entrée ${index + 1}`));
}

function validerEntree(valeur: unknown, provenance: string): RattachementItem {
  return validerEntreeRattachement(valider("rattachement-item", valeur, provenance), provenance);
}

function analyser(contenu: string, chemin: string): readonly unknown[] {
  const valeur = tenterJson(contenu, chemin);
  if (!Array.isArray(valeur)) throw new RegistreRattachementsIllisible(chemin, "Le registre est un tableau JSON.");
  return valeur;
}

function tenterJson(contenu: string, chemin: string): unknown {
  try {
    return JSON.parse(contenu);
  } catch (erreur) {
    throw new RegistreRattachementsIllisible(chemin, erreur instanceof Error ? erreur.message : String(erreur));
  }
}

/**
 * Les contrôles d'`ajouterRattachement`, sans l'écriture : registre lisible, entrée valide. La
 * commande les passe **avant** de réécrire l'item en staging, pour qu'un registre corrompu ou une
 * entrée fautive n'arrêtent pas l'écriture entre ses deux moitiés.
 */
export function controlerAjoutRattachement(repertoire: string, entree: RattachementItem): void {
  validerEntree(entree, `rattachement à enregistrer dans ${cheminRattachements(repertoire)}`);
  lireRattachements(repertoire);
}

/** Ajoute un rattachement en fin de registre ; le crée s'il est absent. Rend le registre relu. */
export function ajouterRattachement(repertoire: string, entree: RattachementItem): RegistreRattachementsItem {
  const chemin = cheminRattachements(repertoire);
  const validee = validerEntree(entree, `rattachement à enregistrer dans ${chemin}`);
  const lu = texteDuRegistre(chemin);
  const registre = [...(lu === null ? [] : entreesDe(lu, chemin)), validee];
  poserRegistreAjoutSeul(chemin, lu, registre);
  const relu = lireRattachements(repertoire);
  if (relu.length !== registre.length) {
    throw new RegistreRattachementsIllisible(chemin, `Relu après écriture : ${relu.length} entrée(s), ${registre.length} attendue(s).`);
  }
  return relu;
}
