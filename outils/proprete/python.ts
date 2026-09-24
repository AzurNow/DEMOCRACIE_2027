/**
 * Signaux d'un fichier Python, par motifs ligne à ligne : pas d'analyseur Python côté TypeScript,
 * et le signal n'a pas besoin d'être exact pour être utile. Il liste ; le relecteur trie.
 * La longueur des fonctions n'est pas mesurée ici : ruff (C901) borne déjà leur complexité.
 */
import { compteurDans, type Signal } from "./signaux.ts";

const LITTERAL = String.raw`(?:""|''|0|\[\]|\{\}|None|False|True)(?![\w.])`;
const OU_LITTERAL = new RegExp(String.raw`\bor\s+${LITTERAL}`, "u");
const GET_AVEC_DEFAUT = new RegExp(String.raw`\.get\([^()]*,\s*${LITTERAL}\s*\)`, "u");
const EXCEPT = /^\s*except\b[^:]*:\s*(.*)$/u;
const EXCEPT_NU = /^\s*except\s*:/u;

function defaut(ligne: string): string | null {
  const trouve = OU_LITTERAL.exec(ligne) ?? GET_AVEC_DEFAUT.exec(ligne);
  return trouve === null ? null : trouve[0];
}

function suivanteNonVide(lignes: readonly string[], index: number): string {
  const suivante = lignes.slice(index + 1).find((ligne) => ligne.trim() !== "");
  return suivante === undefined ? "" : suivante.trim();
}

function capture(ligne: string, lignes: readonly string[], index: number): string | null {
  if (EXCEPT_NU.test(ligne)) return "except nu : attrape tout, jusqu'à KeyboardInterrupt";
  const trouve = EXCEPT.exec(ligne);
  if (trouve === null) return null;
  const surLaLigne = trouve[1];
  const corps = surLaLigne ? surLaLigne.trim() : suivanteNonVide(lignes, index);
  return corps === "pass" ? "except suivi de pass : l'erreur disparaît" : null;
}

export function signauxPython(fichier: string, contenu: string): Signal[] {
  const lignes = contenu.split("\n");
  const signaux: Signal[] = [];
  lignes.forEach((ligne, index) => {
    const numero = index + 1;
    const valeur = defaut(ligne);
    if (valeur !== null) signaux.push({ genre: "defaut", fichier, ligne: numero, detail: valeur });
    const muette = capture(ligne, lignes, index);
    if (muette !== null) signaux.push({ genre: "capture", fichier, ligne: numero, detail: muette });
    const compte = compteurDans(ligne);
    if (compte !== null) signaux.push({ genre: "compteur", fichier, ligne: numero, detail: compte });
  });
  return signaux;
}
