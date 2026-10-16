/**
 * `pnpm extraire` — extraction double de chaque source préparée par `pnpm extraction:entrees`
 * (§4, décisions D52 et D53).
 *
 *   ANTHROPIC_API_KEY=… MISTRAL_API_KEY=… pnpm extraire --plafond=<n> [--source=<cle_source>/<sha256>]
 *   pnpm extraire --simule [--sortie=<chemin>] [--source=<cle_source>/<sha256>]
 *
 * Écrit sous `staging/` (mode réel) ou hors du dépôt (mode simulé) : réponses brutes, items,
 * mesures proposées et journal de chaque source. Jamais dans `data/` : la validation et la
 * promotion appartiennent à l'interface de validation. Toute la logique vit dans
 * `pipeline/extraction/commande.ts`.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { arbreDuCodePropre, commitCourant } from "./garde-fous-git.ts";
import { horlogeSysteme } from "../pipeline/interrogation/horloge.ts";
import { commandeExtraire } from "../pipeline/extraction/commande.ts";
import { choixParEmpreinte } from "../pipeline/extraction/editeur-simule.ts";
import { ulid } from "../validation/domaine/ulid.ts";

const depot = resolve(import.meta.dirname, "..");

process.exitCode = await commandeExtraire(process.argv.slice(2), {
  env: process.env,
  envoi: (url, init) => fetch(url, init),
  maintenant: () => Date.now(),
  nouvelUlid: () => ulid(),
  attendre: (ms, signal) => horlogeSysteme.attendre(ms, signal),
  imprimer: (texte) => process.stdout.write(texte),
  temporaire: () => mkdtempSync(join(tmpdir(), "banc-extraire-")),
  depot,
  commit: () => commitCourant(depot),
  arbreDuCodePropre: () => arbreDuCodePropre(depot),
  choixSimule: choixParEmpreinte,
});
