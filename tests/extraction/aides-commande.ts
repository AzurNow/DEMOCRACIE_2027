/**
 * Aides des tests de `pnpm extraire` (`pipeline/extraction/commande.ts`) : une racine temporaire
 * dont le `staging/` porte ce que `pnpm extraction:entrees` et `pnpm textes` y auraient laissé, un
 * `fetch` factice par éditeur, des ports déterministes. Tout est fictif : candidat `candidat-a`,
 * textes inventés, URL en `.invalid`, clés factices.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { Dependances } from "../../pipeline/extraction/commande.ts";
import { commandeExtraire } from "../../pipeline/extraction/commande.ts";
import { ENDPOINT_ANTHROPIC } from "../../pipeline/extraction/editeur-anthropic.ts";
import type { IssueSimulee } from "../../pipeline/extraction/editeur-simule.ts";
import type { ExtracteurEpingle } from "../../pipeline/extraction/choix-texte.ts";
import type { NomEditeur } from "../../pipeline/extraction/editeur.ts";
import type { IssueAttente } from "../../pipeline/interrogation/horloge.ts";
import { CANDIDAT, COMMIT, HTML, MODELE_A, MODELE_B, SHA_SOURCE, fiche, sha256Texte, sourceHtml } from "./aides.ts";

export const CLE_SOURCE = "c".repeat(64);
export const CLE = `${CLE_SOURCE}/${SHA_SOURCE}`;
export const CLE_ANTHROPIC = "cle-factice-anthropic-7a6b5c";
export const CLE_MISTRAL = "cle-factice-mistral-1d2e3f";
export const ENV = { ANTHROPIC_API_KEY: CLE_ANTHROPIC, MISTRAL_API_KEY: CLE_MISTRAL };
export const TEXTE = "Nous ouvrirons les centres de santé le dimanche.\nUne seconde phrase du document de démonstration.";
export const CITATION = "Nous ouvrirons les centres de santé le dimanche.";
export const INSTANT_MS = Date.parse("2026-10-16T10:00:00Z");

const repertoires: string[] = [];

export function temporaire(prefixe = "banc-extraire-test-"): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  repertoires.push(chemin);
  return chemin;
}

export function nettoyer(): void {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
}

function ecrire(chemin: string, contenu: string): void {
  mkdirSync(join(chemin, ".."), { recursive: true });
  writeFileSync(chemin, contenu);
}

export const CONFIGURATION_COMPLETE = {
  extracteurs: [
    { editeur: "anthropic", modele: MODELE_A, max_tokens: 4096, effort: "high", delai_abandon_ms: 60000 },
    { editeur: "mistral", modele: MODELE_B, temperature: 0, max_tokens: 4096, random_seed: 7, delai_abandon_ms: 60000 },
  ],
};

export interface OptionsSource {
  readonly texte?: string;
  /** Extracteur inscrit dans l'entrée (l'épinglé). */
  readonly epingle?: ExtracteurEpingle;
  /** Extracteurs des fiches présentes, une fiche chacun (textes distincts au-delà du premier). */
  readonly fiches?: readonly ExtracteurEpingle[];
  /** Octets écrits sous le nom du texte, s'ils diffèrent du texte. */
  readonly texte_ecrit?: string;
}

/** Une racine de test : `staging/` d'une source HTML prête, et `config/extraction.json` complète. */
export function racineDeTest(options: OptionsSource = {}): string {
  const racine = temporaire("banc-extraire-racine-");
  const texte = options.texte ?? TEXTE;
  const fiches = options.fiches ?? [HTML];
  const staging = join(racine, "staging");
  const sources: Record<string, unknown> = {};
  fiches.forEach((extracteur, rang) => {
    const texteDeLaFiche = rang === 0 ? texte : `${texte}\nVariante ${rang}.`;
    const sha = sha256Texte(texteDeLaFiche);
    ecrire(join(staging, "textes", `${sha}.txt`), rang === 0 && options.texte_ecrit !== undefined ? options.texte_ecrit : texteDeLaFiche);
    const contenu = fiche(texteDeLaFiche, extracteur, { encodage: { nom: "utf-8", origine: "content-type" } });
    ecrire(join(staging, "extractions", SHA_SOURCE, `${sha}.json`), `${JSON.stringify(contenu, null, 2)}\n`);
    sources[sha] = sourceHtml(texteDeLaFiche);
  });
  const entree = { cle_source: CLE_SOURCE, sha256_source: SHA_SOURCE, candidat_id: CANDIDAT, extracteur_epingle: options.epingle ?? HTML, sources };
  ecrire(join(staging, "entrees-extraction", CLE_SOURCE, `${SHA_SOURCE}.json`), `${JSON.stringify(entree, null, 2)}\n`);
  ecrire(join(racine, "config", "extraction.json"), `${JSON.stringify(CONFIGURATION_COMPLETE, null, 2)}\n`);
  return racine;
}

/* ------------------------------------------------------------- fetch factice */

export function sortieConforme(citation = CITATION): string {
  return JSON.stringify({
    items: [
      {
        type: "P",
        candidat_id: CANDIDAT,
        mesure_proposee: { libelle: "Ouvrir les centres de santé le dimanche", theme: "sante" },
        position: "pour",
        citation_verbatim: citation,
        paraphrase: "Ouvrir les centres de santé le dimanche.",
      },
    ],
  });
}

export function corpsAnthropic(texte: string, stop_reason = "end_turn"): string {
  return JSON.stringify({ type: "message", role: "assistant", model: MODELE_A, content: [{ type: "text", text: texte }], stop_reason });
}

export function corpsMistral(texte: string, finish_reason = "stop"): string {
  return JSON.stringify({ object: "chat.completion", model: MODELE_B, choices: [{ index: 0, message: { role: "assistant", content: texte }, finish_reason }] });
}

/** Ce que rend le serveur factice pour un éditeur : une réponse, ou un échec de transport. */
export type Repondeur = (editeur: NomEditeur) => Response | Error;

export const repondreConforme: Repondeur = (editeur) =>
  new Response(editeur === "anthropic" ? corpsAnthropic(sortieConforme()) : corpsMistral(sortieConforme()), { status: 200 });

export interface Execution {
  readonly code: number;
  readonly sortie: string;
  readonly envois: readonly NomEditeur[];
  readonly corps_envoyes: readonly string[];
}

export function jamaisEcoulee(_ms: number, signal: AbortSignal): Promise<IssueAttente> {
  return new Promise((resoudre) => signal.addEventListener("abort", () => resoudre("annulee"), { once: true }));
}

export interface OptionsLancement {
  readonly repondre?: Repondeur;
  readonly env?: Readonly<Record<string, string>>;
  readonly issues?: Readonly<Record<NomEditeur, IssueSimulee>>;
  readonly propre?: boolean;
  readonly depot?: string;
  readonly temporaire?: () => string;
  readonly attendre?: Dependances["attendre"];
}

export async function lancer(argv: readonly string[], options: OptionsLancement = {}): Promise<Execution> {
  let sortie = "";
  let rang = 0;
  const envois: NomEditeur[] = [];
  const corps_envoyes: string[] = [];
  const repondre = options.repondre ?? repondreConforme;
  const issues = options.issues ?? { anthropic: "conforme", mistral: "conforme" };
  const code = await commandeExtraire(argv, {
    env: options.env ?? ENV,
    envoi: (url, init) => {
      const editeur: NomEditeur = url === ENDPOINT_ANTHROPIC ? "anthropic" : "mistral";
      envois.push(editeur);
      corps_envoyes.push(`${JSON.stringify(init.headers)} ${String(init.body)}`);
      const reponse = repondre(editeur);
      return reponse instanceof Error ? Promise.reject(reponse) : Promise.resolve(reponse);
    },
    maintenant: () => INSTANT_MS,
    nouvelUlid: () => {
      rang += 1;
      return `01J${String(rang).padStart(23, "0")}`;
    },
    attendre: options.attendre ?? jamaisEcoulee,
    imprimer: (texte) => {
      sortie += texte;
    },
    temporaire: options.temporaire ?? (() => temporaire("banc-extraire-sortie-")),
    depot: options.depot ?? temporaire("banc-extraire-depot-"),
    commit: () => COMMIT,
    arbreDuCodePropre: () => options.propre ?? true,
    choixSimule: (enveloppe) => () => issues[enveloppe],
  });
  return { code, sortie, envois, corps_envoyes };
}

/* ------------------------------------------------------------------ lecture */

/** Chemin relatif → octets, de tous les fichiers sous `racine`. */
export function instantane(racine: string): ReadonlyMap<string, string> {
  const fichiers = new Map<string, string>();
  const parcourir = (repertoire: string): void => {
    for (const nom of readdirSync(repertoire).sort()) {
      const chemin = join(repertoire, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else fichiers.set(relative(racine, chemin), readFileSync(chemin, "utf8"));
    }
  };
  parcourir(racine);
  return fichiers;
}

export function cheminsSous(racine: string, prefixe: string): readonly string[] {
  return [...instantane(racine).keys()].filter((chemin) => chemin.startsWith(prefixe));
}
