/**
 * L'adaptateur de l'API de chat de Mistral, pour le modèle de reformulation (D42 (1) : Mistral
 * Large, version épinglée par l'auteur dans `config/reformulation.json`).
 *
 * Requête : `POST https://api.mistral.ai/v1/chat/completions`, en-tête `Authorization: Bearer
 * <clé>`, corps `{model, messages: [{role: "user", content: <prompt rendu>}], temperature,
 * max_tokens, random_seed}`. Le prompt est le seul message : aucune instruction système, aucun
 * autre paramètre que ceux de la configuration.
 *
 * Réponse : le texte du modèle est `choices[0].message.content`, quand c'est une chaîne. Toute
 * autre forme — `choices` absent ou vide, `message` absent, `content` nul, liste de morceaux ou
 * autre — ne donne pas de texte : la proposition est rejetée `corps_illisible`, le corps gardé tel
 * quel. Aucune forme n'est devinée ni recomposée.
 *
 * Forme vérifiée le 2026-10-15 sur la référence publique de l'API (docs.mistral.ai, point d'accès
 * chat) pour la requête et l'enveloppe ; le type exact de `message.content` n'y était pas déplié,
 * d'où le refus de tout ce qui n'est pas une chaîne.
 */

import { estObjetJson, type Contenu, type RequeteHttp } from "../interrogation/editeur.ts";
import type { ConfigurationReformulation } from "./configuration.ts";
import type { AdaptateurReformulation, LectureTexteModele } from "./editeur.ts";

export const ENDPOINT_MISTRAL = "https://api.mistral.ai/v1/chat/completions";

/** Un accès qui dit où il échoue : la raison devient le détail du rejet `corps_illisible`. */
function suivre(racine: unknown, chemin: readonly (string | number)[]): LectureTexteModele {
  let courant: unknown = racine;
  const parcouru: string[] = [];
  for (const pas of chemin) {
    parcouru.push(typeof pas === "number" ? `[${pas}]` : `.${pas}`);
    courant = typeof pas === "number" ? elementDe(courant, pas) : champDe(courant, pas);
    if (courant === undefined) return { lisible: false, raison: `corps${parcouru.join("")} absent.` };
  }
  if (typeof courant !== "string") {
    return { lisible: false, raison: `corps${parcouru.join("")} n'est pas un texte (${courant === null ? "null" : typeof courant}).` };
  }
  return { lisible: true, texte: courant };
}

function champDe(valeur: unknown, cle: string): unknown {
  return estObjetJson(valeur) && Object.hasOwn(valeur, cle) ? valeur[cle] : undefined;
}

function elementDe(valeur: unknown, rang: number): unknown {
  return Array.isArray(valeur) ? (valeur as readonly unknown[])[rang] : undefined;
}

/** L'enveloppe d'une API de chat : `choices[0].message.content`, une chaîne, rien d'autre. */
export function texteDuChat(contenu: Contenu): LectureTexteModele {
  if (contenu.forme === "texte") return { lisible: false, raison: "réponse 2xx dont le corps n'est pas un objet JSON." };
  return suivre(contenu.brut, ["choices", 0, "message", "content"]);
}

export function adaptateurMistral(configuration: ConfigurationReformulation, cle_api: string): AdaptateurReformulation {
  if (cle_api.length === 0) throw new Error("Clé d'API Mistral vide : aucun appel n'est construit.");
  return {
    modele: configuration.modele,
    construireRequete: (prompt: string): RequeteHttp => ({
      endpoint: ENDPOINT_MISTRAL,
      entetes: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${cle_api}` },
      corps: {
        model: configuration.modele,
        messages: [{ role: "user", content: prompt }],
        temperature: configuration.temperature,
        max_tokens: configuration.max_tokens,
        random_seed: configuration.random_seed,
      },
    }),
    texteDuModele: texteDuChat,
  };
}
