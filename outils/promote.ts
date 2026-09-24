/**
 * `pnpm promote` — la seule écriture vers `data/`, et elle est manuelle.
 *
 * Par défaut la commande **simule** : elle affiche ce qu'elle ferait et n'écrit rien. L'écriture
 * réelle exige `--ecrire`, saisi par un humain, et ne démarre pas si l'arbre Git n'est pas
 * propre — le commit courant est inscrit dans l'historique de chaque item promu, et il ne
 * décrirait pas l'état du dépôt si des modifications traînaient à côté.
 *
 * La commande ne commite pas : elle imprime la commande de commit, avec la liste des
 * identifiants promus. C'est l'humain qui signe.
 *
 *   pnpm promote
 *   pnpm promote --ecrire
 */

import { execFileSync } from "node:child_process";
import { analyserArguments, drapeau, texte } from "./arguments.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tauxNonEvaluable } from "../validation/domaine/analyse-lot.ts";
import { CorrectionMesureIncoherente, type RegistreCorrectionsMesure } from "../validation/domaine/corrections-mesure.ts";
import type { EtatAnnotateur } from "../validation/domaine/journal.ts";
import { lotsApresSupersession, type LotEffectif } from "../validation/domaine/lot.ts";
import { evaluerPromotion, type Issue } from "../validation/domaine/promotion.ts";
import type { EntreeDecision, Item, Lot } from "../validation/domaine/types.ts";
import { etatsDuLot } from "../validation/io/lecture-croisee.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { lireRegistre } from "../validation/io/mesures-fichier.ts";
import { chargerStaging, mesureDe, type Staging } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

interface Options {
  readonly ecrire: boolean;
  readonly racine: string;
  readonly staging: string;
  readonly lots: string;
  readonly decisions: string;
  readonly mesures: string;
  readonly data: string;
  readonly arbitrage: string;
}

interface Verdict {
  readonly lot_id: string;
  readonly item: Item;
  readonly issue: Issue;
}

function lireOptions(): Options {
  const racine = resolve(import.meta.dirname, "..");
  const table = analyserArguments(process.argv.slice(2));
  return {
    ecrire: drapeau(table, "ecrire"),
    racine,
    staging: texte(table, "staging", resolve(racine, "staging")),
    lots: texte(table, "lots", resolve(racine, "validation/lots")),
    decisions: texte(table, "decisions", resolve(racine, "validation/decisions")),
    mesures: texte(table, "mesures", resolve(racine, "validation/mesures")),
    data: texte(table, "data", resolve(racine, "data/items")),
    arbitrage: texte(table, "arbitrage", resolve(racine, "validation/arbitrage")),
  };
}

function arbrePropre(racine: string): boolean {
  const sortie = execFileSync("git", ["status", "--porcelain"], { cwd: racine, encoding: "utf8" });
  return sortie.trim().length === 0;
}

function commitCourant(racine: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: racine, encoding: "utf8" }).trim();
}

function decisionsActives(etats: ReadonlyMap<string, EtatAnnotateur>, item_id: string): EntreeDecision[] {
  const actives: EntreeDecision[] = [];
  for (const etat of etats.values()) {
    const decision = etat.decisions.get(item_id);
    if (decision !== undefined) actives.push(decision);
  }
  return actives;
}

interface Contexte {
  readonly commit: string;
  readonly horodatage: string;
  readonly registre: RegistreCorrectionsMesure;
}

/**
 * Un lot n'est évalué que sur les items qu'il juge encore : ceux qu'aucun lot de réannotation
 * postérieur ne reprend (§4, supersession). Le lot d'origine reste lu, publié et diagnostiqué ;
 * ses décisions ne comptent simplement plus pour les items rejugés.
 */
function evaluerLot(
  effectif: LotEffectif,
  staging: Staging,
  options: Options,
  contexte: Contexte,
): readonly Verdict[] {
  const etats = etatsDuLot(options.decisions, effectif.lot);
  const verdicts: Verdict[] = [];

  for (const reference of effectif.items) {
    const item = staging.items.get(reference.item_id);
    if (item === undefined) continue;
    const issue = evaluerPromotion(
      {
        item,
        mesure: mesureDe(staging, item),
        lot_id: effectif.lot.lot_id,
        lot_nature: effectif.lot.nature,
        decisions: decisionsActives(etats, item.id),
        registre_corrections_mesure: contexte.registre,
      },
      contexte,
    );
    verdicts.push({ lot_id: effectif.lot.lot_id, item, issue });
  }
  return verdicts;
}

function imprimerRapport(
  verdicts: readonly Verdict[],
  effectifs: readonly LotEffectif[],
  options: Options,
): void {
  const promus = verdicts.filter((verdict) => verdict.issue.sort === "promouvoir");
  const arbitrages = verdicts.filter((verdict) => verdict.issue.sort === "arbitrage");
  const attentes = verdicts.filter((verdict) => verdict.issue.sort === "attente");

  process.stdout.write(`\nÀ promouvoir : ${promus.length}\n`);
  for (const verdict of promus) {
    const issue = verdict.issue as Extract<Issue, { sort: "promouvoir" }>;
    const correction = issue.corrections_appliquees ? ", corrections appliquées" : "";
    process.stdout.write(`  ${verdict.item.id}  ${issue.statut}${correction}  [${verdict.lot_id}]\n`);
  }

  process.stdout.write(`\nVers l'arbitrage : ${arbitrages.length}\n`);
  for (const verdict of arbitrages) {
    const issue = verdict.issue as Extract<Issue, { sort: "arbitrage" }>;
    process.stdout.write(`  ${verdict.item.id}  ${issue.motif}${motifDuRefus(issue)}  [${verdict.lot_id}]\n`);
  }

  process.stdout.write(`\nEn attente : ${attentes.length}\n`);
  const parMotif = new Map<string, number>();
  for (const verdict of attentes) {
    const motif = (verdict.issue as Extract<Issue, { sort: "attente" }>).motif;
    parMotif.set(motif, (parMotif.get(motif) ?? 0) + 1);
  }
  for (const [motif, nombre] of [...parMotif].sort()) {
    process.stdout.write(`  ${motif} : ${nombre}\n`);
  }

  imprimerDemandesDeCorrection(attentes);
  imprimerSupersessions(effectifs);
  imprimerNonEvaluables(
    effectifs.map((effectif) => effectif.lot),
    options,
  );
}

/** §4 : « Une demande refusée envoie l'item en arbitrage, avec le motif du refus. » */
function motifDuRefus(issue: Extract<Issue, { sort: "arbitrage" }>): string {
  if (issue.motif_refus === undefined) return "";
  return ` — ${issue.motif_refus}`;
}

/**
 * §4 : les demandes de correction de thème sans décision sont rapportées avec leur ancienneté,
 * **à part** du reste. L'écoulement du temps ne vaut jamais refus : l'âge est publié pour que
 * l'auteur tranche, jamais comparé à un délai au terme duquel la demande expirerait.
 */
function imprimerDemandesDeCorrection(attentes: readonly Verdict[]): void {
  const demandes = attentes.filter(
    (verdict) => (verdict.issue as Extract<Issue, { sort: "attente" }>).demande !== undefined,
  );
  process.stdout.write(`\nCorrections de mesure sans décision au registre : ${demandes.length}\n`);
  for (const verdict of demandes) {
    const issue = verdict.issue as Extract<Issue, { sort: "attente" }>;
    const demande = issue.demande as NonNullable<typeof issue.demande>;
    process.stdout.write(
      `  ${verdict.item.id}  mesure ${demande.mesure_id}  ${demande.chemin} → ` +
        `${demande.valeur_demandee}  ${demande.anciennete_jours} jour(s)  [${verdict.lot_id}]\n`,
    );
  }
}

/**
 * Le lot supersédé reste publié et son kappa reste calculé : il ne compte simplement plus pour
 * le §12. La distinction est portée par la donnée `supersede_par`, pas par un tri à l'affichage.
 */
function imprimerSupersessions(effectifs: readonly LotEffectif[]): void {
  const supersedes = effectifs.filter((effectif) => effectif.supersede_par !== null);
  if (supersedes.length === 0) return;
  process.stdout.write("\nSupersession (§4) :\n");
  for (const effectif of supersedes) {
    process.stdout.write(
      `  ${effectif.lot.lot_id} supersédé par ${effectif.supersede_par} — ` +
        `${effectif.items.length} item(s) encore jugés par lui\n`,
    );
  }
}

/**
 * §4, garde-fou : le taux de « non évaluable » par annotateur est publié par lot. Il apparaît
 * ici, dans le rapport lu par l'auteur, et **jamais** dans l'interface — un annotateur qui
 * verrait le taux de l'autre ne serait plus à l'aveugle.
 */
function imprimerNonEvaluables(lots: readonly Lot[], options: Options): void {
  process.stdout.write("\nTaux de « non évaluable » par annotateur et par lot :\n");
  for (const lot of lots) {
    const etats = etatsDuLot(options.decisions, lot);
    const parts = [...etats]
      .map(([annotateur, etat]) => {
        const taux = tauxNonEvaluable(etat, lot);
        return `${annotateur} ${taux === null ? "—" : `${(taux * 100).toFixed(1)} %`}`;
      })
      .join("   ");
    process.stdout.write(`  ${lot.lot_id} : ${parts}\n`);
  }
}

function ecrire(verdicts: readonly Verdict[], options: Options): void {
  mkdirSync(options.data, { recursive: true });
  mkdirSync(options.arbitrage, { recursive: true });

  const promus: string[] = [];
  for (const verdict of verdicts) {
    if (verdict.issue.sort !== "promouvoir") continue;
    const item = verdict.issue.item;
    writeFileSync(join(options.data, `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`, "utf8");
    promus.push(item.id);
  }

  const file = verdicts
    .filter((verdict) => verdict.issue.sort === "arbitrage")
    .map((verdict) => ({
      item_id: verdict.item.id,
      lot_id: verdict.lot_id,
      motif: (verdict.issue as Extract<Issue, { sort: "arbitrage" }>).motif,
    }));
  writeFileSync(
    join(options.arbitrage, "file.json"),
    `${JSON.stringify({ date: instantLocal(new Date()), entrees: file }, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    `\n${promus.length} item(s) écrit(s) dans ${options.data}\n` +
      `${file.length} entrée(s) dans la file d'arbitrage.\n\n` +
      `Rien n'est commité : c'est vous qui signez.\n\n` +
      `  git add data/items validation/arbitrage\n` +
      `  git commit -m "data: promotion de ${promus.length} item(s)\n\n` +
      promus.map((identifiant) => `  ${identifiant}`).join("\n") +
      `\n"\n`,
  );
}

function principal(): void {
  const options = lireOptions();
  if (options.ecrire && !arbrePropre(options.racine)) {
    process.stderr.write(
      "Arbre Git non propre. --ecrire inscrit le commit courant dans l'historique de chaque item\n" +
        "promu ; avec des modifications non commitées à côté, ce commit ne décrirait pas l'état\n" +
        "du dépôt. Commitez ou remisez, puis relancez.\n",
    );
    process.exitCode = 1;
    return;
  }

  const staging = chargerStaging(options.staging);
  // Le registre est **lu**, jamais écrit ici : seul `pnpm mesures --ecrire` y ajoute une décision.
  const contexte = {
    commit: commitCourant(options.racine),
    horodatage: instantLocal(new Date()),
    registre: lireRegistre(options.mesures),
  };
  const effectifs = lotsApresSupersession(lireLots(options.lots));
  const verdicts = effectifs.flatMap((effectif) => evaluerLot(effectif, staging, options, contexte));

  imprimerRapport(verdicts, effectifs, options);

  if (!options.ecrire) {
    process.stdout.write("\nSimulation : rien n'a été écrit. Ajouter --ecrire pour écrire dans data/.\n");
    return;
  }
  ecrire(verdicts, options);
}

try {
  principal();
} catch (erreur) {
  // §4 : « une acceptation enregistrée sans mesure modifiée est une erreur bloquante ». Elle
  // arrête la commande plutôt que de promouvoir un item validé contre un thème inexistant.
  if (!(erreur instanceof CorrectionMesureIncoherente)) throw erreur;
  process.stderr.write(`\n${erreur.message}\n`);
  process.exitCode = 1;
}
