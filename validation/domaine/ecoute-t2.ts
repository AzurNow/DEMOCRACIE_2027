/**
 * Vérification à l'oreille des transcriptions T2 (§4, §9 ; conformité n° 12, décision de l'auteur
 * du 2026-09-27, option « question explicite »).
 *
 * Le pipeline n'écoute rien : il ne peut donc pas attester qu'une transcription est fidèle. Ce sont
 * les deux annotateurs qui répondent, dans la grille, « J'ai écouté l'extrait et la transcription
 * est fidèle » ; un item dont une source de contenu est T2 n'est vérifié que si les deux répondent
 * oui, et `pnpm promote` écrit alors l'attestation sur chaque source T2.
 *
 * « Source de contenu » : l'assertion d'un item P, chacun des deux états d'un item O, la source de
 * couverture d'un item A — les emplacements que l'interface de validation affiche. Les sources
 * nouvelles d'une contestation n'en sont pas : personne ne les écoute à la validation.
 */

import type { EntreeDecision, Item, Source } from "./types.ts";

/** Les sources de contenu d'un item, dans l'ordre d'affichage. Un item F n'en a aucune. */
export function sourcesDuContenu(item: Item): readonly Source[] {
  return [
    item.assertion?.source,
    item.obsolescence?.etat_anterieur.source,
    item.obsolescence?.etat_posterieur.source,
    item.absence?.source_couverture_theme,
  ].filter((source): source is Source => source !== undefined);
}

export function porteUneSourceT2(item: Item): boolean {
  return sourcesDuContenu(item).some((source) => source.tier === "T2");
}

/** Oui des deux : une réponse absente ne vaut jamais oui. */
export function transcriptionEcouteeParLesDeux(decisions: readonly EntreeDecision[]): boolean {
  return decisions.length === 2 && decisions.every((decision) => decision.questions_specifiques?.transcription_ecoutee === true);
}

/**
 * Date civile de la plus tardive des décisions, telle qu'écrite dans son horodatage (fuseau de
 * l'annotateur). Les instants sont comparés comme instants : deux horodatages à décalages
 * différents ne se comparent pas comme des chaînes.
 */
function dateDeLaPlusTardive(decisions: readonly EntreeDecision[]): string {
  const [premiere, ...autres] = decisions;
  if (premiere === undefined) throw new Error("Attestation d'écoute sans décision.");
  const tardive = autres.reduce(
    (retenue, decision) => (Date.parse(decision.horodatage) > Date.parse(retenue.horodatage) ? decision : retenue),
    premiere,
  );
  return tardive.horodatage.slice(0, 10);
}

/**
 * L'item, chaque source T2 de contenu portant l'attestation d'écoute des deux annotateurs. Refuse
 * d'attester si les deux n'ont pas répondu oui : l'appelant doit l'avoir vérifié, et une
 * attestation fausse publiée est pire qu'une promotion arrêtée.
 */
export function attesterTranscriptions(item: Item, decisions: readonly EntreeDecision[]): Item {
  if (!porteUneSourceT2(item)) return item;
  if (!transcriptionEcouteeParLesDeux(decisions)) {
    throw new Error(`Item ${item.id} : attestation d'écoute demandée sans deux « oui » à la question d'écoute.`);
  }
  const attestation = {
    transcription_verifiee_par: decisions.map((decision) => decision.annotateur_id).sort(),
    transcription_verifiee_le: dateDeLaPlusTardive(decisions),
  };
  const attester = (source: Source): Source => (source.tier === "T2" ? { ...source, ...attestation } : source);
  return appliquerAuxSources(item, attester);
}

function appliquerAuxSources(item: Item, transformer: (source: Source) => Source): Item {
  const { assertion, obsolescence, absence } = item;
  return {
    ...item,
    ...(assertion === undefined ? {} : { assertion: { ...assertion, source: transformer(assertion.source) } }),
    ...(obsolescence === undefined
      ? {}
      : {
          obsolescence: {
            ...obsolescence,
            etat_anterieur: { ...obsolescence.etat_anterieur, source: transformer(obsolescence.etat_anterieur.source) },
            etat_posterieur: { ...obsolescence.etat_posterieur, source: transformer(obsolescence.etat_posterieur.source) },
          },
        }),
    ...(absence === undefined
      ? {}
      : { absence: { ...absence, source_couverture_theme: transformer(absence.source_couverture_theme) } }),
  };
}
