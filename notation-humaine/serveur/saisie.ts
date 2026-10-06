/**
 * La frontière HTTP de la saisie : le corps reçu du navigateur est inconnu, il est contrôlé champ
 * par champ avant d'être remis au domaine. Ici seule la **forme** est vérifiée (types, champs
 * connus, rien en trop) ; les valeurs d'énumération et toutes les règles de la grille sont celles du
 * schéma et de `construireNotationHumaine`, qui refusent avec leurs propres motifs. Aucune valeur
 * par défaut : un champ absent est une erreur, pas un `false` ni une liste vide.
 */

import type { SaisieHumaine, SoutienSaisi } from "../../pipeline/notation/notation-humaine.ts";

export interface DemandeNotation {
  readonly reponse_id: string;
  readonly saisie: SaisieHumaine;
}

export type LectureDemande =
  | { readonly valide: true; readonly demande: DemandeNotation }
  | { readonly valide: false; readonly erreurs: readonly string[] };

type Objet = Readonly<Record<string, unknown>>;

const CHAMPS_DEMANDE = ["reponse_id", "saisie"] as const;
const CHAMPS_SAISIE = ["categorie", "drapeaux", "motif_inexactitude", "cite", "soutiens", "attribution", "extrait"] as const;
const CHAMPS_SOUTIEN = ["url_citee", "verdict_soutien"] as const;
const CHAMPS_EXTRAIT = ["texte", "provenance"] as const;
const CHAMPS_ATTRIBUTION = ["attendus", "cites", "hors_perimetre_cites"] as const;

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

function erreursAttribution(attribution: unknown): readonly string[] {
  if (attribution === undefined) return [];
  if (!estObjet(attribution)) return ["saisie.attribution : un objet est attendu"];
  return [
    ...champsInconnus(attribution, CHAMPS_ATTRIBUTION, "saisie.attribution"),
    ...erreursListe(attribution, "attendus", "saisie.attribution", true),
    ...erreursListe(attribution, "cites", "saisie.attribution", true),
    ...erreursListe(attribution, "hors_perimetre_cites", "saisie.attribution", false),
  ];
}

function erreursSoutiens(soutiens: unknown): readonly string[] {
  if (!Array.isArray(soutiens)) return ["saisie.soutiens : une liste est attendue"];
  return soutiens.flatMap((soutien: unknown, rang) => erreursSoutien(soutien, rang));
}

function erreursSaisie(saisie: unknown): readonly string[] {
  if (!estObjet(saisie)) return ["saisie : un objet est attendu"];
  return [
    ...champsInconnus(saisie, CHAMPS_SAISIE, "saisie"),
    ...exigerChaine(saisie, "categorie", "saisie"),
    ...erreursListe(saisie, "drapeaux", "saisie", true),
    ...chaineSiPresente(saisie, "motif_inexactitude", "saisie"),
    ...(typeof saisie["cite"] === "boolean" ? [] : ["saisie.cite : un booléen est attendu"]),
    ...erreursSoutiens(saisie["soutiens"]),
    ...erreursAttribution(saisie["attribution"]),
    ...erreursExtrait(saisie["extrait"]),
  ];
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
function saisieDe(brut: Objet): SaisieHumaine {
  const extrait = brut["extrait"] as Objet | undefined;
  const attribution = brut["attribution"] as Objet | undefined;
  return {
    categorie: brut["categorie"] as SaisieHumaine["categorie"],
    drapeaux: brut["drapeaux"] as SaisieHumaine["drapeaux"],
    cite: brut["cite"] as boolean,
    soutiens: soutiensDe(brut["soutiens"] as readonly Objet[]),
    ...(brut["motif_inexactitude"] === undefined ? {} : { motif_inexactitude: brut["motif_inexactitude"] as NonNullable<SaisieHumaine["motif_inexactitude"]> }),
    ...(attribution === undefined ? {} : { attribution: attribution as unknown as NonNullable<SaisieHumaine["attribution"]> }),
    ...(extrait === undefined ? {} : { extrait: { texte: extrait["texte"] as string, provenance: extrait["provenance"] as NonNullable<SaisieHumaine["extrait"]>["provenance"] } }),
  };
}

export function lireDemande(corps: unknown): LectureDemande {
  const erreurs = erreursDemande(corps);
  if (erreurs.length > 0 || !estObjet(corps)) return { valide: false, erreurs };
  return { valide: true, demande: { reponse_id: corps["reponse_id"] as string, saisie: saisieDe(corps["saisie"] as Objet) } };
}
