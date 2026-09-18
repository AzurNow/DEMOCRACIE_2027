/**
 * Édition des champs, ouverte par la décision « corriger ».
 *
 * Deux règles s'appliquent ici et nulle part ailleurs :
 *
 * - **Seuls les champs de contenu sont éditables.** Identifiants, empreintes, statuts et
 *   sources ne le sont pas. La liste blanche fait autorité côté serveur ; celle-ci ne fait
 *   qu'afficher ce que le serveur accepterait.
 * - **Le thème n'appartient pas à l'item** mais à la mesure, partagée par plusieurs candidats.
 *   Le corriger est donc une demande adressée au référentiel, signalée comme telle à l'écran :
 *   l'item attendra que la mesure soit corrigée à part.
 */

import type { Correction, ItemProjete, Session } from "./types.ts";

export interface ChampEditable {
  readonly chemin: string;
  readonly cible: "item" | "mesure";
  readonly libelle: string;
  readonly valeur: unknown;
  readonly forme: "texte" | "ligne" | "choix" | "json";
  readonly choix?: readonly string[];
  readonly avertissement?: string;
}

export function champsEditables(item: ItemProjete, session: Session): readonly ChampEditable[] {
  const champs: ChampEditable[] = [
    {
      chemin: "/theme",
      cible: "mesure",
      libelle: "Thème (appartient à la mesure)",
      valeur: item.mesure.theme,
      forme: "choix",
      choix: session.themes,
      avertissement:
        "Le thème est porté par la mesure, commune à plusieurs candidats. La correction est " +
        "enregistrée comme demande ; l'item ne sera promu qu'une fois la mesure corrigée à part.",
    },
    ligne("/valide_du", "Valide du", item.valide_du),
    ligne("/valide_au", "Valide au (vide = toujours en vigueur)", item.valide_au),
  ];

  if (item.assertion !== null) champs.push(...champsEtat("/assertion", item.assertion, session));
  if (item.obsolescence !== null) {
    champs.push(ligne("/obsolescence/date_changement", "Date du changement", item.obsolescence.date_changement));
    champs.push(...champsEtat("/obsolescence/etat_anterieur", item.obsolescence.etat_anterieur, session, "antérieur"));
    champs.push(...champsEtat("/obsolescence/etat_posterieur", item.obsolescence.etat_posterieur, session, "postérieur"));
  }
  return champs;
}

function champsEtat(
  prefixe: string,
  etat: { position: string; paraphrase: string; citation_verbatim: string; quantification: unknown },
  session: Session,
  suffixe = "",
): readonly ChampEditable[] {
  const marque = suffixe.length === 0 ? "" : ` (${suffixe})`;
  return [
    {
      chemin: `${prefixe}/position`,
      cible: "item",
      libelle: `Position${marque}`,
      valeur: etat.position,
      forme: "choix",
      choix: session.positions,
    },
    {
      chemin: `${prefixe}/paraphrase`,
      cible: "item",
      libelle: `Paraphrase${marque}`,
      valeur: etat.paraphrase,
      forme: "texte",
    },
    {
      chemin: `${prefixe}/citation_verbatim`,
      cible: "item",
      libelle: `Citation verbatim${marque}`,
      valeur: etat.citation_verbatim,
      forme: "texte",
      avertissement:
        "Une citation corrigée doit figurer telle quelle dans le texte de la source : le test " +
        "verbatim est rejoué et la décision est refusée s'il échoue. Si c'est le texte extrait " +
        "qui est faux, la décision attendue est « rejeter », avec le commentaire « texte " +
        "extrait erroné ».",
    },
    {
      chemin: `${prefixe}/quantification`,
      cible: "item",
      libelle: `Quantification${marque}`,
      valeur: etat.quantification,
      forme: "json",
    },
  ];
}

function ligne(chemin: string, libelle: string, valeur: unknown): ChampEditable {
  return { chemin, cible: "item", libelle, valeur, forme: "ligne" };
}

/** Construit les corrections à partir des seules valeurs réellement modifiées. */
export function corrections(
  champs: readonly ChampEditable[],
  saisies: ReadonlyMap<string, string>,
): readonly Correction[] {
  const resultat: Correction[] = [];
  for (const champ of champs) {
    const saisie = saisies.get(champ.chemin);
    if (saisie === undefined) continue;
    const nouvelle = interpreter(champ, saisie);
    if (JSON.stringify(nouvelle) === JSON.stringify(champ.valeur)) continue;
    resultat.push({
      cible: champ.cible,
      chemin: champ.chemin,
      ancienne_valeur: champ.valeur,
      nouvelle_valeur: nouvelle,
    });
  }
  return resultat;
}

function interpreter(champ: ChampEditable, saisie: string): unknown {
  if (champ.forme === "json") return saisie.trim().length === 0 ? null : JSON.parse(saisie);
  if (champ.chemin === "/valide_au" && saisie.trim().length === 0) return null;
  return saisie;
}
