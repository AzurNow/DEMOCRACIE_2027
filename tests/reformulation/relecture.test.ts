/**
 * Relecture des formulations (décisions D39 et D42) : quelle proposition se relit, ce que devient une
 * relecture favorable, ce que porte un refus. Règles pures ; l'écriture sur disque et les routes ont
 * leurs propres tests (`tests/formulations-io.test.ts`, `tests/formulations-routes.test.ts`).
 */

import { describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { empreintesSuiventTextes, neutreSuitVersionGabarits } from "../../pipeline/questions/invariants.ts";
import type { Tache } from "../../pipeline/reformulation/entrees.ts";
import {
  clePromotion,
  formulationsValideesDe,
  InvariantsFormulationsEnDefaut,
  PromotionAvecCaseNonCochee,
  PropositionHorsQuestion,
  PropositionIncoherente,
  PropositionPerimee,
  propositionRelisible,
  questionsARelire,
  refusDe,
  RefusSansCommentaire,
  RefusSansMotif,
  type FormulationsValidees,
  type PropositionAcceptee,
  type RefusFormulation,
} from "../../pipeline/reformulation/relecture.ts";
import {
  identifiants,
  jeu,
  jeuO,
  proposition,
  questionDe,
  RELECTEUR,
  surAutreTexte,
  toutCoche,
  type OptionsProposition,
} from "./fabriques-relecture.ts";

const { taches } = jeu();
const FER = questionDe(taches, "Q-FER");
const ATT = questionDe(taches, "Q-ATT");
const AUCUN_REFUS: ReadonlySet<string> = new Set();

function acceptee(cle: string, options: Omit<OptionsProposition, "cle"> = {}, tache: Tache = FER): PropositionAcceptee {
  return proposition(tache, { cle, ...options }) as PropositionAcceptee;
}

function promouvoir(prop: PropositionAcceptee, courante: Tache = FER): FormulationsValidees {
  return formulationsValideesDe(courante, prop, toutCoche(), { ...RELECTEUR, commentaire: null }, identifiants(prop.id));
}

describe("cas limite 1 : seule une proposition acceptée sur le texte neutre courant est relisible", () => {
  it("acceptée sur l'empreinte courante ⇒ relisible", () => {
    const prop = acceptee("courante");
    expect(propositionRelisible(FER, [prop], AUCUN_REFUS)?.id).toBe(prop.id);
  });

  it("acceptée sur une autre empreinte ⇒ non relisible", () => {
    const prop = acceptee("ancienne", { texte_neutre: `${FER.question.texte_neutre} (ancien texte)` });
    expect(propositionRelisible(FER, [prop], AUCUN_REFUS)).toBeNull();
  });

  it("rejetée ou en échec HTTP ⇒ jamais listée, même sur l'empreinte courante et plus récente", () => {
    const rejetee = proposition(FER, { cle: "rejetee", statut: "rejetee", date: "2026-12-01T10:00:00+01:00" });
    const echec = proposition(FER, { cle: "echec", statut: "echec_http", date: "2026-12-02T10:00:00+01:00" });
    expect(propositionRelisible(FER, [rejetee, echec], AUCUN_REFUS)).toBeNull();
    expect(questionsARelire(taches, [rejetee, echec], [], new Map())).toEqual([]);
  });

  it("la proposition d'une autre question n'est pas relue pour celle-ci", () => {
    const prop = proposition(ATT, { cle: "att" });
    expect(propositionRelisible(FER, [prop], AUCUN_REFUS)).toBeNull();
  });

  it("une question déjà promue sur l'empreinte et la position courantes n'est plus listée ; promue sur une autre empreinte, elle l'est", () => {
    const prop = acceptee("courante");
    const memeCle = { empreinte_texte_neutre: sha256(FER.question.texte_neutre), position: "pour" as const };
    expect(questionsARelire(taches, [prop], [], new Map([[FER.question.id, memeCle]]))).toEqual([]);
    const autre = { ...memeCle, empreinte_texte_neutre: "0".repeat(64) };
    const relues = questionsARelire(taches, [prop], [], new Map([[FER.question.id, autre]]));
    expect(relues.map((entree) => entree.proposition.id)).toEqual([prop.id]);
  });
});

describe("cas limite 2 : entre deux propositions acceptées sur la même empreinte, la plus récente", () => {
  it("par appel.date, décalage horaire compris", () => {
    // 10:00+01:00 = 09:00Z, plus tard que 09:30+02:00 = 07:30Z, malgré l'heure affichée.
    const tot = acceptee("tot", { date: "2026-11-02T09:30:00+02:00" });
    const tard = acceptee("tard", { date: "2026-11-02T10:00:00+01:00" });
    expect(propositionRelisible(FER, [tard, tot], AUCUN_REFUS)?.id).toBe(tard.id);
    expect(propositionRelisible(FER, [tot, tard], AUCUN_REFUS)?.id).toBe(tard.id);
  });

  it("à date égale, l'id le plus grand", () => {
    const petit = acceptee("a", { id: "01JA0000000000000000000001" });
    const grand = acceptee("b", { id: "01JA0000000000000000000002" });
    expect(propositionRelisible(FER, [grand, petit], AUCUN_REFUS)?.id).toBe(grand.id);
    expect(propositionRelisible(FER, [petit, grand], AUCUN_REFUS)?.id).toBe(grand.id);
  });
});

describe("cas limite 3 : une proposition refusée n'est plus relisible", () => {
  it("acceptée puis refusée ⇒ écartée ; la précédente non refusée redevient la plus récente", () => {
    const ancienne = acceptee("ancienne", { date: "2026-11-01T10:00:00+01:00" });
    const refusee = acceptee("refusee", { date: "2026-11-02T10:00:00+01:00" });
    const refus: RefusFormulation = refusDe(refusee, { ...toutCoche(), premisse_conforme: false }, RELECTEUR, "Prémisse fausse.");
    expect(propositionRelisible(FER, [refusee], new Set([refus.proposition_id]))).toBeNull();
    const relues = questionsARelire(taches, [refusee, ancienne], [refus], new Map());
    expect(relues.map((entree) => entree.proposition.id)).toEqual([ancienne.id]);
  });
});

describe("cas limite 4 : la promotion recopie les textes et nomme leur production", () => {
  const prop = acceptee("promue");
  const promue = promouvoir(prop);

  it("le résultat est conforme au schéma formulations-validees", () => {
    expect(() => valider("formulations-validees", promue, "essai")).not.toThrow();
  });

  it("la neutre est produite par la table de gabarits, les deux autres par le modèle de la proposition", () => {
    const [neutre, familier, oriente] = promue.formulations;
    expect(neutre?.registre).toBe("neutre");
    expect(neutre?.production).toEqual({ gabarits: prop.version_gabarits });
    expect(familier?.production).toEqual(prop.production);
    expect(oriente?.production).toEqual(prop.production);
  });

  it("les textes sont identiques à la proposition, octet pour octet, et empreinte_texte est leur sha256", () => {
    const attendus = [prop.texte_neutre, prop.issue.familier.texte, prop.issue.oriente.texte];
    promue.formulations.forEach((formulation, rang) => {
      expect(Buffer.from(formulation.texte, "utf8").equals(Buffer.from(attendus[rang] as string, "utf8"))).toBe(true);
      expect(formulation.empreinte_texte).toBe(sha256(attendus[rang] as string));
    });
    expect(promue.empreinte_texte_neutre).toBe(sha256(FER.question.texte_neutre));
  });

  it("l'orientée porte la position demandée « pour », et les trois relectures disent sens préservé", () => {
    expect(promue.formulations[2]?.position_affirmee).toBe("pour");
    expect(promue.formulations.every((formulation) => formulation.relecture.sens_preserve)).toBe(true);
    expect(promue.formulations.every((formulation) => formulation.relecture.annotateur_id === "a1")).toBe(true);
  });

  it("position_affirmee est absente quand la demande était AUCUNE (question d'attribution)", () => {
    const att = acceptee("att", {}, ATT);
    expect(att.demande.position_affirmee).toBe("AUCUNE");
    const valeur = promouvoir(att, ATT);
    expect("position_affirmee" in (valeur.formulations[2] as object)).toBe(false);
    expect(clePromotion(valeur).position).toBe("AUCUNE");
    expect(() => valider("formulations-validees", valeur, "essai")).not.toThrow();
  });

  it("une sortie orientée qui ne porte pas la position demandée est incohérente : rien n'est promu", () => {
    expect(() => promouvoir(acceptee("contre", { position_portee: "contre" }))).toThrow(PropositionIncoherente);
    expect(() => promouvoir(acceptee("sans", { position_portee: null }))).toThrow(PropositionIncoherente);
  });

  it("une proposition faite sur un autre texte neutre ne se promeut pas", () => {
    const ancienne = acceptee("ancienne", { texte_neutre: `${FER.question.texte_neutre} (ancien)` });
    expect(() => promouvoir(ancienne)).toThrow(PropositionHorsQuestion);
  });

  it("le commentaire facultatif est recopié sur les trois relectures quand il est donné", () => {
    const valeur = formulationsValideesDe(FER, prop, toutCoche(), { ...RELECTEUR, commentaire: "RAS." }, identifiants("c"));
    expect(valeur.formulations.map((formulation) => formulation.relecture.commentaire)).toEqual(["RAS.", "RAS.", "RAS."]);
    expect(promue.formulations.every((formulation) => !("commentaire" in formulation.relecture))).toBe(true);
  });
});

describe("cas limite 7 : une case non cochée rend la promotion impossible", () => {
  const prop = acceptee("cases");
  const cas = [
    { sens_preserve: { neutre: false, familier: true, oriente: true }, premisse_conforme: true },
    { sens_preserve: { neutre: true, familier: false, oriente: true }, premisse_conforme: true },
    { sens_preserve: { neutre: true, familier: true, oriente: false }, premisse_conforme: true },
    { sens_preserve: { neutre: true, familier: true, oriente: true }, premisse_conforme: false },
  ];
  it.each(cas)("cases %j ⇒ PromotionAvecCaseNonCochee", (cases) => {
    expect(() => formulationsValideesDe(FER, prop, cases, { ...RELECTEUR, commentaire: null }, identifiants("x"))).toThrow(
      PromotionAvecCaseNonCochee,
    );
  });
});

describe("refus : commentaire obligatoire, registres en cause nommés", () => {
  const prop = acceptee("refus");

  it("cas limite 6 : refus sans commentaire, ou fait d'espaces ⇒ RefusSansCommentaire", () => {
    const cases = { ...toutCoche(), sens_preserve: { neutre: true, familier: false, oriente: true } };
    expect(() => refusDe(prop, cases, RELECTEUR, "")).toThrow(RefusSansCommentaire);
    expect(() => refusDe(prop, cases, RELECTEUR, "  \n ")).toThrow(RefusSansCommentaire);
  });

  it("refus alors que tout est coché ⇒ RefusSansMotif", () => {
    expect(() => refusDe(prop, toutCoche(), RELECTEUR, "Pourtant je refuse.")).toThrow(RefusSansMotif);
  });

  it("registres en cause : ceux dont le sens change, et l'orientée quand sa prémisse n'est pas conforme", () => {
    const familier = refusDe(prop, { ...toutCoche(), sens_preserve: { neutre: true, familier: false, oriente: true } }, RELECTEUR, "Sens.");
    expect(familier.registres).toEqual(["familier"]);
    expect(familier.premisse_conforme).toBe(true);
    const premisse = refusDe(prop, { ...toutCoche(), premisse_conforme: false }, RELECTEUR, "Prémisse.");
    expect(premisse.registres).toEqual(["oriente"]);
    expect(premisse.premisse_conforme).toBe(false);
    expect(() => valider("refus-formulation", premisse, "essai")).not.toThrow();
  });
});

describe("cas limite 8 : invariant de la neutre et de la version des gabarits", () => {
  const promue = promouvoir(acceptee("invariant"));
  const courantes = new Map([[FER.question.id, FER.question.version_gabarits]]);

  it("le fichier promu ne viole aucun invariant", () => {
    expect(neutreSuitVersionGabarits([promue], courantes)).toEqual([]);
    expect(empreintesSuiventTextes([promue])).toEqual([]);
  });

  it("neutre dont production.gabarits diffère de version_gabarits ⇒ violation nommée", () => {
    const fautive = {
      ...promue,
      formulations: promue.formulations.map((formulation) =>
        formulation.registre === "neutre" ? { ...formulation, production: { gabarits: "prompts/gabarits-0.9.0" } } : formulation,
      ),
    };
    const violations = neutreSuitVersionGabarits([fautive], courantes);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.invariant).toBe("la neutre est produite par la version de gabarits de la question");
    expect(violations[0]?.objet).toBe(FER.question.id);
  });

  it("version_gabarits différente de celle de la question engendrée courante ⇒ violation nommée", () => {
    const violations = neutreSuitVersionGabarits([promue], new Map([[FER.question.id, "prompts/gabarits-9.9.9"]]));
    expect(violations.map((violation) => violation.detail)).toEqual([
      expect.stringContaining("la question engendrée courante porte prompts/gabarits-9.9.9"),
    ]);
  });

  it("proposition sur une table de gabarits qui n'est plus la courante ⇒ promotion refusée", () => {
    const ancienne = acceptee("table", { version_gabarits: "prompts/gabarits-0.9.0" });
    expect(() => promouvoir(ancienne)).toThrow(InvariantsFormulationsEnDefaut);
  });

  it("empreinte_texte qui ne suit pas son texte ⇒ violation nommée", () => {
    const fautive = {
      ...promue,
      formulations: promue.formulations.map((formulation) =>
        formulation.registre === "familier" ? { ...formulation, texte: `${formulation.texte} ` } : formulation,
      ),
    };
    const violations = empreintesSuiventTextes([fautive]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.invariant).toBe("chaque empreinte suit son texte, et la neutre est le texte de la clé");
  });
});

describe("cas limite 12 : guillemets et apostrophes typographiques conservés", () => {
  it("la neutre, la familière et l'orientée gardent « », ’ et les espaces tels quels", () => {
    const familier = "T’as vu ? « Le jardin » , c’est pour quand ?";
    const oriente = "On m’a dit qu’il était « pour » : c’est bien ça ?";
    const promue = promouvoir(acceptee("typo", { familier, oriente }));
    expect(FER.question.texte_neutre).toContain("d’un « jardin partagé »");
    expect(promue.formulations.map((formulation) => formulation.texte)).toEqual([FER.question.texte_neutre, familier, oriente]);
  });
});

describe("Q1, option (a) : position demandée recalculée sur l'item courant", () => {
  it("P corrigé de « pour » à « contre », texte neutre inchangé ⇒ la proposition n'est plus relisible ni promouvable", () => {
    const avant = acceptee("p-pour");
    const corrige = questionDe(jeu("contre").taches, "Q-FER");
    expect(corrige.question.texte_neutre).toBe(FER.question.texte_neutre);
    expect(corrige.demande.position_affirmee).toBe("contre");
    expect(propositionRelisible(corrige, [avant], AUCUN_REFUS)).toBeNull();
    expect(questionsARelire([corrige], [avant], [], new Map())).toEqual([]);
    expect(() => promouvoir(avant, corrige)).toThrow(PropositionPerimee);
  });

  it("P corrigé : une promotion sur l'ancienne position ne retient plus la question, une nouvelle proposition se relit", () => {
    const promue = promouvoir(acceptee("p-promue"));
    const corrige = questionDe(jeu("contre").taches, "Q-FER");
    const nouvelle = acceptee("p-contre", {}, corrige);
    const relues = questionsARelire([corrige], [nouvelle], [], new Map([[corrige.question.id, clePromotion(promue)]]));
    expect(relues.map((entree) => entree.proposition.id)).toEqual([nouvelle.id]);
  });

  it("O dont l'état antérieur change, texte neutre inchangé ⇒ la proposition n'est plus relisible", () => {
    const fer = questionDe(jeuO("pour", "contre").taches, "Q-FER");
    const corrige = questionDe(jeuO("contre", "pour").taches, "Q-FER");
    expect(corrige.question.id).toBe(fer.question.id);
    expect(corrige.question.texte_neutre).toBe(fer.question.texte_neutre);
    expect([fer.demande.position_affirmee, corrige.demande.position_affirmee]).toEqual(["pour", "contre"]);
    const avant = acceptee("o-pour", {}, fer);
    expect(propositionRelisible(fer, [avant], AUCUN_REFUS)?.id).toBe(avant.id);
    expect(propositionRelisible(corrige, [avant], AUCUN_REFUS)).toBeNull();
  });

  it("aucune correction ⇒ inchangé : relisible et promouvable", () => {
    const meme = questionDe(jeu("pour").taches, "Q-FER");
    const prop = acceptee("inchange");
    expect(propositionRelisible(meme, [prop], AUCUN_REFUS)?.id).toBe(prop.id);
    expect(() => promouvoir(prop, meme)).not.toThrow();
  });

  it("une tâche sur un autre texte neutre garde le refus d'empreinte, distinct de la péremption", () => {
    expect(() => promouvoir(acceptee("texte"), surAutreTexte(FER))).toThrow(PropositionHorsQuestion);
  });
});
