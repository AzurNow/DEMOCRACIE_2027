/**
 * La frontière HTTP de la saisie : le corps reçu du navigateur est inconnu, il est contrôlé champ
 * par champ avant d'être remis au domaine. Ici seule la **forme** est vérifiée (types, champs
 * connus, rien en trop) ; les valeurs d'énumération et toutes les règles de la grille sont celles du
 * schéma et de `construireNotationHumaine`, qui refusent avec leurs propres motifs. Aucune valeur
 * par défaut : un champ absent est une erreur, pas un `false` ni une liste vide.
 */

import type { NoteDecidee, SaisieAttribution, SaisieHumaine, SaisieOrdinaire, SoutienSaisi } from "../../pipeline/notation/notation-humaine.ts";

export interface DemandeNotation {
  readonly reponse_id: string;
  readonly saisie: SaisieHumaine;
}

export type LectureDemande =
  | { readonly valide: true; readonly demande: DemandeNotation }
  | { readonly valide: false; readonly erreurs: readonly string[] };

type Objet = Readonly<Record<string, unknown>>;

const CHAMPS_DEMANDE = ["reponse_id", "saisie"] as const;
const CHAMPS_SAISIE = ["categorie", "drapeaux", "motif_inexactitude", "cite", "soutiens", "extrait"] as const;
/** D29 (1) : sur une Q-ATT, l'annotateur saisit les noms cités et la non-réponse, pas la catégorie. */
const CHAMPS_SAISIE_ATTRIBUTION = ["noms_cites", "non_reponse", "indeterminee", "note_decidee", "cite", "soutiens", "extrait"] as const;
/** D30 (2) : la note décidée par l'humain sur une Q-ATT indécidable. */
const CHAMPS_NOTE_DECIDEE = ["categorie", "drapeaux", "motif_inexactitude"] as const;
const CHAMPS_SOUTIEN = ["url_citee", "verdict_soutien"] as const;
const CHAMPS_EXTRAIT = ["texte", "provenance"] as const;

function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function estListeDeChaines(valeur: unknown): valeur is readonly string[] {
  return Array.isArray(valeur) && valeur.every((element) => typeof element === "string");
}

/** Les champs de `objet` qui ne figurent pas dans `connus`, un message chacun. */
function champsInconnus(objet: Objet, connus: readonly string[], chemin: string): readonly string[] {
  return Object.keys(objet)
    .filter((cle) => !connus.includes(cle))
    .map((cle) => `${chemin}.${cle} : champ inconnu`);
}

function exigerChaine(objet: Objet, cle: string, chemin: string): readonly string[] {
  return typeof objet[cle] === "string" ? [] : [`${chemin}.${cle} : une chaîne est attendue`];
}

function chaineSiPresente(objet: Objet, cle: string, chemin: string): readonly string[] {
  return objet[cle] === undefined ? [] : exigerChaine(objet, cle, chemin);
}

function erreursSoutien(soutien: unknown, rang: number): readonly string[] {
  const chemin = `saisie.soutiens[${rang}]`;
  if (!estObjet(soutien)) return [`${chemin} : un objet est attendu`];
  return [...champsInconnus(soutien, CHAMPS_SOUTIEN, chemin), ...exigerChaine(soutien, "url_citee", chemin), ...exigerChaine(soutien, "verdict_soutien", chemin)];
}

function erreursExtrait(extrait: unknown): readonly string[] {
  if (extrait === undefined) return [];
  if (!estObjet(extrait)) return ["saisie.extrait : un objet est attendu"];
  return [...champsInconnus(extrait, CHAMPS_EXTRAIT, "saisie.extrait"), ...exigerChaine(extrait, "texte", "saisie.extrait"), ...exigerChaine(extrait, "provenance", "saisie.extrait")];
}

function erreursListe(objet: Objet, cle: string, chemin: string, obligatoire: boolean): readonly string[] {
  if (objet[cle] === undefined) return obligatoire ? [`${chemin}.${cle} : une liste de chaînes est attendue`] : [];
  return estListeDeChaines(objet[cle]) ? [] : [`${chemin}.${cle} : une liste de chaînes est attendue`];
}

function erreursSoutiens(soutiens: unknown): readonly string[] {
  if (!Array.isArray(soutiens)) return ["saisie.soutiens : une liste est attendue"];
  return soutiens.flatMap((soutien: unknown, rang) => erreursSoutien(soutien, rang));
}

function exigerBooleen(objet: Objet, cle: string): readonly string[] {
  return typeof objet[cle] === "boolean" ? [] : [`saisie.${cle} : un booléen est attendu`];
}

/** Une saisie qui porte `noms_cites` est celle d'une Q-ATT ; le domaine refuse la forme qui ne va pas avec la question. */
function estSaisieAttribution(saisie: Objet): boolean {
  return "noms_cites" in saisie;
}

function erreursNoteDecidee(note: unknown): readonly string[] {
  if (note === undefined) return [];
  if (!estObjet(note)) return ["saisie.note_decidee : un objet est attendu"];
  const chemin = "saisie.note_decidee";
  return [...champsInconnus(note, CHAMPS_NOTE_DECIDEE, chemin), ...exigerChaine(note, "categorie", chemin), ...erreursListe(note, "drapeaux", chemin, true), ...chaineSiPresente(note, "motif_inexactitude", chemin)];
}

function erreursPropres(saisie: Objet): readonly string[] {
  if (estSaisieAttribution(saisie)) {
    return [
      ...champsInconnus(saisie, CHAMPS_SAISIE_ATTRIBUTION, "saisie"),
      ...erreursListe(saisie, "noms_cites", "saisie", true),
      ...exigerBooleen(saisie, "non_reponse"),
      ...exigerBooleen(saisie, "indeterminee"),
      ...erreursNoteDecidee(saisie["note_decidee"]),
    ];
  }
  return [
    ...champsInconnus(saisie, CHAMPS_SAISIE, "saisie"),
    ...exigerChaine(saisie, "categorie", "saisie"),
    ...erreursListe(saisie, "drapeaux", "saisie", true),
    ...chaineSiPresente(saisie, "motif_inexactitude", "saisie"),
  ];
}

function erreursSaisie(saisie: unknown): readonly string[] {
  if (!estObjet(saisie)) return ["saisie : un objet est attendu"];
  return [...erreursPropres(saisie), ...exigerBooleen(saisie, "cite"), ...erreursSoutiens(saisie["soutiens"]), ...erreursExtrait(saisie["extrait"])];
}

function erreursDemande(corps: unknown): readonly string[] {
  if (!estObjet(corps)) return ["le corps de la requête doit être un objet JSON"];
  return [...champsInconnus(corps, CHAMPS_DEMANDE, "corps"), ...exigerChaine(corps, "reponse_id", "corps"), ...erreursSaisie(corps["saisie"])];
}

/** Les soutiens, recopiés champ par champ : rien d'autre ne passe au domaine. */
function soutiensDe(brut: readonly Objet[]): readonly SoutienSaisi[] {
  return brut.map((s) => ({ url_citee: s["url_citee"] as string, verdict_soutien: s["verdict_soutien"] as SoutienSaisi["verdict_soutien"] }));
}

/**
 * La saisie reconstruite champ par champ, après contrôle de forme. Les assertions de type portent sur
 * des champs que `erreursDemande` vient de vérifier ; les valeurs d'énumération restent à contrôler
 * par le schéma, dans `construireNotationHumaine`.
 */
/** Recopie champ par champ ; la valeur de la catégorie décidée est contrôlée par le domaine. */
function saisieAttributionDe(brut: Objet, commune: Pick<SaisieHumaine, "cite" | "soutiens" | "extrait">): SaisieAttribution {
  const note = brut["note_decidee"] as Objet | undefined;
  return {
    ...commune,
    noms_cites: [...(brut["noms_cites"] as readonly string[])],
    non_reponse: brut["non_reponse"] as boolean,
    indeterminee: brut["indeterminee"] as boolean,
    ...(note === undefined
      ? {}
      : {
          note_decidee: {
            categorie: note["categorie"] as NoteDecidee["categorie"],
            drapeaux: note["drapeaux"] as NoteDecidee["drapeaux"],
            ...(note["motif_inexactitude"] === undefined ? {} : { motif_inexactitude: note["motif_inexactitude"] as NonNullable<NoteDecidee["motif_inexactitude"]> }),
          },
        }),
  };
}

function saisieDe(brut: Objet): SaisieHumaine {
  const extrait = brut["extrait"] as Objet | undefined;
  const commune = {
    cite: brut["cite"] as boolean,
    soutiens: soutiensDe(brut["soutiens"] as readonly Objet[]),
    ...(extrait === undefined ? {} : { extrait: { texte: extrait["texte"] as string, provenance: extrait["provenance"] as NonNullable<SaisieHumaine["extrait"]>["provenance"] } }),
  };
  if (estSaisieAttribution(brut)) return saisieAttributionDe(brut, commune);
  return {
    ...commune,
    categorie: brut["categorie"] as SaisieOrdinaire["categorie"],
    drapeaux: brut["drapeaux"] as SaisieOrdinaire["drapeaux"],
    ...(brut["motif_inexactitude"] === undefined ? {} : { motif_inexactitude: brut["motif_inexactitude"] as NonNullable<SaisieOrdinaire["motif_inexactitude"]> }),
  };
}

export function lireDemande(corps: unknown): LectureDemande {
  const erreurs = erreursDemande(corps);
  if (erreurs.length > 0 || !estObjet(corps)) return { valide: false, erreurs };
  return { valide: true, demande: { reponse_id: corps["reponse_id"] as string, saisie: saisieDe(corps["saisie"] as Objet) } };
}
