/**
 * Signaux d'un fichier TypeScript, lus sur l'arbre syntaxique du compilateur (aucune exécution,
 * aucun type résolu) : fonctions longues, conversions `as`, défauts littéraux, `catch` muets.
 * Les nombres en dur sont cherchés dans les lignes de commentaire.
 */
import ts from "typescript";
import { compteurDans, SEUIL_FONCTION_LIGNES, type Signal } from "./signaux.ts";

type Visiteur = (noeud: ts.Node, source: ts.SourceFile, fichier: string) => Signal | null;

function ligneDe(noeud: ts.Node, source: ts.SourceFile): number {
  return source.getLineAndCharacterOfPosition(noeud.getStart(source)).line + 1;
}

function nomDeFonction(noeud: ts.SignatureDeclarationBase): string {
  if (noeud.name !== undefined) return noeud.name.getText();
  const parent = noeud.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) return parent.name.getText();
  return "(anonyme)";
}

function fonctionLongue(noeud: ts.Node, source: ts.SourceFile, fichier: string): Signal | null {
  const fonction = noeud as ts.SignatureDeclarationBase;
  const debut = ligneDe(noeud, source);
  const lignes = source.getLineAndCharacterOfPosition(noeud.getEnd()).line + 2 - debut;
  if (lignes <= SEUIL_FONCTION_LIGNES) return null;
  return { genre: "fonction-longue", fichier, ligne: debut, detail: `${nomDeFonction(fonction)} : ${lignes} lignes` };
}

function estAsConst(type: ts.TypeNode): boolean {
  return ts.isTypeReferenceNode(type) && type.typeName.getText() === "const";
}

function conversion(noeud: ts.Node, source: ts.SourceFile, fichier: string): Signal | null {
  const expression = noeud as ts.AsExpression | ts.TypeAssertion;
  if (estAsConst(expression.type)) return null;
  return { genre: "conversion", fichier, ligne: ligneDe(noeud, source), detail: `as ${expression.type.getText(source)}` };
}

const LITTERAUX = new Set([
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
]);

function estLitteral(noeud: ts.Expression): boolean {
  if (LITTERAUX.has(noeud.kind)) return true;
  if (ts.isArrayLiteralExpression(noeud)) return noeud.elements.length === 0;
  return ts.isObjectLiteralExpression(noeud) && noeud.properties.length === 0;
}

const OPERATEURS_DE_DEFAUT = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken]);

function defaut(noeud: ts.Node, source: ts.SourceFile, fichier: string): Signal | null {
  const binaire = noeud as ts.BinaryExpression;
  if (!OPERATEURS_DE_DEFAUT.has(binaire.operatorToken.kind) || !estLitteral(binaire.right)) return null;
  return { genre: "defaut", fichier, ligne: ligneDe(noeud, source), detail: binaire.getText(source) };
}

function capture(noeud: ts.Node, source: ts.SourceFile, fichier: string): Signal | null {
  const clause = noeud as ts.CatchClause;
  const sansNom = clause.variableDeclaration === undefined;
  const vide = clause.block.statements.length === 0;
  if (!sansNom && !vide) return null;
  const detail = vide ? "catch vide" : "catch sans nom : l'erreur d'origine est perdue";
  return { genre: "capture", fichier, ligne: ligneDe(noeud, source), detail };
}

const VISITEURS: ReadonlyMap<ts.SyntaxKind, Visiteur> = new Map<ts.SyntaxKind, Visiteur>([
  [ts.SyntaxKind.FunctionDeclaration, fonctionLongue],
  [ts.SyntaxKind.FunctionExpression, fonctionLongue],
  [ts.SyntaxKind.ArrowFunction, fonctionLongue],
  [ts.SyntaxKind.MethodDeclaration, fonctionLongue],
  [ts.SyntaxKind.AsExpression, conversion],
  [ts.SyntaxKind.TypeAssertionExpression, conversion],
  [ts.SyntaxKind.BinaryExpression, defaut],
  [ts.SyntaxKind.CatchClause, capture],
]);

function estLigneDeCommentaire(ligne: string): boolean {
  const debut = ligne.trimStart();
  return debut.startsWith("//") || debut.startsWith("*") || debut.startsWith("/*");
}

function compteurs(contenu: string, fichier: string): Signal[] {
  const signaux: Signal[] = [];
  contenu.split("\n").forEach((ligne, index) => {
    const trouve = estLigneDeCommentaire(ligne) ? compteurDans(ligne) : null;
    if (trouve !== null) signaux.push({ genre: "compteur", fichier, ligne: index + 1, detail: trouve });
  });
  return signaux;
}

export function signauxTypeScript(fichier: string, contenu: string): Signal[] {
  const source = ts.createSourceFile(fichier, contenu, ts.ScriptTarget.Latest, true);
  const signaux: Signal[] = [];
  const visiter = (noeud: ts.Node): void => {
    const signal = VISITEURS.get(noeud.kind)?.(noeud, source, fichier);
    if (signal !== undefined && signal !== null) signaux.push(signal);
    ts.forEachChild(noeud, visiter);
  };
  visiter(source);
  return [...signaux, ...compteurs(contenu, fichier)];
}
