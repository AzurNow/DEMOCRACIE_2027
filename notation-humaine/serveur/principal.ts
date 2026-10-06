/**
 * Serveur local de l'écran de notation humaine (§7 ; D18).
 *
 * Mêmes propriétés que celui de l'interface de validation, vérifiées par les tests : écoute sur
 * 127.0.0.1 seulement, aucune origine externe, identité lue dans l'environnement. Il ne démarre pas
 * seul : `outils/notation-humaine.ts` le lance, et les tests importent `creerServeur` sans port.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { creerContexte, type Contexte, type OptionsContexte } from "./contexte.ts";
import { CorpsIllisible, lireCorps, repondre, servirStatique, type Reponse } from "./http.ts";
import { trouverRoute } from "./routes.ts";

export const ADRESSE = "127.0.0.1";
const DOSSIER_CLIENT = resolve(import.meta.dirname, "../client");

export function creerServeur(contexte: Contexte): Server {
  return createServer((requete, reponse) => {
    traiter(contexte, requete, reponse).catch((erreur: unknown) => repondre(reponse, erreurInattendue(erreur)));
  });
}

/**
 * Une erreur que personne n'a prévue : son **nom** est rendu, son message va à la console du serveur
 * seulement. Le message d'une incohérence de la file peut nommer d'autres annotateurs ; il ne sort
 * jamais vers l'écran (D18).
 */
function erreurInattendue(erreur: unknown): Reponse {
  const nom = erreur instanceof Error ? erreur.name : "Erreur";
  process.stderr.write(`${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}\n`);
  return { statut: 500, corps: { erreur: nom, detail: "Voir la console du serveur." } };
}

async function traiter(contexte: Contexte, requete: IncomingMessage, reponse: ServerResponse): Promise<void> {
  const chemin = new URL(requete.url ?? "/", `http://${ADRESSE}`).pathname;
  const methode = requete.method ?? "GET";
  const trouvee = trouverRoute(methode, chemin);
  if (trouvee === null) {
    repondre(reponse, servirStatique(DOSSIER_CLIENT, chemin));
    return;
  }
  repondre(reponse, await executer(contexte, requete, methode, trouvee));
}

async function executer(contexte: Contexte, requete: IncomingMessage, methode: string, trouvee: NonNullable<ReturnType<typeof trouverRoute>>): Promise<Reponse> {
  try {
    const corps = methode === "POST" ? await lireCorps(requete) : null;
    return trouvee.route.gestionnaire(contexte, trouvee.params, corps);
  } catch (erreur) {
    if (erreur instanceof CorpsIllisible) return { statut: 400, corps: { erreur: erreur.name, detail: erreur.message } };
    throw erreur;
  }
}

export interface OptionsDemarrage extends OptionsContexte {
  readonly port: number;
}

export function demarrer(options: OptionsDemarrage): Server {
  const contexte = creerContexte(options);
  const serveur = creerServeur(contexte);
  serveur.listen(options.port, ADRESSE, () => {
    process.stdout.write(
      `Notation humaine — annotateur ${contexte.annotateur_id}\n` +
        `  run     : ${options.repertoire_run} (${contexte.donnees.run.id})\n` +
        `  items   : ${options.repertoire_items}\n` +
        `  http://${ADRESSE}:${options.port}/\n`,
    );
  });
  return serveur;
}
