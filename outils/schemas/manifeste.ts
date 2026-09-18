import { readFileSync } from "node:fs";

export type Attendu = "valide" | "invalide";

export interface EntreeManifeste {
  readonly objet: string;
  readonly fichier: string;
  readonly attendu: Attendu;
  readonly motif: string;
  readonly regle_protocole?: string;
}

export interface Manifeste {
  readonly description: string;
  readonly exemples: readonly EntreeManifeste[];
}

/** Le manifeste est la table de vérité : une forme inattendue est une erreur du runner, jamais
 * un cas ignoré (règle « aucune valeur par défaut silencieuse »). */
export class ErreurManifeste extends Error {}

function estAttendu(valeur: unknown): valeur is Attendu {
  return valeur === "valide" || valeur === "invalide";
}

function champTexte(brute: Record<string, unknown>, cle: string, contexte: string): string {
  const valeur = brute[cle];
  if (typeof valeur !== "string") {
    throw new ErreurManifeste(`${contexte}.${cle} manquant ou non textuel.`);
  }
  return valeur;
}

function champTexteFacultatif(brute: Record<string, unknown>, cle: string, contexte: string): string | undefined {
  const valeur = brute[cle];
  if (valeur === undefined) return undefined;
  if (typeof valeur !== "string") {
    throw new ErreurManifeste(`${contexte}.${cle} doit être textuel quand il est présent.`);
  }
  return valeur;
}

function validerEntree(brute: unknown, index: number): EntreeManifeste {
  const contexte = `manifeste.exemples[${index}]`;
  if (typeof brute !== "object" || brute === null) {
    throw new ErreurManifeste(`${contexte} n'est pas un objet.`);
  }
  const objetBrut = brute as Record<string, unknown>;
  const objet = champTexte(objetBrut, "objet", contexte);
  const fichier = champTexte(objetBrut, "fichier", contexte);
  const motif = champTexte(objetBrut, "motif", contexte);
  const reglesProtocole = champTexteFacultatif(objetBrut, "regle_protocole", contexte);
  if (!estAttendu(objetBrut["attendu"])) {
    throw new ErreurManifeste(`${contexte}.attendu doit être "valide" ou "invalide" (fichier ${fichier}).`);
  }
  const attendu = objetBrut["attendu"];
  return reglesProtocole === undefined
    ? { objet, fichier, attendu, motif }
    : { objet, fichier, attendu, motif, regle_protocole: reglesProtocole };
}

export function chargerManifeste(chemin: string): Manifeste {
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
  if (typeof brut["description"] !== "string") {
    throw new ErreurManifeste("manifeste.description manquant ou non textuel.");
  }
  if (!Array.isArray(brut["exemples"])) {
    throw new ErreurManifeste("manifeste.exemples doit être un tableau.");
  }
  const exemples = brut["exemples"].map((entree: unknown, index: number) => validerEntree(entree, index));
  return { description: brut["description"], exemples };
}
