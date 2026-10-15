/**
 * Détection d'un nom de candidat dans un texte de question.
 *
 * §5 (protocole 0.6) : « aucun nom de candidat — prénom et nom, ou nom seul — dans les questions
 * d'attribution, qui ne nomment que la mesure ». La vérification est une comparaison de chaînes,
 * jamais un jugement de modèle — même esprit que le test verbatim (règle 5 de `CLAUDE.md`).
 *
 * La comparaison porte sur la suite complète des mots de chaque libellé cherché, jamais sur un
 * fragment de mot : le nom « Dupont » est trouvé dans « M. Dupont propose », pas dans
 * « Dupontel ». Les chaînes cherchées dans une Q-ATT sont assemblées ici, une seule fois
 * (`nomsCherchesEnAttribution`), et lues par la barrière de symétrie (`symetrie.ts`) comme par le
 * contrôle de la reformulation (`pipeline/reformulation/controle.ts`) : une formulation acceptée par
 * l'un ne peut pas être refusée par l'autre faute d'un nom cherché d'un seul côté.
 *
 * Normalisation : casse ignorée, accents ignorés, ponctuation réduite à une séparation de mots. Les
 * accents sont retirés parce que le §5 prévoit une formulation familière « sans accent parfois » :
 * un nom écrit sans son accent y reste un nom.
 */

import type { CandidatNomme } from "./types.ts";

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

/**
 * Vrai si les deux textes sont la même suite de mots, à la normalisation de ce module près (casse,
 * accents, ponctuation). Égalité, jamais inclusion : « M. Dupont » n'est pas « Dupont ». Lu par le
 * rattachement des noms cités sur une question d'attribution (`pipeline/notation/rattachement.ts`),
 * pour qu'une seule normalisation des noms vive dans le dépôt.
 */
export function memesMots(a: string, b: string): boolean {
  return enMots(a) === enMots(b);
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

/**
 * §5 (protocole 0.6) : « prénom et nom, ou nom seul ». Les chaînes qu'aucune question d'attribution
 * ne doit contenir : pour chaque candidat du périmètre, l'identifiant, le libellé complet et le nom
 * seul saisis par l'auteur, dans l'ordre du périmètre, sans doublon. `item.libelle_lisible`,
 * étiquette de l'item, n'est pas un nom de candidat et n'est pas cherché.
 *
 * Seule définition : la barrière de symétrie et le contrôle de la reformulation la lisent toutes
 * deux. Un libellé sans aucun mot ne détecterait rien : il est refusé, jamais sauté. Un périmètre
 * vide rend une liste vide ; le refuser appartient à l'appelant qui l'exige.
 */
export function nomsCherchesEnAttribution(perimetre: readonly CandidatNomme[]): readonly string[] {
  const noms = perimetre.flatMap((candidat) => [candidat.candidat_id, candidat.libelle, candidat.nom]);
  const vide = noms.find(libelleSansMot);
  if (vide !== undefined) {
    throw new Error(
      `Libellé de candidat sans aucun mot dans le périmètre : « ${vide} ». Ni la barrière « aucun nom de ` +
        `candidat dans les Q-ATT » ni le contrôle de la reformulation ne peuvent le chercher.`,
    );
  }
  return [...new Set(noms)];
}
