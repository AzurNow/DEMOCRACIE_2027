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
 * Chaque item à promouvoir est confronté à `item.schema.json` **après** application des
 * corrections et **avant** toute écriture. Un seul item non conforme est nommé au rapport, avec
 * les chemins fautifs, et bloque l'écriture comme un item introuvable : code de sortie non nul,
 * rien n'est écrit dans `data/`.
 *
 *   pnpm promote
 *   pnpm promote --ecrire
 */

import { analyserArguments, drapeau, texte } from "./arguments.ts";
import { existsSync } from "node:fs";
import { commandeGit, commitCourant, ecriturePermise } from "./garde-fous-git.ts";
import { ItemFictifEnDouble, verifierFictifUnique } from "../validation/domaine/fictif-unique.ts";
import { resolve } from "node:path";
import { tauxNonEvaluable } from "../validation/domaine/analyse-lot.ts";
import { CorrectionMesureIncoherente, type RegistreCorrectionsMesure } from "../validation/domaine/corrections-mesure.ts";
import type { EtatAnnotateur } from "../validation/domaine/journal.ts";
import { lotsApresSupersession, type LotEffectif } from "../validation/domaine/lot.ts";
import { evaluerPromotion, type Issue } from "../validation/domaine/promotion.ts";
import type { EntreeDecision, Item, Lot } from "../validation/domaine/types.ts";
import { cheminItem, creerItem, lireItemsData } from "../validation/io/data-items.ts";
import { ecrireFileArbitrage } from "../validation/io/file-arbitrage.ts";
import { etatsDuLot } from "../validation/io/lecture-croisee.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { lireRegistre } from "../validation/io/mesures-fichier.ts";
import { chargerStaging, mesureDe, type Staging } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";
import { erreurDeSchema } from "./schemas/valider.ts";

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

/** Un item qu'un lot juge mais que `staging/` ne contient pas : il ne disparaît jamais en silence. */
interface Introuvable {
  readonly lot_id: string;
  readonly item_id: string;
}

/** Un item à promouvoir que ses corrections ont rendu non conforme à `item.schema.json`. */
interface NonConforme {
  readonly lot_id: string;
  readonly item_id: string;
  readonly erreur: string;
}

interface EvaluationLot {
  readonly verdicts: readonly Verdict[];
  readonly introuvables: readonly Introuvable[];
}

function lireOptions(): Options {
  const table = analyserArguments(process.argv.slice(2));
  // `--racine` : le dépôt dont l'arbre doit être propre et dont HEAD est inscrit (bac d'essai des tests).
  const racine = texte(table, "racine", resolve(import.meta.dirname, ".."));
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
): EvaluationLot {
  const etats = etatsDuLot(options.decisions, effectif.lot);
  const verdicts: Verdict[] = [];
  const introuvables: Introuvable[] = [];

  for (const reference of effectif.items) {
    const item = staging.items.get(reference.item_id);
    if (item === undefined) {
      introuvables.push({ lot_id: effectif.lot.lot_id, item_id: reference.item_id });
      continue;
    }
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
  return { verdicts, introuvables };
}

/**
 * Un item déjà présent dans `data/` n'est jamais réécrit : ce qui y a changé depuis sa promotion
 * (décision du panel, correction) ne doit pas être écrasé par son état de `staging/`. Relancer
 * la promotion est donc sans effet sur lui.
 */
function dejaDansData(verdict: Verdict, options: Options): boolean {
  return existsSync(cheminItem(options.data, verdict.item.id));
}

function imprimerEcriturePrevue(promus: readonly Verdict[], options: Options): void {
  const deja = promus.filter((verdict) => dejaDansData(verdict, options));
  process.stdout.write(`\nÀ écrire par --ecrire : ${promus.length - deja.length}\n`);
  process.stdout.write(`Déjà dans data/, non réécrits : ${deja.length}\n`);
  for (const verdict of deja) process.stdout.write(`  ${verdict.item.id}  [${verdict.lot_id}]\n`);
}

function imprimerIntrouvables(introuvables: readonly Introuvable[]): void {
  if (introuvables.length === 0) return;
  process.stdout.write(`\nItems des lots introuvables dans staging : ${introuvables.length}\n`);
  for (const introuvable of introuvables) {
    process.stdout.write(`  ${introuvable.item_id}  [${introuvable.lot_id}]\n`);
  }
}

function cheminDansData(item: Item, options: Options): string {
  return cheminItem(options.data, item.id);
}

/** Les items que `--ecrire` écrirait, confrontés au schéma dans l'état exact où ils le seraient. */
function nonConformes(verdicts: readonly Verdict[], options: Options): readonly NonConforme[] {
  const trouves: NonConforme[] = [];
  for (const verdict of verdicts) {
    if (verdict.issue.sort !== "promouvoir" || dejaDansData(verdict, options)) continue;
    const item = verdict.issue.item;
    const erreur = erreurDeSchema("item", item, cheminDansData(item, options));
    if (erreur !== null) trouves.push({ lot_id: verdict.lot_id, item_id: item.id, erreur: erreur.message });
  }
  return trouves;
}

/**
 * Frontière d'entrée : les items déjà dans `data/`, chacun confronté à `item.schema.json`. Un
 * répertoire absent est un `data/` vide ; un fichier non conforme arrête la commande.
 */
function itemsDeData(options: Options): readonly Item[] {
  return [...lireItemsData(options.data).values()];
}

/**
 * §5 (protocole 0.9) : « Une mesure fictive porte un seul item fictif. » Les items que `--ecrire`
 * écrirait, ajoutés à ceux de `data/`, ne donnent à aucune mesure fictive un second item F vérifié ;
 * sinon `ItemFictifEnDouble` arrête la commande, en simulation comme à l'écriture.
 */
function controlerFictifUnique(verdicts: readonly Verdict[], options: Options): void {
  const aEcrire = verdicts
    .filter((verdict) => verdict.issue.sort === "promouvoir" && !dejaDansData(verdict, options))
    .map((verdict) => (verdict.issue as Extract<Issue, { sort: "promouvoir" }>).item);
  verifierFictifUnique(aEcrire, itemsDeData(options));
}

function imprimerNonConformes(liste: readonly NonConforme[]): void {
  if (liste.length === 0) return;
  process.stdout.write(`\nItems à promouvoir non conformes au schéma : ${liste.length}\n`);
  for (const nonConforme of liste) {
    process.stdout.write(`  ${nonConforme.item_id}  [${nonConforme.lot_id}]\n`);
    process.stdout.write(`${nonConforme.erreur.replace(/^/gm, "    ")}\n`);
  }
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

  imprimerEcriturePrevue(promus, options);
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
  const promus: string[] = [];
  for (const verdict of verdicts) {
    if (verdict.issue.sort !== "promouvoir" || dejaDansData(verdict, options)) continue;
    // Seule écriture vers `data/items/` : `creerItem` revalide contre le schéma, quel que soit le
    // chemin qui y mène, et refuse d'écraser un item déjà publié.
    creerItem(options.data, verdict.issue.item);
    promus.push(verdict.issue.item.id);
  }

  const file = verdicts
    .filter((verdict) => verdict.issue.sort === "arbitrage")
    .map((verdict) => ({
      item_id: verdict.item.id,
      lot_id: verdict.lot_id,
      motif: (verdict.issue as Extract<Issue, { sort: "arbitrage" }>).motif,
    }));
  ecrireFileArbitrage(options.arbitrage, instantLocal(new Date()), file);

  process.stdout.write(
    `\n${promus.length} item(s) écrit(s) dans ${options.data}\n` +
      `${file.length} entrée(s) dans la file d'arbitrage.\n\n` +
      commandeGit(["data/items", "validation/arbitrage"], `data: promotion de ${promus.length} item(s)`, promus),
  );
}

function principal(): void {
  const options = lireOptions();
  if (options.ecrire && !ecriturePermise(options.racine)) return;

  const staging = chargerStaging(options.staging);
  // Le registre est **lu**, jamais écrit ici : seul `pnpm mesures --ecrire` y ajoute une décision.
  const contexte = {
    commit: commitCourant(options.racine),
    horodatage: instantLocal(new Date()),
    registre: lireRegistre(options.mesures),
  };
  const effectifs = lotsApresSupersession(lireLots(options.lots));
  const evaluations = effectifs.map((effectif) => evaluerLot(effectif, staging, options, contexte));
  const verdicts = evaluations.flatMap((evaluation) => evaluation.verdicts);
  const introuvables = evaluations.flatMap((evaluation) => evaluation.introuvables);

  const fautifs = nonConformes(verdicts, options);

  imprimerRapport(verdicts, effectifs, options);
  imprimerIntrouvables(introuvables);
  imprimerNonConformes(fautifs);
  controlerFictifUnique(verdicts, options);

  if (introuvables.length > 0) {
    process.stderr.write(
      "\nDes items jugés sont introuvables dans staging/ : rien n'est écrit tant qu'ils ne sont pas\n" +
        "retrouvés ou retirés de leur lot.\n",
    );
    process.exitCode = 1;
    return;
  }
  if (fautifs.length > 0) {
    process.stderr.write(
      "\nDes items à promouvoir ne sont pas conformes à schema/item.schema.json : rien n'est écrit\n" +
        "dans data/ tant que leurs corrections ne sont pas reprises.\n",
    );
    process.exitCode = 1;
    return;
  }
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
  // §5 (protocole 0.9) : un second item F vérifié sur une mesure fictive déjà portée, de même.
  if (!(erreur instanceof CorrectionMesureIncoherente) && !(erreur instanceof ItemFictifEnDouble)) throw erreur;
  process.stderr.write(`\n${erreur.message}\n`);
  process.exitCode = 1;
}
