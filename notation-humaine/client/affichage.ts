/**
 * L'affichage d'une vue : exactement ce que reçoit un juge, et rien d'autre. Le client ne reçoit rien
 * de plus (ni l'outil, ni une note, ni le motif de la tâche) : il n'y a donc rien à masquer ici.
 */

import { el, liste } from "./dom.ts";
import type { EtatItem, ItemSoumis, Vue } from "./types.ts";

function etat(titre: string, e: EtatItem): HTMLElement {
  return el(
    "div",
    { class: "etat" },
    el("strong", {}, titre),
    liste([
      `Position : ${e.position}`,
      `Paraphrase : ${e.paraphrase}`,
      `Citation : « ${e.citation_verbatim} »`,
      ...(e.quantification === undefined ? [] : [`Quantification : ${JSON.stringify(e.quantification)}`]),
    ]),
  );
}

function reference(item: ItemSoumis): HTMLElement {
  const fin = item.valide_au === null ? "sans fin" : item.valide_au;
  return el(
    "section",
    { class: "reference" },
    el("h3", {}, `Item ${item.type} · ${item.role} · candidat ${item.candidat_id}`),
    el("p", { class: "note" }, `Valide du ${item.valide_du} au ${fin}`),
    ...(item.assertion === undefined ? [] : [etat("Assertion", item.assertion)]),
    ...(item.obsolescence === undefined
      ? []
      : [
          el("p", { class: "note" }, `Changement de position le ${item.obsolescence.date_changement}`),
          etat("Avant le changement", item.obsolescence.etat_anterieur),
          etat("Après le changement", item.obsolescence.etat_posterieur),
        ]),
  );
}

function lienExistant(vue: Vue): HTMLElement {
  if (vue.reponse.liens.length === 0) return el("p", { class: "note" }, "La réponse ne cite aucun lien.");
  return el(
    "ul",
    { class: "liens" },
    ...vue.reponse.liens.map((lien) => el("li", {}, `${lien.url_citee} — existence : ${lien.verdict_existence} (testé le ${lien.date_test})`)),
  );
}

function citations(vue: Vue): readonly HTMLElement[] {
  const liste_citations = vue.reponse.citations;
  if (liste_citations === undefined || liste_citations.length === 0) return [];
  return [
    el("h3", {}, "Citations de la réponse"),
    liste(liste_citations.map((c) => `${c.url ?? "(sans lien)"} — ${c.texte ?? "(sans texte)"}`)),
  ];
}

function avertissements(vue: Vue): readonly HTMLElement[] {
  return [
    ...(vue.reponse.troncature ? [el("p", { class: "alerte" }, "Réponse tronquée par l'outil.")] : []),
    ...(vue.reponse.refus_api ? [el("p", { class: "alerte" }, "Refus de modération de l'API.")] : []),
  ];
}

/** Le volet gauche : la question, la réponse telle que projetée, ses liens, les références. */
export function afficherVue(vue: Vue): HTMLElement {
  return el(
    "div",
    { class: "volet volet-vue" },
    el("p", { class: "note" }, `Question ${vue.question.gabarit} · run du ${vue.date_run}`),
    el("h2", {}, "Question posée"),
    el("p", { class: "question" }, vue.question.texte),
    el("h2", {}, "Réponse"),
    ...avertissements(vue),
    el("p", { class: "reponse" }, vue.reponse.texte),
    el("h3", {}, "Liens cités"),
    lienExistant(vue),
    ...citations(vue),
    el("h2", {}, "Items de référence"),
    ...vue.references.map(reference),
  );
}
