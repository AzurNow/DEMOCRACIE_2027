/**
 * Lecture des arguments de ligne de commande, en un seul endroit.
 *
 * Extrait des deux outils qui la dupliquaient. L'intérêt n'est pas seulement d'éviter la
 * répétition : en remplaçant une cascade de `??` par des appels nommés, chaque `lireOptions`
 * redevient une liste de valeurs par défaut sans branche, donc sous les seuils de complexité
 * du dépôt et lisible d'un coup d'œil.
 */

export type Arguments = ReadonlyMap<string, string>;

/** Une option que la commande ne déclare pas : refusée, jamais ignorée. */
export class OptionsInconnues extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptionsInconnues";
  }
}

/**
 * `--cle=valeur` donne la valeur ; `--drapeau` seul donne « true ».
 *
 * Toute option hors de `connues` est refusée avant que la commande ne lise ou n'écrive quoi que ce
 * soit. Ignorée, une coquille (`--dissidence` pour `--dissidence-fichier`) ferait publier dans
 * `data/` une décision privée de la pièce que l'option devait joindre, sans aucun message.
 */
export function analyserArguments(bruts: readonly string[], connues: readonly string[]): Arguments {
  const table = new Map<string, string>();
  for (const argument of bruts) {
    if (!argument.startsWith("--")) continue;
    const separateur = argument.indexOf("=");
    if (separateur > 0) table.set(argument.slice(2, separateur), argument.slice(separateur + 1));
    else table.set(argument.slice(2), "true");
  }
  const inconnues = [...table.keys()].filter((cle) => !connues.includes(cle));
  if (inconnues.length > 0) throw new OptionsInconnues(messageInconnues(inconnues, connues));
  return table;
}

function messageInconnues(inconnues: readonly string[], connues: readonly string[]): string {
  const admises = connues.length === 0 ? "cette commande n'admet aucune option" : `options admises : ${connues.map((cle) => `--${cle}`).join(", ")}`;
  return `option(s) inconnue(s) : ${inconnues.map((cle) => `--${cle}`).join(", ")} ; ${admises}.`;
}

/**
 * Toutes les valeurs d'une option répétable (`--cle=a --cle=b`), dans l'ordre. `analyserArguments`
 * ne garde que la dernière : une option répétable se lit ici, sur les arguments bruts, et se
 * déclare aussi parmi les options connues de `analyserArguments`.
 */
export function multiples(bruts: readonly string[], cle: string): readonly string[] {
  const prefixe = `--${cle}=`;
  return bruts.filter((argument) => argument.startsWith(prefixe)).map((argument) => argument.slice(prefixe.length));
}

export function texte(table: Arguments, cle: string, defaut: string): string {
  const valeur = table.get(cle);
  return valeur === undefined ? defaut : valeur;
}

export function entier(table: Arguments, cle: string, defaut: number): number {
  const valeur = table.get(cle);
  return valeur === undefined ? defaut : Number(valeur);
}

export function drapeau(table: Arguments, cle: string): boolean {
  return table.get(cle) === "true";
}

/** Argument sans valeur par défaut : son absence est une erreur, pas un cas à combler. */
export function obligatoire(table: Arguments, cle: string, pourquoi: string): string {
  const valeur = table.get(cle);
  if (valeur === undefined) throw new Error(`--${cle} est obligatoire : ${pourquoi}`);
  return valeur;
}
