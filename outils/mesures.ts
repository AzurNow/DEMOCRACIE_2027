/**
 * `pnpm mesures` — le registre des corrections de thème, côté auteur.
 *
 * Le thème appartient à la mesure, référent partagé entre candidats : un annotateur ne le
 * corrige pas depuis l'écran, il **demande** sa correction (§4, « Correction de thème »).
 * L'auteur tranche, et sa décision est tracée ici, dans un registre publié en ajout seul.
 *
 * Sans argument, la commande **liste** les demandes restées sans décision, avec leur ancienneté,
 * et n'écrit rien. L'écoulement du temps ne vaut jamais refus : l'âge est là pour que l'auteur
 * tranche, pas pour qu'une demande expire.
 *
 *   pnpm mesures
 *   pnpm mesures --mesure=<id> --theme=<theme> --decision=acceptee --ecrire
 *   pnpm mesures --mesure=<id> --theme=<theme> --decision=refusee --motif="..." --ecrire
 *
 * La commande n'écrit ni dans `data/` ni dans `staging/`. Accepter une demande ne modifie pas
 * la mesure : c'est une décision, pas une correction. La mesure se corrige en amont, dans le
 * pipeline, et `pnpm promote` refuse de promouvoir tant que les deux ne concordent pas.
 */

import { resolve } from "node:path";
import { analyserArguments, drapeau, obligatoire, texte, type Arguments } from "./arguments.ts";
import {
  ancienneteEnJours,
  decisionApplicable,
  validerEntreeRegistre,
  type DecisionCorrectionMesure,
  type RegistreCorrectionsMesure,
  type SensDecisionMesure,
} from "../validation/domaine/corrections-mesure.ts";
import type { EtatAnnotateur } from "../validation/domaine/journal.ts";
import { lotsApresSupersession } from "../validation/domaine/lot.ts";
import type { Correction, Lot, Mesure } from "../validation/domaine/types.ts";
import { etatsDuLot } from "../validation/io/lecture-croisee.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { ajouterAuRegistre, cheminRegistre, lireRegistre } from "../validation/io/mesures-fichier.ts";
import { chargerStaging, mesureDe, type Staging } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

interface Options {
  readonly ecrire: boolean;
  readonly staging: string;
  readonly lots: string;
  readonly decisions: string;
  readonly mesures: string;
  /** Mesure visée par une décision à enregistrer. Chaîne vide : simple listage. */
  readonly mesure: string;
}

function lireOptions(table: Arguments): Options {
  const racine = resolve(import.meta.dirname, "..");
  return {
    ecrire: drapeau(table, "ecrire"),
    staging: texte(table, "staging", resolve(racine, "staging")),
    lots: texte(table, "lots", resolve(racine, "validation/lots")),
    decisions: texte(table, "decisions", resolve(racine, "validation/decisions")),
    mesures: texte(table, "mesures", resolve(racine, "validation/mesures")),
    mesure: texte(table, "mesure", ""),
  };
}

/* ------------------------------------------------- demandes restées sans décision */

interface Demande {
  readonly item_id: string;
  readonly lot_id: string;
  readonly mesure: Mesure;
  readonly correction: Correction;
  readonly depuis: string;
  readonly anciennete_jours: number;
}

function demandesSansDecision(options: Options, instant: string): readonly Demande[] {
  const staging = chargerStaging(options.staging);
  const registre = lireRegistre(options.mesures);
  const demandes: Demande[] = [];
  for (const effectif of lotsApresSupersession(lireLots(options.lots))) {
    const etats = etatsDuLot(options.decisions, effectif.lot);
    for (const reference of effectif.items) {
      demandes.push(...demandesDeItem(effectif.lot, reference.item_id, { staging, registre, etats, instant }));
    }
  }
  return demandes;
}

interface Sources {
  readonly staging: Staging;
  readonly registre: RegistreCorrectionsMesure;
  readonly etats: ReadonlyMap<string, EtatAnnotateur>;
  readonly instant: string;
}

function demandesDeItem(lot: Lot, item_id: string, sources: Sources): readonly Demande[] {
  const item = sources.staging.items.get(item_id);
  if (item === undefined) return [];
  const mesure = mesureDe(sources.staging, item);
  const demandes: Demande[] = [];

  for (const etat of sources.etats.values()) {
    const decision = etat.decisions.get(item_id);
    if (decision === undefined) continue;
    for (const correction of decision.corrections) {
      if (correction.cible !== "mesure") continue;
      if (decisionApplicable(sources.registre, correction, mesure).verdict !== "absente") continue;
      demandes.push({
        item_id,
        lot_id: lot.lot_id,
        mesure,
        correction,
        depuis: decision.horodatage,
        anciennete_jours: ancienneteEnJours(decision.horodatage, sources.instant),
      });
    }
  }
  return demandes;
}

function imprimerDemandes(demandes: readonly Demande[]): void {
  process.stdout.write(`Demandes de correction sans décision au registre : ${demandes.length}\n`);
  for (const demande of [...demandes].sort((a, b) => b.anciennete_jours - a.anciennete_jours)) {
    process.stdout.write(
      `  ${demande.mesure.id}  ${demande.correction.chemin} : ` +
        `${demande.mesure.theme} → ${String(demande.correction.nouvelle_valeur)}\n` +
        `    item ${demande.item_id}  [${demande.lot_id}]  ${demande.anciennete_jours} jour(s), ` +
        `depuis le ${demande.depuis}\n`,
    );
  }
  process.stdout.write(
    "\nL'écoulement du temps ne vaut jamais refus (§4) : une demande attend une décision,\n" +
      "elle n'expire pas.\n",
  );
}

/* ------------------------------------------------------ enregistrer une décision */

function construireDecision(table: Arguments, options: Options): DecisionCorrectionMesure {
  const staging = chargerStaging(options.staging);
  const mesure = staging.mesures.get(options.mesure);
  if (mesure === undefined) {
    throw new Error(
      `Mesure ${options.mesure} introuvable dans ${options.staging}. Une décision se prend ` +
        `contre une mesure existante, dont la version est enregistrée avec elle.`,
    );
  }
  return validerEntreeRegistre(
    {
      mesure_id: mesure.id,
      mesure_version: mesure.version,
      theme_demande: obligatoire(table, "theme", "c'est le thème demandé qui est tranché."),
      decision: sensDemande(table),
      date: texte(table, "date", instantLocal(new Date()).slice(0, 10)),
      ...motifEventuel(table),
    },
    "arguments de la commande",
  );
}

function sensDemande(table: Arguments): SensDecisionMesure {
  const valeur = obligatoire(table, "decision", "« acceptee » ou « refusee », jamais implicite.");
  if (valeur !== "acceptee" && valeur !== "refusee") {
    throw new Error(`--decision vaut « acceptee » ou « refusee » : ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

function motifEventuel(table: Arguments): { readonly motif?: string } {
  const motif = texte(table, "motif", "");
  return motif.length === 0 ? {} : { motif };
}

function enregistrer(table: Arguments, options: Options): void {
  const decision = construireDecision(table, options);
  const etat = decision.decision === "acceptee" ? "acceptée" : "refusée";
  process.stdout.write(
    `Mesure ${decision.mesure_id} (version ${decision.mesure_version})\n` +
      `  thème demandé : ${decision.theme_demande}\n` +
      `  décision : ${etat} le ${decision.date}\n` +
      `  motif : ${decision.motif === undefined ? "—" : decision.motif}\n`,
  );

  if (!options.ecrire) {
    process.stdout.write(
      `\nSimulation : rien n'a été écrit dans ${cheminRegistre(options.mesures)}.\n` +
        "Ajouter --ecrire pour ajouter cette décision au registre.\n",
    );
    return;
  }
  const registre = ajouterAuRegistre(options.mesures, decision);
  process.stdout.write(
    `\nDécision ajoutée : le registre compte ${registre.length} entrée(s).\n` +
      "Une acceptation ne modifie pas la mesure : corriger la mesure en amont, sans quoi\n" +
      "`pnpm promote` s'arrêtera sur une acceptation sans mesure modifiée (§4).\n",
  );
}

function principal(): void {
  const table = analyserArguments(process.argv.slice(2));
  const options = lireOptions(table);
  if (options.mesure.length > 0) {
    enregistrer(table, options);
    return;
  }
  imprimerDemandes(demandesSansDecision(options, instantLocal(new Date())));
}

principal();
