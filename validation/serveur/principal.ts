/**
 * Serveur local de l'interface de validation.
 *
 * Trois propriétés tenues ici, et vérifiées par les tests :
 *
 * - **Écoute sur 127.0.0.1 seulement.** Pas de `0.0.0.0` : l'outil ne doit pas être joignable
 *   depuis le réseau, même par accident, même le temps d'un essai.
 * - **Aucune origine externe.** La politique de sécurité de contenu n'autorise que `'self'`,
 *   il n'y a ni police distante, ni CDN, ni télémétrie. Le projet interdit tout appel réseau
 *   sortant ; l'interface n'en émet aucun, et s'en prive par déclaration autant que par code.
 * - **L'identité vient de l'environnement**, lue une fois au démarrage.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { configurationDepuisEnvironnement, creerContexte, type Contexte } from "./contexte.ts";
import { trouverRoute, type Reponse } from "./routes.ts";

const ADRESSE = "127.0.0.1";

const POLITIQUE_SECURITE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "frame-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
].join("; ");

const TYPES_STATIQUES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export function demarrer(port: number): void {
  const racine = resolve(import.meta.dirname, "../..");
  const contexte = creerContexte(configurationDepuisEnvironnement(process.env, racine));
  const serveur = createServer((requete, reponse) => {
    traiter(contexte, racine, requete, reponse).catch((erreur: unknown) => {
      repondre(reponse, { statut: 500, corps: { erreur: String(erreur) } });
    });
  });

  serveur.listen(port, ADRESSE, () => {
    process.stdout.write(
      `Validation — annotateur ${contexte.annotateur_id}\n` +
        `  staging   : ${contexte.configuration.racine_staging}\n` +
        `  décisions : ${contexte.configuration.repertoire_decisions}\n` +
        `  http://${ADRESSE}:${port}/\n`,
    );
  });
}

async function traiter(
  contexte: Contexte,
  racine: string,
  requete: IncomingMessage,
  reponse: ServerResponse,
): Promise<void> {
  const chemin = new URL(requete.url ?? "/", `http://${ADRESSE}`).pathname;
  const methode = requete.method ?? "GET";

  const trouvee = trouverRoute(methode, chemin);
  if (trouvee !== null) {
    const corps = methode === "POST" ? await lireCorps(requete) : null;
    repondre(reponse, trouvee.route.gestionnaire(contexte, trouvee.params, corps));
    return;
  }

  repondre(reponse, servirStatique(racine, chemin));
}

async function lireCorps(requete: IncomingMessage): Promise<unknown> {
  const morceaux: Buffer[] = [];
  for await (const morceau of requete) morceaux.push(morceau as Buffer);
  const texte = Buffer.concat(morceaux).toString("utf8");
  return texte.length === 0 ? null : JSON.parse(texte);
}

function servirStatique(racine: string, chemin: string): Reponse {
  const relatif = chemin === "/" ? "index.html" : chemin.replace(/^\/+/, "");
  const complet = join(racine, "validation/client", relatif);
  if (!complet.startsWith(join(racine, "validation/client")) || !existsSync(complet)) {
    return { statut: 404, corps: { erreur: `Introuvable : ${chemin}` } };
  }
  return {
    statut: 200,
    binaire: readFileSync(complet),
    type_mime: TYPES_STATIQUES[extname(complet)] ?? "application/octet-stream",
  };
}

function repondre(reponse: ServerResponse, resultat: Reponse): void {
  const entetes: Record<string, string> = {
    "content-security-policy": POLITIQUE_SECURITE,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  };

  if (resultat.binaire !== undefined) {
    reponse.writeHead(resultat.statut, {
      ...entetes,
      "content-type": resultat.type_mime ?? "application/octet-stream",
    });
    reponse.end(resultat.binaire);
    return;
  }

  if (resultat.corps === undefined) {
    reponse.writeHead(resultat.statut, entetes);
    reponse.end();
    return;
  }

  reponse.writeHead(resultat.statut, { ...entetes, "content-type": "application/json; charset=utf-8" });
  reponse.end(JSON.stringify(resultat.corps));
}

// Démarrage seulement en exécution directe : les tests importent ce module pour comparer la
// table de routes du serveur à celle qu'ils énumèrent, sans ouvrir de port.
const lanceDirectement =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename);
if (lanceDirectement) {
  demarrer(Number(process.env["PORT"] ?? 4173));
}
