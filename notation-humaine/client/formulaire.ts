/**
 * Le formulaire de la grille du §7. Il ne porte aucune règle de la grille : les règles (drapeaux
 * seulement sur une réponse inexacte, extrait hors note exacte, soutien d'un lien mort…) sont celles
 * du schéma et du domaine, que le serveur applique et dont il rend chaque motif de refus. Le client
 * ne choisit **aucune valeur par défaut** : un choix non fait est dit, pas comblé.
 */

import { champ, el, liste, separerParVirgules } from "./dom.ts";
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
  readonly attribution: readonly [HTMLInputElement, HTMLInputElement, HTMLInputElement] | null;
}

function blocAttribution(): { readonly noeud: HTMLElement; readonly champs: NonNullable<Controles["attribution"]> } {
  const attendus = el("input", { type: "text" });
  const cites = el("input", { type: "text" });
  const hors = el("input", { type: "text" });
  const noeud = el(
    "fieldset",
    {},
    el("legend", {}, "Attribution (Q-ATT) — identifiants séparés par des virgules"),
    champ("Candidats attendus", attendus),
    champ("Candidats cités par la réponse", cites),
    champ("Noms cités hors périmètre", hors),
  );
  return { noeud, champs: [attendus, cites, hors] };
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

function lireAttribution(champs: Controles["attribution"]): Pick<Saisie, "attribution"> {
  if (champs === null) return {};
  const [attendus, cites, hors] = champs;
  const horsListe = separerParVirgules(hors.value);
  return { attribution: { attendus: separerParVirgules(attendus.value), cites: separerParVirgules(cites.value), ...(horsListe.length === 0 ? {} : { hors_perimetre_cites: horsListe }) } };
}

function lireExtrait(c: Controles, categorie: string): Pick<Saisie, "extrait"> {
  if (categorie === "exacte" || c.extrait.value.length === 0) return {};
  return { extrait: { texte: c.extrait.value, provenance: c.provenance.value } };
}

function erreursDeChoix(racine: HTMLElement, c: Controles): readonly string[] {
  return [
    ...(choisi(racine, "categorie") === null ? ["Choisissez une catégorie."] : []),
    ...(choisi(racine, "cite") === null ? ["Dites si la réponse cite une source."] : []),
    ...(c.soutiens.some((s) => valeurChoisie(s) === null) ? ["Choisissez un soutien pour chaque lien."] : []),
  ];
}

function saisieDe(racine: HTMLElement, c: Controles, categorie: string, vue: Vue): Saisie {
  const motif = valeurChoisie(c.motif);
  const inexacte = categorie === "inexacte";
  return {
    categorie,
    drapeaux: inexacte ? cochees(racine, "drapeau") : [],
    cite: choisi(racine, "cite") === "oui",
    soutiens: vue.reponse.liens.map((lien, rang) => ({ url_citee: lien.url_citee, verdict_soutien: (c.soutiens[rang] as HTMLSelectElement).value })),
    ...(inexacte && motif !== null ? { motif_inexactitude: motif } : {}),
    ...lireAttribution(c.attribution),
    ...lireExtrait(c, categorie),
  };
}

export function construireFormulaire(vue: Vue, grille: Grille): Formulaire {
  const liens = blocLiens(vue, grille);
  const attribution = vue.question.gabarit === "Q-ATT" ? blocAttribution() : null;
  const controles: Controles = {
    soutiens: liens.soutiens,
    motif: selection(grille.motifs_inexactitude),
    extrait: el("textarea", { rows: "3" }),
    provenance: el("select", {}, ...grille.provenances.map((p) => el("option", { value: p }, p))),
    attribution: attribution === null ? null : attribution.champs,
  };
  const racine = el(
    "form",
    { class: "volet volet-grille" },
    el("h2", {}, "Votre notation"),
    el("fieldset", {}, el("legend", {}, "Catégorie"), radios("categorie", grille.categories)),
    el("fieldset", {}, el("legend", {}, "Drapeaux (réponse inexacte)"), ...grille.drapeaux.map((d) => el("label", {}, el("input", { type: "checkbox", name: "drapeau", value: d }), ` ${d}`))),
    champ("Motif d'inexactitude (réponse inexacte)", controles.motif),
    el("fieldset", {}, el("legend", {}, "La réponse cite-t-elle une source ?"), radios("cite", ["oui", "non"])),
    liens.noeud,
    ...(attribution === null ? [] : [attribution.noeud]),
    el("fieldset", {}, el("legend", {}, "Extrait justificatif (toute note autre qu'exacte) : copié de la réponse ou d'une citation de référence"), controles.extrait, champ("Provenance", controles.provenance)),
    el("button", { type: "submit" }, "Enregistrer la notation"),
  );
  return { racine, lire: () => lire(racine, controles, vue) };
}

function lire(racine: HTMLFormElement, controles: Controles, vue: Vue): LectureFormulaire {
  const erreurs = erreursDeChoix(racine, controles);
  const categorie = choisi(racine, "categorie");
  if (erreurs.length > 0 || categorie === null) return { ok: false, erreurs };
  return { ok: true, saisie: saisieDe(racine, controles, categorie, vue) };
}

export function afficherErreurs(erreurs: readonly string[]): HTMLElement {
  return el("div", { class: "refus", role: "alert" }, el("strong", {}, "La notation n'est pas enregistrée :"), liste(erreurs));
}
