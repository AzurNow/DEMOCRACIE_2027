/**
 * Normalisation d'URL pour compter les sondages « par URL distinctes » (§3).
 *
 * Décision de l'auteur du 2026-10-02, conformité n° 36, texte au §3 en 0.15. Appliquée dans cet
 * ordre :
 *   1. le schéma et l'hôte passent en minuscules ;
 *   2. `http` est assimilé à `https` ;
 *   3. le fragment (`#…`) est retiré ;
 *   4. les paramètres de requête dont le nom commence par `utm_` sont retirés, les autres gardés
 *      dans leur ordre d'origine, et un `?` laissé vide disparaît ;
 *   5. la barre oblique finale du chemin est retirée, sauf si le chemin est `/` seul.
 * Le reste est comparé à l'identique : chemin sensible à la casse, aucun décodage des `%xx`,
 * aucun autre paramètre retiré. Une URL illisible lève `ErreurUrlIllisible`, sans valeur par défaut.
 *
 * Ce que l'API `URL` de Node fait d'elle-même, avant nos règles, et qui fait donc partie de la règle
 * publiée (chaque point a son test) :
 *   - schéma et hôte en minuscules (la règle 1 est en réalité faite par `URL`) ;
 *   - port par défaut effacé (`:443` pour https, `:80` pour http) ;
 *   - point final de l'hôte conservé (`exemple.fr.` reste distinct de `exemple.fr`) ;
 *   - segments `.` et `..` résolus dans le chemin ;
 *   - hôte non ASCII converti en punycode ;
 *   - caractères non ASCII du chemin et de la requête encodés en `%xx` majuscules (donc `é` et
 *     `%C3%A9` sont égaux), mais les `%xx` déjà présents ne sont jamais décodés ni leur casse
 *     changée (`%c3%a9` reste distinct de `%C3%A9`) ;
 *   - espaces et caractères de contrôle de tête et de fin retirés.
 * Conséquence de la règle 2 : `http://hôte:443/` devient `https://hôte/` (le port 443 est alors
 * le port par défaut du nouveau schéma).
 */

export const VERSION_NORMALISATION_URL = "normalisation-url-v1";

const PREFIXE_PARAMETRE_SUIVI = "utm_";

export class ErreurUrlIllisible extends Error {
  readonly url: string;

  constructor(url: string, cause: unknown) {
    super(`URL illisible : ${JSON.stringify(url)}`, { cause });
    this.name = "ErreurUrlIllisible";
    this.url = url;
  }
}

function lire(brut: string): URL {
  try {
    return new URL(brut);
  } catch (cause) {
    throw new ErreurUrlIllisible(brut, cause);
  }
}

function estParametreDeSuivi(parametre: string): boolean {
  const nom = parametre.split("=", 1)[0] ?? parametre;
  return nom.startsWith(PREFIXE_PARAMETRE_SUIVI);
}

/** Retire les `utm_*` sans toucher à l'ordre, à la casse ni à l'encodage des autres. */
function requeteSansSuivi(search: string): string {
  if (search === "") return "";
  return search
    .slice(1)
    .split("&")
    .filter((parametre) => !estParametreDeSuivi(parametre))
    .join("&");
}

function cheminSansBarreFinale(chemin: string): string {
  return chemin !== "/" && chemin.endsWith("/") ? chemin.slice(0, -1) : chemin;
}

/** Forme canonique d'une URL de sondage ; deux URL égales après elle sont « la même URL ». */
export function normaliserUrlSondage(brut: string): string {
  const url = lire(brut);
  if (url.protocol === "http:") url.protocol = "https:";
  url.hash = "";
  url.search = requeteSansSuivi(url.search);
  url.pathname = cheminSansBarreFinale(url.pathname);
  return url.href;
}
