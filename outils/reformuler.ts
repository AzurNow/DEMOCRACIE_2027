/**
 * `pnpm reformuler` — propose les formulations familière et orientée de chaque question engendrée
 * depuis `data/` qui n'en a pas encore d'acceptée sur son texte neutre courant (D39, D42).
 *
 *   MISTRAL_API_KEY=… pnpm reformuler --plafond=<n> [--question=<id>]   appel réel, lancé par l'auteur
 *   pnpm reformuler --simule [--sortie=<chemin>] [--question=<id>]       sans réseau
 *
 * Écrit un fichier par réponse HTTP reçue sous `staging/formulations/<question_id>/` (mode réel), ou
 * hors du dépôt (mode simulé). Jamais dans `data/` : la relecture et la promotion appartiennent à
 * l'interface de validation. Toute la logique vit dans `pipeline/reformulation/commande.ts`.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { horlogeSysteme } from "../pipeline/interrogation/horloge.ts";
import { commandeReformuler } from "../pipeline/reformulation/commande.ts";

process.exitCode = await commandeReformuler(process.argv.slice(2), {
  env: process.env,
  envoi: (url, init) => fetch(url, init),
  maintenant: () => Date.now(),
  attendre: (ms, signal) => horlogeSysteme.attendre(ms, signal),
  imprimer: (texte) => process.stdout.write(texte),
  temporaire: () => mkdtempSync(join(tmpdir(), "banc-reformuler-")),
  depot: resolve(import.meta.dirname, ".."),
});
