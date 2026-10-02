/**
 * Décision de l'auteur du 2026-10-02 : `requete.entetes` porte tous les en-têtes envoyés, sauf ceux
 * d'authentification, retirés par nom sans égard à la casse — la liste commune plus ceux que
 * déclare l'adaptateur. C'est le seul retrait autorisé.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EN_TETES_AUTHENTIFICATION, entetesEnregistrables, type Editeur } from "../../pipeline/interrogation/editeur.ts";
import { adaptateurSimule, TransportSimule } from "../../pipeline/interrogation/editeur-simule.ts";
import { executerRun } from "../../pipeline/interrogation/executer.ts";
import { DepotReponses } from "../../pipeline/interrogation/stockage.ts";
import { banc, CLE_API, plan, requete, RUN_ID, scenarioScripte, seule, type Banc } from "./aides.ts";

let courant: Banc | null = null;

afterEach(() => {
  courant?.nettoyer();
  courant = null;
});

describe("en-têtes stockés sans authentification, quelle que soit la casse", () => {
  it("retire authorization, x-api-key, api-key et les en-têtes déclarés par l'adaptateur, en toute casse", () => {
    const envoyes = {
      AUTHORIZATION: "Bearer secret",
      "X-Api-Key": "secret",
      "API-KEY": "secret",
      "x-JETON-simule": "secret",
      "Content-Type": "application/json",
      "X-Autre": "garde",
    };
    expect(entetesEnregistrables(envoyes, ["X-Jeton-Simule"])).toEqual({
      "Content-Type": "application/json",
      "X-Autre": "garde",
    });
    expect(EN_TETES_AUTHENTIFICATION).toEqual(["authorization", "x-api-key", "api-key"]);
  });

  it("une réponse écrite ne porte aucun en-tête d'authentification, et garde les autres tels qu'envoyés", async () => {
    const b = banc();
    courant = b;
    const simule = adaptateurSimule(CLE_API);
    const adaptateur = {
      ...simule,
      construireRequete: (entree: Parameters<typeof simule.construireRequete>[0]) => {
        const http = simule.construireRequete(entree);
        return {
          ...http,
          entetes: { ...http.entetes, "X-API-KEY": CLE_API, "Api-Key": CLE_API, "X-Trace-Simulee": "t-1" },
        };
      },
    };
    const transport = new TransportSimule(b.horloge, scenarioScripte(["reponse"]));
    const editeurs = new Map<string, Editeur>([["outil-alpha", { adaptateur, transport }]]);
    await executerRun(plan(requete()), {
      run_id: RUN_ID,
      fenetre: b.fenetre,
      horloge: b.horloge,
      depot: DepotReponses.ouvrir(b.reponses),
      repertoire_tentatives: b.tentatives,
      editeurs,
    });
    const reponse = seule(b.lues());
    expect(reponse.requete.entetes).toEqual({
      "content-type": "application/json",
      "x-version-api-simulee": "2026-12-01",
      "X-Trace-Simulee": "t-1",
    });
    const fichier = readFileSync(join(b.reponses, `${reponse.id}.json`), "utf8");
    expect(fichier).not.toContain(CLE_API);
    expect(seule(transport.recues).requete.entetes["X-Jeton-Simule"]).toBe(CLE_API);
  });
});
