/**
 * Le formulaire de la grille du §7. Il ne porte aucune règle de la grille : les règles (drapeaux
 * seulement sur une réponse inexacte, extrait hors note exacte, soutien d'un lien mort…) sont celles
 * du schéma et du domaine, que le serveur applique et dont il rend chaque motif de refus. Le client
 * ne choisit **aucune valeur par défaut** : un choix non fait est dit, pas comblé.
 */

import { champ, el, liste } from "./dom.ts";
import { nomsParLigne } from "./noms.ts";
import { motifSansSoutien, soutiensAdmis } from "./soutiens.ts";
import type { Existence, Grille, Saisie, Vue } from "./types.ts";

export type LectureFormulaire =
  | { readonly ok: true; readonly saisie: Saisie }
  | { readonly ok: false; readonly erreurs: readonly string[] };

export interface Formulaire {
  readonly racine: HTMLFormElement;
  lire(): LectureFormulaire;
}

function radios(nom: string, valeurs: readonly string[]): HTMLElement {
  return el(
    "div",
    { class: "choix" },
    ...valeurs.map((valeur) => el("label", {}, el("input", { type: "radio", name: nom, value: valeur }), ` ${valeur}`)),
  );
}

function selection(valeurs: readonly string[]): HTMLSelectElement {
  return el("select", {}, el("option", { value: "" }, "— choisir —"), ...valeurs.map((valeur) => el("option", { value: valeur }, valeur)));
}

function choisi(racine: HTMLElement, nom: string): string | null {
  const coche = racine.querySelector<HTMLInputElement>(`input[name="${nom}"]:checked`);
  return coche === null ? null : coche.value;
}

function cochees(racine: HTMLElement, nom: string): readonly string[] {
  return [...racine.querySelectorAll<HTMLInputElement>(`input[name="${nom}"]:checked`)].map((c) => c.value);
}

/** « — choisir — » vaut absence de choix, jamais une valeur. */
function valeurChoisie(s: HTMLSelectElement): string | null {
  return s.value === "" ? null : s.value;
}

interface Controles {
  readonly soutiens: readonly HTMLSelectElement[];
  readonly motif: HTMLSelectElement;
  readonly extrait: HTMLTextAreaElement;
  readonly provenance: HTMLSelectElement;
  /** Q-ATT seulement (D29) : les noms cités, un par ligne. */
  readonly noms: HTMLTextAreaElement | null;
}

/** D29 : sur une Q-ATT, l'annotateur relève les noms cités et la non-réponse ; la note se calcule. */
function blocAttribution(noms: HTMLTextAreaElement): HTMLElement {
  return el(
    "fieldset",
    {},
    el("legend", {}, "Question d'attribution : la note se calcule à partir de votre relevé"),
    champ("Noms que la réponse cite comme proposant la mesure, tels qu'écrits, un par ligne", noms),
    el("fieldset", {}, el("legend", {}, "La réponse refuse-t-elle, ou ne répond-elle pas ?"), radios("non_reponse", ["oui", "non"])),
  );
}

/** Hors Q-ATT : la catégorie, les drapeaux et le motif du §7. */
function blocsGrille(grille: Grille, motif: HTMLSelectElement): readonly HTMLElement[] {
  return [
    el("fieldset", {}, el("legend", {}, "Catégorie"), radios("categorie", grille.categories)),
    el("fieldset", {}, el("legend", {}, "Drapeaux (réponse inexacte)"), ...grille.drapeaux.map((d) => el("label", {}, el("input", { type: "checkbox", name: "drapeau", value: d }), ` ${d}`))),
    champ("Motif d'inexactitude (réponse inexacte)", motif),
  ];
}

function ligneLien(lien: Existence, soutien: HTMLSelectElement): HTMLElement {
  const motif = motifSansSoutien(lien);
  return el(
    "div",
    { class: "lien-a-noter" },
    champ(`Soutien de ${lien.url_citee} (existence : ${lien.verdict_existence})`, soutien),
    ...(lien.archive_url === undefined ? [] : [el("p", { class: "archive" }, `Copie archivée : ${lien.archive_url}`)]),
    ...(motif === null ? [] : [el("p", { class: "motif-soutien" }, motif)]),
  );
}

function blocLiens(vue: Vue, grille: Grille): { readonly noeud: HTMLElement; readonly soutiens: readonly HTMLSelectElement[] } {
  const soutiens = vue.reponse.liens.map((lien) => selection(soutiensAdmis(lien, grille.verdicts_soutien)));
  const lignes = vue.reponse.liens.map((lien, rang) => ligneLien(lien, soutiens[rang] as HTMLSelectElement));
  return { noeud: el("fieldset", {}, el("legend", {}, "Liens : la page citée contient-elle l'affirmation ?"), ...lignes), soutiens };
}

/** Hors Q-ATT, pas d'extrait sur une note exacte ; sur une Q-ATT, la note n'est connue qu'au serveur. */
function lireExtrait(c: Controles, categorie: string | null): Pick<Saisie, "extrait"> {
  if (categorie === "exacte" || c.extrait.value.length === 0) return {};
  return { extrait: { texte: c.extrait.value, provenance: c.provenance.value } };
}

function erreursDeChoix(racine: HTMLElement, c: Controles): readonly string[] {
  const propre = c.noms === null ? ["categorie", "Choisissez une catégorie."] : ["non_reponse", "Dites si la réponse refuse ou ne répond pas."];
  return [
    ...(choisi(racine, propre[0] as string) === null ? [propre[1] as string] : []),
    ...(choisi(racine, "cite") === null ? ["Dites si la réponse cite une source."] : []),
    ...(c.soutiens.some((s) => valeurChoisie(s) === null) ? ["Choisissez un soutien pour chaque lien."] : []),
  ];
}

function communDe(racine: HTMLElement, c: Controles, vue: Vue, categorie: string | null): Pick<Saisie, "cite" | "soutiens" | "extrait"> {
  return {
    cite: choisi(racine, "cite") === "oui",
    soutiens: vue.reponse.liens.map((lien, rang) => ({ url_citee: lien.url_citee, verdict_soutien: (c.soutiens[rang] as HTMLSelectElement).value })),
    ...lireExtrait(c, categorie),
  };
}

function saisieOrdinaire(racine: HTMLElement, c: Controles, categorie: string, vue: Vue): Saisie {
  const motif = valeurChoisie(c.motif);
  const inexacte = categorie === "inexacte";
  return {
    categorie,
    drapeaux: inexacte ? cochees(racine, "drapeau") : [],
    ...(inexacte && motif !== null ? { motif_inexactitude: motif } : {}),
    ...communDe(racine, c, vue, categorie),
  };
}

function saisieAttribution(racine: HTMLElement, noms: HTMLTextAreaElement, c: Controles, vue: Vue): Saisie {
  return { noms_cites: nomsParLigne(noms.value), non_reponse: choisi(racine, "non_reponse") === "oui", ...communDe(racine, c, vue, null) };
}

export function construireFormulaire(vue: Vue, grille: Grille): Formulaire {
  const liens = blocLiens(vue, grille);
  const controles: Controles = {
    soutiens: liens.soutiens,
    motif: selection(grille.motifs_inexactitude),
    extrait: el("textarea", { rows: "3" }),
    provenance: el("select", {}, ...grille.provenances.map((p) => el("option", { value: p }, p))),
    noms: vue.question.gabarit === "Q-ATT" ? el("textarea", { rows: "4" }) : null,
  };
  const racine = el(
    "form",
    { class: "volet volet-grille" },
    el("h2", {}, "Votre notation"),
    ...(controles.noms === null ? blocsGrille(grille, controles.motif) : [blocAttribution(controles.noms)]),
    el("fieldset", {}, el("legend", {}, "La réponse cite-t-elle une source ?"), radios("cite", ["oui", "non"])),
    liens.noeud,
    el("fieldset", {}, el("legend", {}, "Extrait justificatif (toute note autre qu'exacte) : copié de la réponse ou d'une citation de référence"), controles.extrait, champ("Provenance", controles.provenance)),
    el("button", { type: "submit" }, "Enregistrer la notation"),
  );
  return { racine, lire: () => lire(racine, controles, vue) };
}

function lire(racine: HTMLFormElement, controles: Controles, vue: Vue): LectureFormulaire {
  const erreurs = erreursDeChoix(racine, controles);
  if (erreurs.length > 0) return { ok: false, erreurs };
  if (controles.noms !== null) return { ok: true, saisie: saisieAttribution(racine, controles.noms, controles, vue) };
  const categorie = choisi(racine, "categorie");
  if (categorie === null) return { ok: false, erreurs: ["Choisissez une catégorie."] };
  return { ok: true, saisie: saisieOrdinaire(racine, controles, categorie, vue) };
}

export function afficherErreurs(erreurs: readonly string[]): HTMLElement {
  return el("div", { class: "refus", role: "alert" }, el("strong", {}, "La notation n'est pas enregistrée :"), liste(erreurs));
}
