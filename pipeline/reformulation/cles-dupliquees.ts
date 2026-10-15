/**
 * Détection des clés dupliquées dans un texte JSON, sans dépendance.
 *
 * `JSON.parse` garde silencieusement la dernière valeur d'une clé répétée dans un objet : une sortie
 * de modèle `{"familier": A, "familier": B}` serait lue comme B, et A disparaîtrait sans trace. Une
 * donnée perdue sans le dire est exactement ce que ce dépôt interdit ; la répétition est donc
 * détectée et la sortie rejetée en entier (`controle.ts`, motif `cle_dupliquee`).
 *
 * Contrat : le texte est du JSON valide (l'appelant l'a déjà lu avec `JSON.parse`). La lecture ne
 * retient que la structure — accolades, crochets, deux-points, virgules — et les chaînes ; les
 * nombres et littéraux ne contiennent aucun de ces caractères. Les clés sont comparées décodées :
 * `"a"` et `"a"` sont la même clé, comme pour `JSON.parse`.
 */

type Jeton = { readonly genre: "structure"; readonly caractere: string } | { readonly genre: "chaine"; readonly brut: string };

const STRUCTURE = new Set(["{", "}", "[", "]", ":", ","]);

/** Le rang qui suit le guillemet fermant d'une chaîne ouverte en `debut`. */
function finDeChaine(texte: string, debut: number): number {
  let rang = debut + 1;
  while (rang < texte.length && texte[rang] !== '"') rang += texte[rang] === "\\" ? 2 : 1;
  return rang + 1;
}

function jetons(texte: string): readonly Jeton[] {
  const lus: Jeton[] = [];
  let rang = 0;
  while (rang < texte.length) {
    const caractere = texte.charAt(rang);
    if (caractere === '"') {
      const fin = finDeChaine(texte, rang);
      lus.push({ genre: "chaine", brut: texte.slice(rang, fin) });
      rang = fin;
    } else {
      if (STRUCTURE.has(caractere)) lus.push({ genre: "structure", caractere });
      rang += 1;
    }
  }
  return lus;
}

/** Un niveau ouvert : un objet (ses clés déjà vues, et s'il attend une clé) ou un tableau. */
type Niveau = { readonly genre: "objet"; readonly cles: Set<string>; attend_cle: boolean } | { readonly genre: "tableau" };

function appliquerStructure(pile: Niveau[], caractere: string): void {
  const sommet = pile.at(-1);
  if (caractere === "{") pile.push({ genre: "objet", cles: new Set(), attend_cle: true });
  else if (caractere === "[") pile.push({ genre: "tableau" });
  else if (caractere === "}" || caractere === "]") pile.pop();
  else if (caractere === "," && sommet?.genre === "objet") sommet.attend_cle = true;
}

/** La clé si la chaîne en est une déjà vue dans son objet ; l'enregistre sinon. */
function cleRepetee(pile: readonly Niveau[], brut: string): string | null {
  const sommet = pile.at(-1);
  if (sommet?.genre !== "objet" || !sommet.attend_cle) return null;
  sommet.attend_cle = false;
  const cle = JSON.parse(brut) as string;
  if (sommet.cles.has(cle)) return cle;
  sommet.cles.add(cle);
  return null;
}

/** La première clé répétée dans un même objet, à n'importe quel niveau, ou `null`. */
export function premiereCleDupliquee(texte: string): string | null {
  const pile: Niveau[] = [];
  for (const jeton of jetons(texte)) {
    if (jeton.genre === "structure") {
      appliquerStructure(pile, jeton.caractere);
      continue;
    }
    const repetee = cleRepetee(pile, jeton.brut);
    if (repetee !== null) return repetee;
  }
  return null;
}
