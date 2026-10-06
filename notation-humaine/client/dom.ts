/** Construction du DOM sans framework. Le texte passe toujours par `textContent` : jamais de HTML injecté. */

type Attributs = Readonly<Record<string, string>>;
type Enfant = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(balise: K, attributs: Attributs = {}, ...enfants: readonly Enfant[]): HTMLElementTagNameMap[K] {
  const noeud = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) noeud.setAttribute(cle, valeur);
  noeud.append(...enfants);
  return noeud;
}

export function vider(noeud: Element): void {
  noeud.replaceChildren();
}

/** Un champ à libellé : le libellé enveloppe le contrôle. */
export function champ(libelle: string, controle: HTMLElement): HTMLLabelElement {
  return el("label", { class: "champ" }, el("span", {}, libelle), controle);
}

export function liste(valeurs: readonly string[], attributs: Attributs = {}): HTMLUListElement {
  return el("ul", attributs, ...valeurs.map((valeur) => el("li", {}, valeur)));
}

/** Les éléments d'une liste séparée par des virgules, sans blancs ni éléments vides. */
export function separerParVirgules(texte: string): readonly string[] {
  return texte
    .split(",")
    .map((element) => element.trim())
    .filter((element) => element.length > 0);
}
