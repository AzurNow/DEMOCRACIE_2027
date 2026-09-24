/**
 * Constat 7 de la revue du 2026-09-23 : le gabarit d'attribution se reconnaît à sa donnée
 * `nomme_candidat`, jamais à son code.
 *
 * Deux garanties :
 *
 * - **Aucun changement de comportement.** La sortie de l'engendrement et le rapport de symétrie
 *   sont épinglés par leur empreinte SHA-256 sur un jeu fixe, construit avec les fabriques
 *   existantes (`fabriques.ts`). Les empreintes ont été relevées sur le code d'avant la
 *   correction, qui décidait sur `gabarit.code === "Q-ATT"` ; elles doivent rester identiques
 *   après. Une empreinte qui change ici est un changement de comportement, à expliquer — pas une
 *   valeur à recopier.
 * - **Aucun code de décision ne cite le code du gabarit.** Test structurel sur les sources de
 *   `pipeline/questions/`, commentaires retirés : la seule occurrence admise de la chaîne `"Q-ATT"`
 *   est l'énumération de l'annexe B dans `types.ts`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { entreesPour } from "../../pipeline/questions/tirage.ts";
import type { Item, Question, Symetrie } from "../../pipeline/questions/types.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import {
  candidat,
  completer,
  graine,
  itemA,
  itemF,
  itemO,
  itemP,
  mesure,
  question,
  run,
} from "./fabriques.ts";

/* Relevées le 2026-09-24 sur le code d'avant la correction (décision sur `gabarit.code`). */
const EMPREINTE_ENGENDREMENT = "da299e0596204790fb8b302851848678d143fa784386004aa385cbd9dd0ad2af";
const EMPREINTE_SYMETRIE_VERTE = "73f6c7f4796bae525ee653612c96ec71d8f79accf497f011182508710c0294ee";
const EMPREINTE_SYMETRIE_ROUGE = "975a9757664233938c8e813ee89d585ab91e96deb2ff7cff2df110db94036b1c";

const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDATS = ["demo-alpha", "demo-beta"];

const PARTAGEE = mesure({ cle: "attr-partagee", theme: "fiscalite_pouvoir_achat" });
const CONDITIONNELLE = mesure({ cle: "attr-conditionnelle", theme: "retraites" });
const ABSENTE = mesure({ cle: "attr-absente", theme: "sante" });
const CHANGEANTE = mesure({ cle: "attr-changeante", theme: "education" });
const FICTIVE = mesure({ cle: "attr-fictive", theme: "immigration", fictive: true });
const MESURES = [PARTAGEE, CONDITIONNELLE, ABSENTE, CHANGEANTE, FICTIVE];

/**
 * Les quatre types d'item et les six gabarits : une mesure portée par les deux candidats (liste
 * attendue non vide pour Q-ATT), une position conditionnelle (exclusions), une mesure fictive
 * (liste attendue vide).
 */
const ITEMS: readonly Item[] = CANDIDATS.flatMap((candidat_id) => [
  itemP({ cle: `attr-${candidat_id}-p`, candidat_id, mesure: PARTAGEE }),
  itemP({
    cle: `attr-${candidat_id}-cond`,
    candidat_id,
    mesure: CONDITIONNELLE,
    position: "conditionnel",
  }),
  itemA({ cle: `attr-${candidat_id}-a`, candidat_id, mesure: ABSENTE }),
  itemO({ cle: `attr-${candidat_id}-o`, candidat_id, mesure: CHANGEANTE }),
  itemF({ cle: `attr-${candidat_id}-f`, candidat_id, mesure: FICTIVE }),
]);

const ENGENDREES = engendrer(ITEMS, MESURES);
const QUESTIONS: readonly Question[] = ENGENDREES.map(completer);
const RUN = run(CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

function symetrieDe(questions: readonly Question[]): Symetrie {
  const tirage = {
    run_id: RUN.id,
    date_gel: GEL,
    graine_tirage: graine(),
    entrees: entreesPour(questions, ITEMS, MESURES, GEL),
  };
  return verifierSymetrie(tirage, questions, ITEMS, RUN);
}

function empreinte(valeur: unknown): string {
  return sha256(JSON.stringify(valeur));
}

/** Une Q-ATT dont le texte nomme un candidat : ce que la symétrie doit refuser. */
function attributionQuiNomme(): Question {
  const principal = ITEMS.find((item) => item.type === "P") as Item;
  return question({
    id: "q_attribution_qui_nomme",
    gabarit: "Q-ATT",
    items: [
      {
        reference: {
          item_id: principal.id,
          item_version: principal.version,
          item_empreinte: principal.empreinte,
        },
        role: "principal",
      },
    ],
    grappe_id: principal.id,
    texte_neutre: "Candidat demo-alpha propose-t-il ou elle cette mesure ?",
  });
}

describe("constat 7 : comportement inchangé avec la table de gabarits actuelle", () => {
  it("engendre exactement la même sortie qu'avant la correction", () => {
    expect(ENGENDREES.map((engendree) => engendree.gabarit)).toContain("Q-ATT");
    expect(empreinte(ENGENDREES)).toBe(EMPREINTE_ENGENDREMENT);
  });

  it("rend exactement la même symétrie qu'avant sur le tirage de toutes les questions engendrées", () => {
    const symetrie = symetrieDe(QUESTIONS);
    const condition = symetrie.conditions.find((c) => c.code === "aucun_nom_candidat_dans_q_att");
    // Les cinq autres gabarits nomment le candidat : les inspecter rendrait la condition rouge.
    expect(condition?.statut).toBe("vert");
    expect(empreinte(symetrie)).toBe(EMPREINTE_SYMETRIE_VERTE);
  });

  it("rend exactement la même symétrie qu'avant quand une Q-ATT nomme un candidat", () => {
    const symetrie = symetrieDe([...QUESTIONS, attributionQuiNomme()]);
    const condition = symetrie.conditions.find((c) => c.code === "aucun_nom_candidat_dans_q_att");
    expect(condition?.statut).toBe("rouge");
    expect(condition?.commentaire).toContain("q_attribution_qui_nomme");
    expect(empreinte(symetrie)).toBe(EMPREINTE_SYMETRIE_ROUGE);
  });
});

/* ------------------------------------------------------ test structurel */

const DOSSIER_QUESTIONS = join(import.meta.dirname, "..", "..", "pipeline", "questions");

/** Retire les commentaires de bloc et de ligne ; les chaînes du code de décision restent. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
}

function fichiersCitant(chaine: string): readonly string[] {
  return readdirSync(DOSSIER_QUESTIONS)
    .filter((nom) => nom.endsWith(".ts"))
    .filter((nom) => sansCommentaires(readFileSync(join(DOSSIER_QUESTIONS, nom), "utf8")).includes(chaine))
    .sort();
}

describe("constat 7 : aucun code de décision ne cite le code du gabarit d'attribution", () => {
  it("ne laisse la chaîne \"Q-ATT\" que dans l'énumération de l'annexe B (types.ts)", () => {
    expect(fichiersCitant('"Q-ATT"')).toEqual(["types.ts"]);
  });

  it("n'y laisse qu'une seule occurrence, celle de CODES_GABARIT", () => {
    const source = sansCommentaires(readFileSync(join(DOSSIER_QUESTIONS, "types.ts"), "utf8"));
    const lignes = source.split("\n").filter((ligne) => ligne.includes('"Q-ATT"'));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(/^export const CODES_GABARIT = \[/);
  });

  it("détecte bien une occurrence dans du code, et ignore celle d'un commentaire", () => {
    expect(sansCommentaires('if (gabarit.code !== "Q-ATT") return;')).toContain('"Q-ATT"');
    expect(sansCommentaires('/** « "Q-ATT" » */\n// "Q-ATT"\nconst x = 1; // "Q-ATT"')).not.toContain(
      '"Q-ATT"',
    );
  });
});
