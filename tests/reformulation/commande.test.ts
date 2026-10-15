/**
 * La commande `pnpm reformuler` de bout en bout, sur une racine temporaire et un `fetch` factice :
 * refus avant tout appel, reprise, plafond, secret de la clé, déterminisme du mode simulé.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commandeReformuler } from "../../pipeline/reformulation/commande.ts";
import { tachesDe } from "../../pipeline/reformulation/entrees.ts";
import { lirePropositions } from "../../pipeline/reformulation/staging.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { CANDIDATS, corpsChat, ecrireDonnees, instantane, ITEMS, MESURE_BUDGET, MESURE_JARDIN, racineDeTest } from "./aides.ts";

const DEPOT = resolve(import.meta.dirname, "../..");
const CLE = "cle-factice-9f8e7d6c5b4a";
const TACHES = tachesDe({ items: ITEMS, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: CANDIDATS });
const NOMBRE = TACHES.length;
const VISEE = ((): (typeof TACHES)[number] => {
  const [premiere] = TACHES;
  if (premiere === undefined) throw new Error("aucune tâche");
  return premiere;
})();

const repertoires: string[] = [];
function temporaire(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-reformuler-cmd-"));
  repertoires.push(chemin);
  return chemin;
}
function racine(options: Parameters<typeof racineDeTest>[0] = {}): string {
  const chemin = racineDeTest(options);
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

/* ------------------------------------------------------------- fetch factice */

/** Lit dans le prompt rendu ce qu'une sortie conforme doit recopier. */
function ligneDuPrompt(prompt: string, debut: string): string {
  const ligne = prompt.split("\n").find((une) => une.startsWith(debut));
  if (ligne === undefined) throw new Error(`ligne « ${debut} » absente du prompt`);
  return ligne.slice(debut.length);
}

function sortieDepuisPrompt(prompt: string): string {
  const neutre = ligneDuPrompt(prompt, "- Texte neutre : ");
  const position = ligneDuPrompt(prompt, "- Position que la prémisse orientée doit affirmer : ");
  const oriente = position === "AUCUNE" ? { texte: `Franchement, ${neutre}` } : { texte: `Franchement, ${neutre}`, position_affirmee: position };
  return JSON.stringify({ familier: { texte: `Dis, ${neutre}` }, oriente });
}

type Repondeur = (prompt: string, rang: number) => Response | Error;

const accepter: Repondeur = (prompt) => new Response(corpsChat(sortieDepuisPrompt(prompt)), { status: 200 });
const echouer: Repondeur = () => new Response('{"object":"error"}', { status: 500 });

interface Execution {
  readonly code: number;
  readonly sortie: string;
  readonly envois: number;
}

async function lancer(argv: readonly string[], repondre: Repondeur = accepter, env: Record<string, string> = { MISTRAL_API_KEY: CLE }): Promise<Execution> {
  let sortie = "";
  let envois = 0;
  const code = await commandeReformuler(argv, {
    env,
    envoi: (_url, init) => {
      const corps = JSON.parse(String(init.body)) as { messages: { content: string }[] };
      const [message] = corps.messages;
      if (message === undefined) throw new Error("requête sans message");
      const reponse = repondre(message.content, envois++);
      return reponse instanceof Error ? Promise.reject(reponse) : Promise.resolve(reponse);
    },
    maintenant: () => Date.parse("2026-11-02T09:15:00Z"),
    imprimer: (texte) => {
      sortie += texte;
    },
    temporaire,
    depot: DEPOT,
  });
  return { code, sortie, envois };
}

function reel(chemin: string, ...autres: string[]): readonly string[] {
  return [`--racine=${chemin}`, "--plafond=100", ...autres];
}

function propositionsDe(chemin: string): number {
  return TACHES.reduce((somme, tache) => somme + lirePropositions(join(chemin, "staging", "formulations"), tache.question.id).length, 0);
}

/* -------------------------------------------------------------- refus */

describe("cas limite 8 : configuration incomplète ⇒ refus avant tout appel", () => {
  it("valeur null ⇒ code 1, message nommant la clé, aucun appel", async () => {
    const chemin = racine({ configuration: { modele: "m", temperature: null, max_tokens: 10, random_seed: 1 } });
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/temperature : null/u);
  });

  it("clé manquante ou inconnue ⇒ code 1, message nommant la clé", async () => {
    const manquante = await lancer(reel(racine({ configuration: { modele: "m", temperature: 0, max_tokens: 10 } })));
    expect(manquante).toMatchObject({ code: 1, envois: 0 });
    expect(manquante.sortie).toMatch(/random_seed : absente/u);
    const inconnue = await lancer(reel(racine({ configuration: { modele: "m", temperature: 0, max_tokens: 10, random_seed: 1, top_k: 3 } })));
    expect(inconnue).toMatchObject({ code: 1, envois: 0 });
    expect(inconnue.sortie).toMatch(/top_k : clé inconnue/u);
  });
});

describe("cas limite 9 : mode réel sans clé ou sans plafond ; la clé n'est jamais écrite", () => {
  it("sans MISTRAL_API_KEY ⇒ code 1, aucun appel", async () => {
    const execution = await lancer(reel(racine()), accepter, {});
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/MISTRAL_API_KEY absente/u);
  });

  it("clé vide ⇒ code 1, aucun appel", async () => {
    expect(await lancer(reel(racine()), accepter, { MISTRAL_API_KEY: "" })).toMatchObject({ code: 1, envois: 0 });
  });

  it("sans --plafond ⇒ code 1, aucun appel", async () => {
    const execution = await lancer([`--racine=${racine()}`]);
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/--plafond=<n> est obligatoire/u);
  });

  it("plafond qui n'est pas un entier >= 1 ⇒ code 1", async () => {
    expect(await lancer([`--racine=${racine()}`, "--plafond=0"])).toMatchObject({ code: 1, envois: 0 });
    expect(await lancer([`--racine=${racine()}`, "--plafond=deux"])).toMatchObject({ code: 1, envois: 0 });
  });

  it("la clé factice n'apparaît dans aucun fichier écrit ni aucun message, même portée par une erreur", async () => {
    const chemin = racine();
    const execution = await lancer(reel(chemin), (prompt, rang) =>
      rang === 0 ? new TypeError(`échec imaginaire qui citerait Bearer ${CLE}`) : accepter(prompt, rang),
    );
    expect(execution.code).toBe(0);
    expect(execution.sortie).not.toContain(CLE);
    expect(execution.sortie).toContain("[clé masquée]");
    for (const [fichier, contenu] of instantane(chemin)) expect(contenu, fichier).not.toContain(CLE);
  });
});

describe("cas limite 11 : data/items vide", () => {
  it("message clair, code non nul, aucun appel", async () => {
    const execution = await lancer(reel(racine({ items: [] })));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/aucun item validé/u);
  });

  it("périmètre sans candidat : message clair, code non nul, aucun appel", async () => {
    const execution = await lancer(reel(racine({ candidats: [] })));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/aucun candidat dans le périmètre/u);
  });
});

/* ------------------------------------------------------------- appels */

describe("mode réel sur fetch factice", () => {
  it("une proposition par question, bilan imprimé", async () => {
    const chemin = racine();
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 0, envois: NOMBRE });
    expect(propositionsDe(chemin)).toBe(NOMBRE);
    expect(execution.sortie).toContain(`Appels faits : ${NOMBRE} (plafond 100)`);
    expect(execution.sortie).toContain(`  acceptées : ${NOMBRE}`);
  });

  it("--question vise une seule question ; une question inconnue est refusée", async () => {
    const chemin = racine();
    const [premiere] = TACHES;
    if (premiere === undefined) throw new Error("aucune tâche");
    expect(await lancer(reel(chemin, `--question=${premiere.question.id}`))).toMatchObject({ code: 0, envois: 1 });
    const inconnue = await lancer(reel(chemin, "--question=q_inconnue"));
    expect(inconnue).toMatchObject({ code: 1, envois: 0 });
  });

  it("--sortie est refusé en mode réel", async () => {
    expect(await lancer(reel(racine(), `--sortie=${temporaire()}`))).toMatchObject({ code: 1, envois: 0 });
  });

  it("cas limite 10 : plafond atteint ⇒ bilan juste", async () => {
    const execution = await lancer([`--racine=${racine()}`, "--plafond=2"]);
    expect(execution).toMatchObject({ code: 0, envois: 2 });
    expect(execution.sortie).toContain(`Questions non appelées, plafond atteint : ${NOMBRE - 2}`);
  });

  it("rejets comptés par motif dans le bilan", async () => {
    const execution = await lancer(reel(racine()), () => new Response(corpsChat("```json\n{}\n```"), { status: 200 }));
    expect(execution.sortie).toContain(`  rejetées : ${NOMBRE} (bloc_de_code ${NOMBRE})`);
  });
});

/* -------------------------------------------------------------- reprise */

describe("cas limite 7 : reprise", () => {
  it("acceptée sur le même texte neutre ⇒ pas d'appel ; fichiers inchangés", async () => {
    const chemin = racine();
    await lancer(reel(chemin));
    const avant = instantane(chemin);
    const seconde = await lancer(reel(chemin));
    expect(seconde).toMatchObject({ code: 0, envois: 0 });
    expect(seconde.sortie).toContain(`déjà acceptées ${NOMBRE}`);
    expect(instantane(chemin)).toEqual(avant);
  });

  it("acceptée sur un AUTRE texte neutre ⇒ nouvel appel, anciens fichiers intacts", async () => {
    const chemin = racine();
    await lancer(reel(chemin));
    const avant = instantane(chemin);
    const renomme = CANDIDATS.map((candidat) => (candidat.candidat_id === "demo-alpha" ? { ...candidat, libelle: "Hélène Durand-Aubry-Autre" } : candidat));
    ecrireDonnees(chemin, { candidats: renomme });
    const touchees = tachesDe({ items: ITEMS, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: renomme }).filter(
      (tache) => tache.question.candidat_id === "demo-alpha",
    ).length;
    const seconde = await lancer(reel(chemin));
    expect(seconde).toMatchObject({ code: 0, envois: touchees });
    const apres = instantane(chemin);
    for (const [fichier, contenu] of avant) {
      if (!fichier.startsWith("config")) expect(apres.get(fichier), fichier).toBe(contenu);
    }
  });

  it("seulement des rejets ou des échecs ⇒ nouvel appel", async () => {
    const chemin = racine();
    await lancer(reel(chemin), echouer);
    const seconde = await lancer(reel(chemin));
    expect(seconde).toMatchObject({ code: 0, envois: NOMBRE });
    expect(propositionsDe(chemin)).toBe(2 * NOMBRE);
  });
});

describe("cas limites 15 à 17 : formulations validées et refus du relecteur", () => {

  function ecrireValidee(chemin: string, empreinte: string): void {
    mkdirSync(join(chemin, "data", "formulations"), { recursive: true });
    writeFileSync(
      join(chemin, "data", "formulations", `${VISEE.question.id}.json`),
      JSON.stringify({ question_id: VISEE.question.id, empreinte_texte_neutre: empreinte }),
    );
  }

  it("15 : déjà dans data/formulations avec la même empreinte ⇒ pas d'appel, compté « déjà validée »", async () => {
    const chemin = racine();
    ecrireValidee(chemin, sha256(VISEE.question.texte_neutre));
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 0, envois: NOMBRE - 1 });
    expect(execution.sortie).toContain("déjà validées 1");
  });

  it("15 : dans data/formulations avec une autre empreinte ⇒ appel", async () => {
    const chemin = racine();
    ecrireValidee(chemin, "0".repeat(64));
    expect(await lancer(reel(chemin))).toMatchObject({ code: 0, envois: NOMBRE });
  });

  it("15 : data/formulations illisible ⇒ erreur nommée, aucun appel", async () => {
    const chemin = racine();
    mkdirSync(join(chemin, "data", "formulations"), { recursive: true });
    writeFileSync(join(chemin, "data", "formulations", `${VISEE.question.id}.json`), "{");
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/formulations validées illisibles/u);
  });

  it("16 : acceptée puis refusée à la relecture ⇒ nouvel appel", async () => {
    const chemin = racine();
    await lancer(reel(chemin, `--question=${VISEE.question.id}`));
    const [acceptee] = lirePropositions(join(chemin, "staging", "formulations"), VISEE.question.id);
    if (acceptee === undefined) throw new Error("aucune proposition");
    mkdirSync(join(chemin, "validation", "formulations"), { recursive: true });
    writeFileSync(join(chemin, "validation", "formulations", "refus.jsonl"), `${JSON.stringify({ proposition_id: acceptee.id })}\n`);
    expect(await lancer(reel(chemin, `--question=${VISEE.question.id}`))).toMatchObject({ code: 0, envois: 1 });
  });

  it("17 : refus.jsonl dont une ligne est illisible ⇒ erreur nommée avant tout appel", async () => {
    const chemin = racine();
    mkdirSync(join(chemin, "validation", "formulations"), { recursive: true });
    writeFileSync(join(chemin, "validation", "formulations", "refus.jsonl"), "pas du json\n");
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/refus\.jsonl, ligne 1 : journal des refus illisible/u);
  });
});

/* ---------------------------------------------------------------- simulé */

function sansIdNiDate(chemin: string): readonly string[] {
  return TACHES.flatMap((tache) =>
    lirePropositions(chemin, tache.question.id).map((proposition) => {
      const { id: _id, appel, ...reste } = proposition;
      const { date: _date, ...appelSansDate } = appel;
      return JSON.stringify({ ...reste, appel: appelSansDate });
    }),
  );
}

describe("mode simulé", () => {
  it("cas limite 14 : deux exécutions identiques sur un staging vide ⇒ mêmes contenus hors id et date", async () => {
    const chemin = racine();
    const premiere = temporaire();
    const seconde = temporaire();
    expect(await lancer(["--simule", `--racine=${chemin}`, `--sortie=${premiere}`], echouer, {})).toMatchObject({ code: 0, envois: 0 });
    expect(await lancer(["--simule", `--racine=${chemin}`, `--sortie=${seconde}`], echouer, {})).toMatchObject({ code: 0 });
    const contenus = sansIdNiDate(premiere);
    expect(contenus).toHaveLength(NOMBRE);
    expect(sansIdNiDate(seconde)).toEqual(contenus);
  });

  it("n'exige ni clé, ni plafond, ni configuration remplie, et n'appelle jamais fetch", async () => {
    const chemin = racine({ configuration: { modele: null } });
    const execution = await lancer(["--simule", `--racine=${chemin}`, `--sortie=${temporaire()}`], echouer, {});
    expect(execution).toMatchObject({ code: 0, envois: 0 });
    expect(execution.sortie).toContain("mode simulé");
  });

  it("refuse d'écrire sous le staging/ du dépôt", async () => {
    const execution = await lancer(["--simule", `--racine=${racine()}`, `--sortie=${join(DEPOT, "staging", "formulations")}`], echouer, {});
    expect(execution.code).toBe(1);
    expect(execution.sortie).toMatch(/jamais écrite/u);
  });

  it("sans --sortie : un répertoire temporaire neuf, hors du dépôt", async () => {
    const execution = await lancer(["--simule", `--racine=${racine()}`], echouer, {});
    expect(execution.code).toBe(0);
    expect(execution.sortie).toContain("banc-reformuler-cmd-");
  });
});
