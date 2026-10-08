/**
 * L'affichage d'une vue : projette en DOM la structure de `contenu-vue.ts`, sans lire la vue
 * elle-même. Le client ne reçoit rien de plus que ce que reçoit un juge (ni l'outil, ni une note, ni
 * le motif de la tâche) : il n'y a donc rien à masquer ici.
 */

import { contenuVue, type Bloc } from "./contenu-vue.ts";
import { el, liste } from "./dom.ts";
import type { Vue } from "./types.ts";

function projeter(bloc: Bloc): HTMLElement {
  switch (bloc.genre) {
    case "titre":
      return bloc.niveau === 2 ? el("h2", {}, bloc.texte) : el("h3", {}, bloc.texte);
    case "paragraphe":
      return el("p", { class: bloc.classe }, bloc.texte);
    case "liste":
      return bloc.classe === null ? liste(bloc.lignes) : liste(bloc.lignes, { class: bloc.classe });
    case "groupe":
      return el(bloc.element, { class: bloc.classe }, ...bloc.blocs.map(projeter));
  }
}

/** Le volet gauche : la question, la réponse telle que projetée, ses liens, les références. */
export function afficherVue(vue: Vue): HTMLElement {
  return el("div", { class: "volet volet-vue" }, ...contenuVue(vue).map(projeter));
}
