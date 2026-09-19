import { existsSync, readFileSync } from "node:fs";
import type { ErrorObject } from "ajv";
import { join } from "node:path";
import { listerFichiersExemplesSurDisque } from "./disque.ts";
import { copierErreurs } from "./erreurs.ts";
import type { Attendu, EntreeManifeste, Manifeste } from "./manifeste.ts";
import { estNomSchema, urnSchema } from "./noms.ts";
import type { InstanceAjv } from "./registre.ts";

export type Obtenu = "valide" | "invalide" | "absent";

export interface ResultatExemple {
  readonly objet: string;
  readonly chemin: string;
  readonly attendu: Attendu;
  readonly obtenu: Obtenu;
  readonly erreurs: readonly ErrorObject[];
  readonly reussi: boolean;
}

export interface RapportValidation {
  readonly resultats: readonly ResultatExemple[];
  readonly fichiersOrphelins: readonly string[];
}

function resultatFichierAbsent(entree: EntreeManifeste): ResultatExemple {
  return {
    objet: entree.objet,
    chemin: entree.fichier,
    attendu: entree.attendu,
    obtenu: "absent",
    erreurs: [],
    reussi: false,
  };
}

function schemaDeLObjet(ajv: InstanceAjv, objet: string, fichier: string) {
  if (!estNomSchema(objet)) {
    throw new Error(`manifeste : objet "${objet}" (${fichier}) n'est pas un des dix schémas connus.`);
  }
  const validateur = ajv.getSchema(urnSchema(objet));
  if (validateur === undefined) {
    throw new Error(`aucun schéma enregistré pour l'objet "${objet}" (${fichier}) : registre incomplet.`);
  }
  return validateur;
}

/** Une entrée du manifeste, jugée : pure une fois le registre et le disque lus (pas d'I/O ici). */
function validerUneEntree(ajv: InstanceAjv, racineExemples: string, entree: EntreeManifeste): ResultatExemple {
  const cheminAbsolu = join(racineExemples, entree.fichier);
  if (!existsSync(cheminAbsolu)) return resultatFichierAbsent(entree);

  const donnee: unknown = JSON.parse(readFileSync(cheminAbsolu, "utf8"));
  const validateur = schemaDeLObjet(ajv, entree.objet, entree.fichier);
  const valide = validateur(donnee) === true;
  const erreurs = valide ? [] : copierErreurs(validateur.errors);
  const obtenu: Obtenu = valide ? "valide" : "invalide";

  return {
    objet: entree.objet,
    chemin: entree.fichier,
    attendu: entree.attendu,
    obtenu,
    erreurs,
    reussi: obtenu === entree.attendu,
  };
}

function trouverFichiersOrphelins(racineExemples: string, manifeste: Manifeste): readonly string[] {
  const cheminsAttendus = new Set(manifeste.exemples.map((entree) => entree.fichier));
  return listerFichiersExemplesSurDisque(racineExemples).filter((chemin) => !cheminsAttendus.has(chemin));
}

/**
 * Fonction pure demandée par le brief : compare chaque exemple du manifeste au verdict du
 * registre ajv, sans supposer d'objet particulier — le mapping objet → schéma est une donnée
 * (`urnSchema`), jamais un `if` par type d'objet. `allErrors: true` est réglé une fois pour
 * toutes dans `registre.ts` : les erreurs collectées ici sont donc déjà la liste complète.
 */
export function validerContreManifeste(
  ajv: InstanceAjv,
  racineExemples: string,
  manifeste: Manifeste,
): RapportValidation {
  const resultats = manifeste.exemples.map((entree) => validerUneEntree(ajv, racineExemples, entree));
  const fichiersOrphelins = trouverFichiersOrphelins(racineExemples, manifeste);
  return { resultats, fichiersOrphelins };
}
