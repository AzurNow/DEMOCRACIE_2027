/**
 * `schema/commun.schema.json:$defs/source` et `schema/item.schema.json` : les règles de sources que
 * la passe de conformité du 2026-09-24 signalait comme non gardées.
 *
 * - n° 11 : le tier d'une source est lié à son type de document par une table fermée (§4) ;
 * - n° 12 : l'attestation d'écoute d'une transcription T2 n'existe pas en staging (le pipeline
 *   n'écoute rien), et elle est exigée d'un item vérifié dont une source est T2 ;
 * - n° 13 : la règle T3 vaut pour les deux états d'un item O et pour la source de couverture d'un
 *   item A, pas seulement pour l'assertion d'un item P.
 *
 * Chaque cas part d'un exemple valide réel et n'en change qu'un point ; un cas invalide vérifie
 * que TOUTES les erreurs rapportées portent sur le point changé ou sur un de ses ancêtres.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { erreurDeSchema } from "../outils/schemas/valider.ts";

type Objet = Record<string, unknown>;

const EXEMPLES = resolve(import.meta.dirname, "../schema/exemples/item");

function lire(fichier: string): Objet {
  return JSON.parse(readFileSync(resolve(EXEMPLES, fichier), "utf8")) as Objet;
}

/** Item P vérifié, source T1 `programme_pdf`. */
function itemP(): Objet {
  return lire("valide-01-position-t1.json");
}

/** Item O vérifié : état antérieur T1, état postérieur T2 attesté par les deux annotateurs. */
function itemO(): Objet {
  return lire("valide-02-obsolete-deux-etats.json");
}

/** Item A vérifié, bâti sur l'exemple invalide-03 privé de l'assertion qui le rendait invalide. */
function itemA(): Objet {
  const item = lire("invalide-03-absence-portant-une-assertion.json");
  const { assertion: _assertion, ...sansAssertion } = item;
  return {
    ...sansAssertion,
    absence: {
      source_couverture_theme: { ...SOURCE_T1 },
      corpus_examine: [{ url: SOURCE_T1["url"], sha256: SOURCE_T1["sha256"], tier: "T1" }],
      date_examen: "2026-09-04T10:00:00+02:00",
      confirmation_initiale: { lot_id: "lot-003", date: "2026-09-20T10:05:00+02:00", annotateurs: ["a1", "a2"] },
      reverifications: [],
    },
  };
}

/**
 * Modifié ouvertement (protocole 0.13, n° 54) : chaque source déclare son format, et une citation
 * tirée d'un PDF porte sa page. Les sources de ce fichier reçoivent le format de leur type ; une
 * source privée de sa page (type autre que programme_pdf) n'est donc jamais un PDF ici, et les
 * cas de ce fichier restent ceux des n° 11 à 13. La règle 0.13 est testée dans
 * `tests/sources-items-0-13.test.ts`.
 */
const FORMAT_PAR_TYPE: Readonly<Record<string, string>> = {
  programme_pdf: "pdf",
  site_officiel: "html",
  tribune_signee: "html",
  communique_campagne: "html",
  site_parti: "html",
  enregistrement_video: "video",
  enregistrement_audio: "audio",
  article_presse: "html",
};

function formatDuType(surcharges: Objet): Objet {
  const type = surcharges["type_document"];
  return typeof type === "string" ? { format: FORMAT_PAR_TYPE[type] } : {};
}

const SOURCE_T1: Objet = {
  tier: "T1",
  url: "https://exemple-candidat.fr/programme-2027.pdf",
  type_document: "programme_pdf",
  format: "pdf",
  page: 14,
  sha256: "2c6ed1182b4176016ebb10fdc541e61c92c45c8d37e04ec8481a5d398b6e460e",
  archive_url: "https://web.archive.org/web/20260901120000/https://exemple-candidat.fr/programme-2027.pdf",
  date_source: "2026-09-01",
  date_collecte: "2026-09-03T09:12:00+02:00",
  publication: "publique",
};

const SOURCE_T3: Objet = {
  tier: "T3",
  url: "https://exemple-media.fr/article-rapporte",
  type_document: "article_presse",
  format: "html",
  sha256: "84393add8c489d33569360efd1bcb5f70ed5a22408127d241c751e5ea345eb7c",
  archive_url: "https://web.archive.org/web/20261020100000/https://exemple-media.fr/article-rapporte",
  date_source: "2026-10-20",
  date_collecte: "2026-10-20T18:30:00+02:00",
  publication: "publique",
};

const EXTRAIT = { debut: "00:42:10", fin: "00:43:05" };
const ATTESTATION = { transcription_verifiee_par: ["a1", "a2"], transcription_verifiee_le: "2026-09-20" };

function source(item: Objet): Objet {
  return (item["assertion"] as Objet)["source"] as Objet;
}

function obsolescence(item: Objet): Objet {
  return item["obsolescence"] as Objet;
}

function etat(item: Objet, cle: "etat_anterieur" | "etat_posterieur"): Objet {
  return obsolescence(item)[cle] as Objet;
}

function absence(item: Objet): Objet {
  return item["absence"] as Objet;
}

function chemins(item: Objet): readonly string[] {
  const erreur = erreurDeSchema("item", item, "test");
  return erreur === null ? [] : erreur.chemins;
}

/** Au moins une erreur sur `cible` ou sous elle, et toutes les autres sur elle ou un ancêtre. */
function toutesSous(cible: string): (liste: readonly string[]) => boolean {
  const sous = (c: string) => c === cible || c.startsWith(`${cible}/`);
  const ancetre = (c: string) => c === "" || cible.startsWith(`${c}/`);
  return (liste) => liste.some(sous) && liste.every((c) => sous(c) || ancetre(c));
}

/**
 * Item P dont la source d'assertion est remplacée. Statut `a_confirmer` : ni la règle T3 ni
 * l'exigence d'attestation T2 d'un item vérifié n'interviennent, seule la table du n° 11 parle.
 */
function itemPAvecSource(surcharges: Objet): Objet {
  const item = itemP();
  item["statut_validation"] = "a_confirmer";
  (item["assertion"] as Objet)["source"] = { ...SOURCE_T1, ...formatDuType(surcharges), ...surcharges };
  return item;
}

/* ------------------------------------------------------------------ n° 11 */

describe("conformité n° 11 : table fermée type de document → tier", () => {
  it("refuse un site de parti à mention false déclaré T1", () => {
    const item = itemPAvecSource({ type_document: "site_parti", site_parti_tient_lieu_de_campagne: false });
    delete source(item)["page"];
    expect(chemins(item)).toSatisfy(toutesSous("/assertion/source"));
    expect(chemins(item)).toContain("/assertion/source/tier");
  });

  it("accepte un site de parti à mention true déclaré T1", () => {
    const item = itemPAvecSource({ type_document: "site_parti", site_parti_tient_lieu_de_campagne: true });
    delete source(item)["page"];
    expect(chemins(item)).toEqual([]);
  });

  it("accepte un site de parti à mention false déclaré T3", () => {
    const item = itemPAvecSource({ tier: "T3", type_document: "site_parti", site_parti_tient_lieu_de_campagne: false });
    delete source(item)["page"];
    expect(chemins(item)).toEqual([]);
  });

  it("refuse un article de presse déclaré T1", () => {
    const item = itemPAvecSource({ type_document: "article_presse" });
    delete source(item)["page"];
    expect(chemins(item)).toSatisfy(toutesSous("/assertion/source"));
    expect(chemins(item)).toContain("/assertion/source/tier");
  });

  it("refuse un enregistrement vidéo déclaré T1", () => {
    const item = itemPAvecSource({ type_document: "enregistrement_video" });
    delete source(item)["page"];
    expect(chemins(item)).toSatisfy(toutesSous("/assertion/source"));
    expect(chemins(item)).toContain("/assertion/source/tier");
  });

  it("refuse un programme PDF déclaré T2", () => {
    const item = itemPAvecSource({ tier: "T2", extrait: EXTRAIT });
    expect(chemins(item)).toSatisfy(toutesSous("/assertion/source"));
    expect(chemins(item)).toContain("/assertion/source/tier");
  });

  /*
   * La table entière, combinaison par combinaison : le schéma admet exactement ce qu'elle dit.
   * `tests/collecte/test_sources.py` confronte la même table à `sources.py`, qui la lit dans le schéma.
   */
  const TABLE: Readonly<Record<string, readonly string[]>> = {
    programme_pdf: ["T1"],
    site_officiel: ["T1"],
    tribune_signee: ["T1"],
    communique_campagne: ["T1"],
    "site_parti:true": ["T1"],
    "site_parti:false": ["T3"],
    enregistrement_video: ["T2"],
    enregistrement_audio: ["T2"],
    article_presse: ["T3"],
  };

  function sourcePour(cle: string, tier: string): Objet {
    const [type_document, mention] = cle.split(":") as [string, string | undefined];
    return {
      ...SOURCE_T1,
      tier,
      type_document,
      ...formatDuType({ type_document }),
      ...(type_document === "programme_pdf" ? {} : { page: undefined }),
      ...(mention === undefined ? {} : { site_parti_tient_lieu_de_campagne: mention === "true" }),
      ...(tier === "T2" ? { extrait: EXTRAIT } : {}),
    };
  }

  for (const [cle, admis] of Object.entries(TABLE)) {
    for (const tier of ["T1", "T2", "T3"]) {
      const attendu = admis.includes(tier);
      it(`${cle} en ${tier} : ${attendu ? "admis" : "refusé"}`, () => {
        const item = itemPAvecSource({});
        (item["assertion"] as Objet)["source"] = JSON.parse(JSON.stringify(sourcePour(cle, tier))) as Objet;
        expect(chemins(item).length === 0).toBe(attendu);
      });
    }
  }

  it("la table couvre toute l'énumération type_document du schéma", () => {
    const commun = JSON.parse(readFileSync(resolve(import.meta.dirname, "../schema/commun.schema.json"), "utf8")) as {
      $defs: { source: { properties: { type_document: { enum: string[] } } } };
    };
    const couverts = new Set(Object.keys(TABLE).map((cle) => cle.split(":")[0]));
    expect([...couverts].sort()).toEqual([...commun.$defs.source.properties.type_document.enum].sort());
  });
});

/* ------------------------------------------------------------------ n° 12 */

describe("conformité n° 12 : attestation d'écoute d'une transcription T2", () => {
  function itemPT2(statut: string, attestation: boolean): Objet {
    const item = itemP();
    item["statut_validation"] = statut;
    (item["assertion"] as Objet)["source"] = {
      ...SOURCE_T1,
      tier: "T2",
      type_document: "enregistrement_video",
      format: "video",
      page: undefined,
      extrait: EXTRAIT,
      ...(attestation ? ATTESTATION : {}),
    };
    return JSON.parse(JSON.stringify(item)) as Objet;
  }

  it("un item T2 en staging sans attestation est valide", () => {
    expect(chemins(itemPT2("en_attente", false))).toEqual([]);
  });

  it("un item T2 en staging portant une attestation est invalide : le pipeline n'écoute rien", () => {
    expect(chemins(itemPT2("en_attente", true))).toSatisfy(toutesSous("/assertion/source"));
  });

  it("un item vérifié T2 sans attestation est invalide", () => {
    expect(chemins(itemPT2("verifie", false))).toSatisfy(toutesSous("/assertion/source"));
  });

  it("un item vérifié T2 attesté par les deux annotateurs est valide", () => {
    expect(chemins(itemPT2("verifie", true))).toEqual([]);
  });

  it("une attestation à un seul vérificateur est invalide", () => {
    const item = itemPT2("verifie", true);
    source(item)["transcription_verifiee_par"] = ["a1"];
    expect(chemins(item)).toSatisfy(toutesSous("/assertion/source/transcription_verifiee_par"));
  });

  it("une attestation sur une source T1 est invalide", () => {
    const item = itemP();
    Object.assign(source(item), ATTESTATION);
    expect(chemins(item)).toSatisfy(toutesSous("/assertion/source"));
  });

  it("un item O vérifié dont seul l'état postérieur est T2, attesté, est valide (exemple réel)", () => {
    expect(chemins(itemO())).toEqual([]);
  });

  it("un item O vérifié dont l'état postérieur T2 n'est pas attesté est invalide", () => {
    const item = itemO();
    const posterieur = etat(item, "etat_posterieur")["source"] as Objet;
    delete posterieur["transcription_verifiee_par"];
    delete posterieur["transcription_verifiee_le"];
    expect(chemins(item)).toSatisfy(toutesSous("/obsolescence/etat_posterieur/source"));
  });

  it("un item A vérifié dont la source de couverture est T2 non attestée est invalide", () => {
    const item = itemA();
    absence(item)["source_couverture_theme"] = {
      ...SOURCE_T1,
      tier: "T2",
      type_document: "enregistrement_audio",
      format: "audio",
      page: undefined,
      extrait: EXTRAIT,
    };
    expect(chemins(JSON.parse(JSON.stringify(item)) as Objet)).toSatisfy(toutesSous("/absence/source_couverture_theme"));
  });
});

/* ------------------------------------------------------------------ n° 13 */

describe("conformité n° 13 : la règle T3 vaut pour les items O et A", () => {
  function itemOAvecT3(cle: "etat_anterieur" | "etat_posterieur", statut: string): Objet {
    const item = itemO();
    item["statut_validation"] = statut;
    etat(item, cle)["source"] = { ...SOURCE_T3 };
    return item;
  }

  function itemAAvecT3(statut: string): Objet {
    const item = itemA();
    item["statut_validation"] = statut;
    absence(item)["source_couverture_theme"] = { ...SOURCE_T3 };
    return item;
  }

  it("l'item A de référence de ce fichier est valide", () => {
    expect(chemins(itemA())).toEqual([]);
  });

  it("refuse un item O vérifié dont l'état postérieur est T3", () => {
    expect(chemins(itemOAvecT3("etat_posterieur", "verifie"))).toSatisfy(toutesSous("/statut_validation"));
  });

  it("refuse un item O vérifié dont l'état antérieur est T3", () => {
    expect(chemins(itemOAvecT3("etat_anterieur", "verifie"))).toSatisfy(toutesSous("/statut_validation"));
  });

  it("refuse un item A vérifié dont la source de couverture est T3", () => {
    expect(chemins(itemAAvecT3("verifie"))).toSatisfy(toutesSous("/statut_validation"));
  });

  it("accepte l'item O à état postérieur T3 en « à confirmer »", () => {
    // L'attestation de l'état postérieur T2 d'origine disparaît avec lui ; l'antérieur est T1.
    expect(chemins(itemOAvecT3("etat_posterieur", "a_confirmer"))).toEqual([]);
  });

  it("accepte l'item O à état antérieur T3 en « à confirmer », sans attestation sur l'état T2", () => {
    const item = itemOAvecT3("etat_anterieur", "a_confirmer");
    const posterieur = etat(item, "etat_posterieur")["source"] as Objet;
    delete posterieur["transcription_verifiee_par"];
    delete posterieur["transcription_verifiee_le"];
    expect(chemins(item)).toEqual([]);
  });

  it("accepte l'item A à couverture T3 en « à confirmer »", () => {
    expect(chemins(itemAAvecT3("a_confirmer"))).toEqual([]);
  });
});
