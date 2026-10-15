/**
 * Contrôle déterministe de la sortie du modèle de reformulation (règle 5 : comparaison de chaînes,
 * jamais un modèle ; règle 7 : la sortie n'est ni réparée, ni normalisée, ni tronquée). Toute
 * sortie qui échoue à un contrôle est rejetée en entier, avec le motif du contrôle échoué.
 */

import { describe, expect, it } from "vitest";
import { gabaritParCode, remplirTexteNeutre } from "../../pipeline/questions/gabarits.ts";
import type { CandidatNomme, CodeGabarit, Item } from "../../pipeline/questions/types.ts";
import { controlerSortie, SortieRejetee } from "../../pipeline/reformulation/controle.ts";
import type { MotifRejet } from "../../pipeline/reformulation/controle.ts";
import { demandeDe } from "../../pipeline/reformulation/demande.ts";
import type { DemandeReformulation } from "../../pipeline/reformulation/demande.ts";
import { itemA, itemO, itemP, mesure, nomme } from "../questions/fabriques.ts";

const LIBELLE = "Hélène Durand-Aubry";
const PERIMETRE: readonly CandidatNomme[] = [
  nomme("demo-alpha", LIBELLE, "Durand-Aubry"),
  nomme("demo-beta", "Basile Fictif", "Fictif"),
];

function demandeNommee(gabarit: CodeGabarit, item: Item, formulation_mesure: string): DemandeReformulation {
  const substitutions = { libelle_candidat: LIBELLE, formulation_mesure };
  const texte_neutre = remplirTexteNeutre(gabaritParCode(gabarit), substitutions);
  return demandeDe({ gabarit, item_principal: item, texte_neutre, substitutions });
}

const MESURE = mesure({ cle: "controle", formulation_canonique: "le budget" });
const ITEM_P_CONTRE = itemP({ cle: "p-contre", candidat_id: "demo-alpha", mesure: MESURE, position: "contre" });
/** Q-NEG sur un item P « contre » : position demandée « contre ». */
const DEMANDE = demandeNommee("Q-NEG", ITEM_P_CONTRE, "le budget");
/** Q-DIR sur un item A : position demandée AUCUNE. */
const DEMANDE_A = demandeNommee("Q-DIR", itemA({ cle: "a", candidat_id: "demo-alpha", mesure: MESURE }), "le budget");

const FAMILIER = `Dis, ${LIBELLE} est contre le budget ?`;
const ORIENTE = `${LIBELLE} s'oppose au budget, c'est acquis. Est-ce bien le cas ?`;

function sortie(familier: unknown, oriente: unknown, enPlus: Record<string, unknown> = {}): string {
  return JSON.stringify({ familier, oriente, ...enPlus });
}

const CONFORME = sortie({ texte: FAMILIER }, { texte: ORIENTE, position_affirmee: "contre" });

function motifDe(appel: () => unknown): MotifRejet {
  try {
    appel();
  } catch (erreur) {
    if (erreur instanceof SortieRejetee) return erreur.motif;
    throw erreur;
  }
  throw new Error("La sortie a été acceptée alors qu'un rejet était attendu.");
}

describe("sortie conforme", () => {
  it("est acceptée et rendue telle quelle", () => {
    expect(controlerSortie(CONFORME, DEMANDE, PERIMETRE)).toEqual({
      familier: { texte: FAMILIER },
      oriente: { texte: ORIENTE, position_affirmee: "contre" },
    });
  });

  it("position AUCUNE : sortie sans position_affirmee acceptée", () => {
    const brut = sortie({ texte: `Dis, tu sais ce que ${LIBELLE} veut faire sur le budget ?` }, {
      texte: `Je veux une réponse nette : quelle est la position de ${LIBELLE} sur le budget ?`,
    });
    expect(controlerSortie(brut, DEMANDE_A, PERIMETRE).oriente).toEqual({
      texte: `Je veux une réponse nette : quelle est la position de ${LIBELLE} sur le budget ?`,
    });
  });

  it("ne modifie pas la chaîne reçue : l'appelant garde le brut intact (règle 7)", () => {
    const brut = `  ${CONFORME}\n`;
    const copie = `${brut}`;
    controlerSortie(brut, DEMANDE, PERIMETRE);
    expect(brut).toBe(copie);
  });
});

describe("cas limite 6 : forme de la sortie", () => {
  it("JSON invalide ⇒ json_invalide", () => {
    expect(motifDe(() => controlerSortie(CONFORME.slice(0, -1), DEMANDE, PERIMETRE))).toBe("json_invalide");
  });

  it("JSON dans un bloc ```json ⇒ bloc_de_code, jamais déballé", () => {
    expect(motifDe(() => controlerSortie(`\`\`\`json\n${CONFORME}\n\`\`\``, DEMANDE, PERIMETRE))).toBe("bloc_de_code");
  });

  it("texte avant l'objet ⇒ json_invalide", () => {
    expect(motifDe(() => controlerSortie(`Voici : ${CONFORME}`, DEMANDE, PERIMETRE))).toBe("json_invalide");
  });

  it("une liste au lieu d'un objet ⇒ pas_un_objet", () => {
    expect(motifDe(() => controlerSortie(`[${CONFORME}]`, DEMANDE, PERIMETRE))).toBe("pas_un_objet");
  });

  it("champ en trop au premier niveau ⇒ champ_inattendu", () => {
    const brut = sortie({ texte: FAMILIER }, { texte: ORIENTE, position_affirmee: "contre" }, { neutre: { texte: "x" } });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("champ_inattendu");
  });

  it("champ en trop dans familier ⇒ champ_inattendu", () => {
    const brut = sortie({ texte: FAMILIER, ton: "oral" }, { texte: ORIENTE, position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("champ_inattendu");
  });

  it("champ en trop dans oriente ⇒ champ_inattendu", () => {
    const brut = sortie({ texte: FAMILIER }, { texte: ORIENTE, position_affirmee: "contre", premisse: "x" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("champ_inattendu");
  });

  it("familier manquant ⇒ champ_manquant", () => {
    const brut = JSON.stringify({ oriente: { texte: ORIENTE, position_affirmee: "contre" } });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("champ_manquant");
  });

  it("oriente sans texte ⇒ champ_manquant", () => {
    const brut = sortie({ texte: FAMILIER }, { position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("champ_manquant");
  });

  it("texte non textuel ⇒ champ_non_textuel", () => {
    const brut = sortie({ texte: 42 }, { texte: ORIENTE, position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("champ_non_textuel");
  });

  it("texte vide ⇒ texte_vide", () => {
    const brut = sortie({ texte: "" }, { texte: ORIENTE, position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("texte_vide");
  });

  it("l'erreur nomme le contrôle échoué dans son message", () => {
    const brut = sortie({ texte: "" }, { texte: ORIENTE, position_affirmee: "contre" });
    expect(() => controlerSortie(brut, DEMANDE, PERIMETRE)).toThrow(/texte_vide/u);
  });
});

describe("cas limite 7 : position affirmée", () => {
  it("présente alors qu'AUCUNE est demandée ⇒ position_affirmee_inattendue", () => {
    const brut = sortie({ texte: `${LIBELLE}, le budget ?` }, { texte: `${LIBELLE}, le budget ?`, position_affirmee: "pour" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE_A, PERIMETRE))).toBe("position_affirmee_inattendue");
  });

  it("absente alors que « pour » est demandée ⇒ position_affirmee_manquante", () => {
    const item = itemO({ cle: "o-pour", candidat_id: "demo-alpha", mesure: MESURE, position: "pour" });
    const demande = demandeNommee("Q-ACT", item, "le budget");
    const brut = sortie({ texte: `${LIBELLE}, le budget ?` }, { texte: `${LIBELLE} propose le budget ?` });
    expect(motifDe(() => controlerSortie(brut, demande, PERIMETRE))).toBe("position_affirmee_manquante");
  });

  it("différente de celle demandée ⇒ position_affirmee_differente", () => {
    const brut = sortie({ texte: FAMILIER }, { texte: ORIENTE, position_affirmee: "pour" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("position_affirmee_differente");
  });

  it("recopiée avec une autre casse ⇒ position_affirmee_differente", () => {
    const brut = sortie({ texte: FAMILIER }, { texte: ORIENTE, position_affirmee: "Contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("position_affirmee_differente");
  });
});

describe("cas limite 8 : libellé du candidat recopié caractère pour caractère", () => {
  it("recopié sans accent ⇒ libelle_candidat", () => {
    const brut = sortie({ texte: "Dis, Helene Durand-Aubry est contre le budget ?" }, { texte: ORIENTE, position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("libelle_candidat");
  });

  it("recopié en minuscules ⇒ libelle_candidat", () => {
    const brut = sortie({ texte: FAMILIER }, { texte: "hélène durand-aubry s'oppose au budget ?", position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("libelle_candidat");
  });

  it("trait d'union perdu ⇒ libelle_candidat", () => {
    const brut = sortie({ texte: "Dis, Hélène Durand Aubry est contre le budget ?" }, { texte: ORIENTE, position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("libelle_candidat");
  });

  it("recopié exactement ⇒ accepté", () => {
    expect(() => controlerSortie(CONFORME, DEMANDE, PERIMETRE)).not.toThrow();
  });
});

describe("cas limite 9 et 11 : la mesure dans chaque texte", () => {
  it("Q-NEG : « au budget » et « contre le budget » acceptés", () => {
    expect(() => controlerSortie(CONFORME, DEMANDE, PERIMETRE)).not.toThrow();
  });

  it("Q-NEG : « au Budget » ⇒ mesure", () => {
    const brut = sortie({ texte: FAMILIER }, { texte: `${LIBELLE} s'oppose au Budget ?`, position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("mesure");
  });

  it("Q-NEG : « à le budget » ⇒ mesure", () => {
    const brut = sortie({ texte: `Dis, ${LIBELLE} s'oppose à le budget ?` }, { texte: ORIENTE, position_affirmee: "contre" });
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("mesure");
  });

  it("Q-NEG + « les retraites » : « aux retraites » accepté", () => {
    const retraites = mesure({ cle: "retraites", formulation_canonique: "les retraites" });
    const item = itemP({ cle: "p-ret", candidat_id: "demo-alpha", mesure: retraites, position: "pour" });
    const demande = demandeNommee("Q-NEG", item, "les retraites");
    const brut = sortie(
      { texte: `${LIBELLE} s'oppose aux retraites ?` },
      { texte: `${LIBELLE} soutient les retraites. S'oppose-t-on aux retraites ?`, position_affirmee: "pour" },
    );
    expect(() => controlerSortie(brut, demande, PERIMETRE)).not.toThrow();
  });

  it("gabarit sans « à » devant la mesure : « au budget » ⇒ mesure", () => {
    const item = itemP({ cle: "p-fer", candidat_id: "demo-alpha", mesure: MESURE, position: "pour" });
    const demande = demandeNommee("Q-FER", item, "le budget");
    const brut = sortie({ texte: `${LIBELLE} propose au budget ?` }, { texte: `${LIBELLE} propose le budget ?`, position_affirmee: "pour" });
    expect(motifDe(() => controlerSortie(brut, demande, PERIMETRE))).toBe("mesure");
  });

  it("apostrophe typographique de la mesure recopiée droite ⇒ mesure", () => {
    const jardin = mesure({ cle: "jardin", formulation_canonique: "la création d’un jardin partagé" });
    const item = itemP({ cle: "p-jardin", candidat_id: "demo-alpha", mesure: jardin, position: "pour" });
    const demande = demandeNommee("Q-FER", item, "la création d’un jardin partagé");
    const brut = sortie(
      { texte: `Tu sais si ${LIBELLE} propose la création d'un jardin partagé ?` },
      { texte: `${LIBELLE} propose la création d’un jardin partagé, n'est-ce pas ?`, position_affirmee: "pour" },
    );
    expect(motifDe(() => controlerSortie(brut, demande, PERIMETRE))).toBe("mesure");
  });
});

describe("cas limite 10 : aucun nom de candidat dans une question d'attribution", () => {
  const substitutions = { formulation_mesure: "le budget" };
  const demande = demandeDe({
    gabarit: "Q-ATT",
    item_principal: undefined,
    texte_neutre: remplirTexteNeutre(gabaritParCode("Q-ATT"), substitutions),
    substitutions,
  });
  const ORIENTE_ATT = "Je veux une liste complète : quels candidats proposent le budget ?";

  it("formulation familière nommant un candidat du périmètre ⇒ nom_de_candidat_dans_attribution", () => {
    const brut = sortie({ texte: "Dis, à part Basile Fictif, qui propose le budget ?" }, { texte: ORIENTE_ATT });
    expect(motifDe(() => controlerSortie(brut, demande, PERIMETRE))).toBe("nom_de_candidat_dans_attribution");
  });

  it("nom seul, sans accent et en minuscules : toujours trouvé, comme libelles.ts le cherche", () => {
    const brut = sortie({ texte: "Dis, qui propose le budget, a part durand aubry ?" }, { texte: ORIENTE_ATT });
    expect(motifDe(() => controlerSortie(brut, demande, PERIMETRE))).toBe("nom_de_candidat_dans_attribution");
  });

  it("recherche par mots entiers : « Fictifs » ne contient pas le nom « Fictif »", () => {
    const brut = sortie({ texte: "Dis, les candidats Fictifs proposent le budget ?" }, { texte: ORIENTE_ATT });
    expect(() => controlerSortie(brut, demande, PERIMETRE)).not.toThrow();
  });

  it("formulation sans nom ⇒ acceptée, sans position affirmée", () => {
    const brut = sortie({ texte: "Dis, qui propose le budget ?" }, { texte: ORIENTE_ATT });
    expect(controlerSortie(brut, demande, PERIMETRE)).toEqual({
      familier: { texte: "Dis, qui propose le budget ?" },
      oriente: { texte: ORIENTE_ATT },
    });
  });

  it("libellé du périmètre sans aucun mot ⇒ erreur, la barrière ne peut pas le chercher", () => {
    const brut = sortie({ texte: "Dis, qui propose le budget ?" }, { texte: ORIENTE_ATT });
    expect(() => controlerSortie(brut, demande, [nomme("demo-gamma", "—", "Gamma")])).toThrow(/sans aucun mot/u);
  });

  it("périmètre vide ⇒ erreur, jamais un contrôle qui passe faute de noms", () => {
    const brut = sortie({ texte: "Dis, qui propose le budget ?" }, { texte: ORIENTE_ATT });
    expect(() => controlerSortie(brut, demande, [])).toThrow(/Périmètre vide/u);
  });
});

describe("cas limite 12 : clé dupliquée dans la sortie du modèle", () => {
  const F = JSON.stringify(FAMILIER);
  const O = JSON.stringify(ORIENTE);

  it("familier répété à la racine ⇒ cle_dupliquee, même si la dernière valeur serait conforme", () => {
    const brut = `{"familier": {"texte": ""}, "familier": {"texte": ${F}}, "oriente": {"texte": ${O}, "position_affirmee": "contre"}}`;
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("cle_dupliquee");
  });

  it("position_affirmee répétée dans oriente ⇒ cle_dupliquee", () => {
    const brut = `{"familier": {"texte": ${F}}, "oriente": {"texte": ${O}, "position_affirmee": "pour", "position_affirmee": "contre"}}`;
    expect(motifDe(() => controlerSortie(brut, DEMANDE, PERIMETRE))).toBe("cle_dupliquee");
  });

  it("le message nomme la clé répétée", () => {
    const brut = `{"familier": {"texte": ${F}}, "oriente": {"texte": ${O}, "texte": ${O}, "position_affirmee": "contre"}}`;
    expect(() => controlerSortie(brut, DEMANDE, PERIMETRE)).toThrow(/« texte »/u);
  });
});
