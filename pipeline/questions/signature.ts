/**
 * Ce qui fait qu'une question est « la même » d'un run à l'autre : seule définition du dépôt.
 *
 * §5 (protocole 0.9) : « Une question est reprise si elle porte le même identifiant et les mêmes
 * empreintes de texte qu'au run précédent ; une question dont un texte a changé compte comme
 * neuve. » §8 : « Une question est commune aux deux runs quand elle a le même identifiant […] et
 * que ses trois formulations ont le même texte, à l'empreinte près. »
 *
 * Le tirage (reprise, §5) et la tendance (questions communes, §8) lisent cette signature, et
 * aucun des deux ne la recalcule : deux définitions de la même égalité divergeraient, et une
 * question comptée reprise par le tirage sortirait de la tendance sans que rien ne le dise. Elle vit
 * dans `pipeline/questions/` parce que le flux va du pipeline vers l'analyse, jamais l'inverse.
 */

/** La part d'une question que la signature lit : son identifiant et l'empreinte de chaque texte. */
export interface QuestionSignable {
  readonly id: string;
  readonly formulations: readonly { readonly empreinte_texte: string }[];
}

/**
 * Identifiant, puis les empreintes des formulations triées : l'ordre du tableau n'est pas une
 * propriété de la question, un texte changé l'est. Le séparateur U+0000 ne figure ni dans un
 * identifiant ni dans une empreinte hexadécimale.
 */
export function signatureQuestion(question: QuestionSignable): string {
  const empreintes = question.formulations.map((formulation) => formulation.empreinte_texte).sort();
  return `${question.id}\0${empreintes.join("\0")}`;
}
