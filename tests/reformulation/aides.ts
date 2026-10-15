/**
 * Aides des tests de `pnpm reformuler` : une racine temporaire (data/, config/, validation/), un
 * transport et un `fetch` factices qui répondent comme l'API de chat, sans réseau.
 *
 * Aucun candidat réel : libellés et identifiants ouvertement fictifs.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import type { ReponseHttp, RequeteHttp, Transport } from "../../pipeline/interrogation/editeur.ts";
import { ErreurReseau } from "../../pipeline/interrogation/editeur.ts";
import type { CandidatNomme, Item, Mesure } from "../../pipeline/questions/types.ts";
import type { DemandeReformulation } from "../../pipeline/reformulation/demande.ts";
import { AUCUNE } from "../../pipeline/reformulation/position-affirmee.ts";
import { itemPromu } from "../aides/data.ts";
import { mesure as mesureValidee } from "../aides/fabriques.ts";
import { itemA, itemP, mesure, nomme } from "../questions/fabriques.ts";

export const LIBELLE = "Hélène Durand-Aubry";
export const CANDIDATS: readonly CandidatNomme[] = [
  nomme("demo-alpha", LIBELLE, "Durand-Aubry"),
  nomme("demo-beta", "Basile Fictif", "Fictif"),
];
export const CONFIGURATION = { modele: "modele-de-test-2026-01", temperature: 0.2, max_tokens: 900, random_seed: 11 };

/** Une mesure telle que `data/mesures/` la porte, avec l'historique qu'exige `mesure.schema.json`. */
function mesurePubliee(options: Parameters<typeof mesure>[0]): Mesure {
  return mesureValidee({ ...mesure(options) });
}

export const MESURE_BUDGET: Mesure = mesurePubliee({ cle: "reformuler-budget", formulation_canonique: "le budget" });
export const MESURE_JARDIN: Mesure = mesurePubliee({
  cle: "reformuler-jardin",
  formulation_canonique: "la création d’un jardin partagé",
  theme: "education",
});

/**
 * Un item tel que `data/items/` le porte : les validations et l'historique d'un item promu (exigés
 * par `item.schema.json` pour un item vérifié), que les fabriques du lot questions laissent vides.
 */
export function promu(item: Item): Item {
  const { validations, historique } = itemPromu();
  if (validations === undefined || historique === undefined) throw new Error("item promu sans validations ni historique");
  return { ...item, validations, historique };
}

/** Un item P « contre » et un item A : des questions qui affirment une position, d'autres AUCUNE. */
export const ITEMS: readonly Item[] = [
  promu(itemP({ cle: "reformuler-p", candidat_id: "demo-alpha", mesure: MESURE_BUDGET, position: "contre" })),
  promu(itemA({ cle: "reformuler-a", candidat_id: "demo-beta", mesure: MESURE_JARDIN })),
];

/* ------------------------------------------------------------ sortie du modèle */

/** Une sortie conforme au contrat du prompt, faite du texte neutre (il passe le contrôle). */
export function sortieConforme(demande: DemandeReformulation): string {
  const position = demande.position_affirmee === AUCUNE ? {} : { position_affirmee: demande.position_affirmee };
  return JSON.stringify({
    familier: { texte: `Dis, ${demande.texte_neutre}` },
    oriente: { texte: `Franchement, ${demande.texte_neutre}`, ...position },
  });
}

/** Un corps de l'API de chat dont `choices[0].message.content` vaut `content`. */
export function corpsChat(content: unknown): string {
  return JSON.stringify({
    id: "cmpl-test",
    object: "chat.completion",
    created: 1,
    model: CONFIGURATION.modele,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

/** Le prompt envoyé dans une requête de chat. */
export function promptDe(requete: RequeteHttp): string {
  const messages = requete.corps["messages"] as readonly { readonly content: string }[];
  const [premier] = messages;
  if (premier === undefined) throw new Error("requête sans message");
  return premier.content;
}

/* ------------------------------------------------------------------ transport */

export type Reponse = ReponseHttp | ErreurReseau;

export function reponse(statut: number, corps: string | Uint8Array): ReponseHttp {
  return { statut, corps: typeof corps === "string" ? new TextEncoder().encode(corps) : corps };
}

export class TransportFactice implements Transport {
  readonly envois: RequeteHttp[] = [];
  readonly rendues: ReponseHttp[] = [];
  private readonly repondre: (requete: RequeteHttp) => Reponse;

  constructor(repondre: (requete: RequeteHttp) => Reponse) {
    this.repondre = repondre;
  }

  envoyer(requete: RequeteHttp): Promise<ReponseHttp> {
    this.envois.push(requete);
    const issue = this.repondre(requete);
    if (issue instanceof ErreurReseau) return Promise.reject(issue);
    this.rendues.push(issue);
    return Promise.resolve(issue);
  }
}

/* ---------------------------------------------------------------- racine */

const PERIMETRE_DU_DEPOT = resolve(import.meta.dirname, "../../config/perimetre.yaml");

/** Le périmètre du dépôt (un brouillon conforme), ses candidats remplacés. */
export function perimetreYaml(candidats: readonly CandidatNomme[]): string {
  const brouillon = parse(readFileSync(PERIMETRE_DU_DEPOT, "utf8")) as Record<string, unknown>;
  const saisis = candidats.map((candidat) => ({ ...candidat, statut_au_gel: "actif", interroge: true, contact_notification: null }));
  return stringify({ ...brouillon, candidats: saisis });
}

export interface OptionsRacine {
  readonly items?: readonly Item[];
  readonly mesures?: readonly Mesure[];
  readonly candidats?: readonly CandidatNomme[];
  readonly configuration?: unknown;
}

function ecrireJson(chemin: string, valeur: unknown): void {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

export function ecrireDonnees(racine: string, options: OptionsRacine): void {
  const items = options.items === undefined ? ITEMS : options.items;
  const mesures = options.mesures === undefined ? [MESURE_BUDGET, MESURE_JARDIN] : options.mesures;
  const candidats = options.candidats === undefined ? CANDIDATS : options.candidats;
  for (const repertoire of ["data/items", "data/mesures", "config"]) mkdirSync(join(racine, repertoire), { recursive: true });
  for (const item of items) ecrireJson(join(racine, "data", "items", `${item.id}.json`), item);
  for (const une of mesures) ecrireJson(join(racine, "data", "mesures", `${une.id}.json`), une);
  writeFileSync(join(racine, "config", "perimetre.yaml"), perimetreYaml(candidats), "utf8");
  ecrireJson(join(racine, "config", "reformulation.json"), options.configuration === undefined ? CONFIGURATION : options.configuration);
}

export function racineDeTest(options: OptionsRacine = {}): string {
  const racine = mkdtempSync(join(tmpdir(), "banc-reformuler-test-"));
  ecrireDonnees(racine, options);
  return racine;
}

/** Tous les fichiers sous `racine`, chemin relatif → contenu, en ordre de chemin. */
export function instantane(racine: string): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  const parcourir = (relatif: string): void => {
    const absolu = join(racine, relatif);
    if (statSync(absolu).isDirectory()) {
      for (const nom of readdirSync(absolu).sort()) parcourir(join(relatif, nom));
      return;
    }
    table.set(relatif, readFileSync(absolu, "utf8"));
  };
  parcourir("");
  return table;
}
