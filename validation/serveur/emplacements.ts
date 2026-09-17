/**
 * Les « emplacements » d'un item : les endroits où il porte une source à afficher.
 *
 * Un item P en a un, un item O en a deux (§4 : les deux états restent sourcés), un item A en a
 * un d'une autre nature — la preuve que le programme couvre le thème — et un item F n'en a
 * aucun. Nommer ces emplacements évite un embranchement par type d'item dans chaque fonction
 * qui touche à une source.
 */

import type { EtatPositionnel, Item, Source } from "../domaine/types.ts";

export type CleEmplacement = "assertion" | "anterieur" | "posterieur" | "couverture";

export type TypeAffichage = "pdf" | "page" | "media";

export interface Emplacement {
  readonly cle: CleEmplacement;
  readonly source: Source;
  readonly etat: EtatPositionnel | null;
  readonly type_affichage: TypeAffichage;
  readonly libelle: string;
}

export function emplacements(item: Item): readonly Emplacement[] {
  if (item.assertion !== undefined) {
    return [construire("assertion", item.assertion.source, item.assertion, "Source de la position")];
  }
  if (item.obsolescence !== undefined) {
    const { etat_anterieur, etat_posterieur } = item.obsolescence;
    return [
      construire("anterieur", etat_anterieur.source, etat_anterieur, "Source de l'état antérieur"),
      construire("posterieur", etat_posterieur.source, etat_posterieur, "Source de l'état postérieur"),
    ];
  }
  if (item.absence !== undefined) {
    return [
      construire(
        "couverture",
        item.absence.source_couverture_theme,
        null,
        "Programme couvrant le thème",
      ),
    ];
  }
  return [];
}

export function emplacement(item: Item, cle: string): Emplacement | null {
  return emplacements(item).find((candidat) => candidat.cle === cle) ?? null;
}

function construire(
  cle: CleEmplacement,
  source: Source,
  etat: EtatPositionnel | null,
  libelle: string,
): Emplacement {
  return { cle, source, etat, type_affichage: typeAffichage(source), libelle };
}

function typeAffichage(source: Source): TypeAffichage {
  if (source.type_document === "programme_pdf") return "pdf";
  if (source.type_document === "enregistrement_audio" || source.type_document === "enregistrement_video") {
    return "media";
  }
  return "page";
}

/** Emplacement visé par le chemin d'une correction de citation. */
export function emplacementDuChemin(chemin: string): CleEmplacement | null {
  if (chemin.startsWith("/assertion/")) return "assertion";
  if (chemin.startsWith("/obsolescence/etat_anterieur/")) return "anterieur";
  if (chemin.startsWith("/obsolescence/etat_posterieur/")) return "posterieur";
  return null;
}
