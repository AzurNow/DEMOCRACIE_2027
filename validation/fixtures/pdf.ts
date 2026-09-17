/**
 * Écriture d'un PDF minimal, à la main.
 *
 * Le jeu de démonstration a besoin d'un vrai PDF : un fichier factice ne serait pas ouvert par
 * le visionneur du navigateur, et l'écran de validation ne serait donc pas exercé pour de bon.
 * Quarante lignes ici valent mieux qu'une bibliothèque de génération de PDF ajoutée aux
 * dépendances d'un projet qui n'en produira jamais en production.
 *
 * Le texte est encodé en latin-1 avec `/WinAnsiEncoding`, ce qui suffit au français.
 */

export interface PagePdf {
  readonly titre: string;
  readonly lignes: readonly string[];
}

const LARGEUR = 595;
const HAUTEUR = 842;

export function construirePdf(pages: readonly PagePdf[]): Buffer {
  const objets: string[] = [];
  const numerosPages = pages.map((_, index) => 3 + index * 2);

  objets.push("<< /Type /Catalog /Pages 2 0 R >>");
  objets.push(
    `<< /Type /Pages /Kids [${numerosPages.map((numero) => `${numero} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );

  pages.forEach((page, index) => {
    const numeroPage = 3 + index * 2;
    const numeroFlux = numeroPage + 1;
    objets.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] ` +
        `/Resources << /Font << /F1 ${1 + pages.length * 2 + 2} 0 R >> >> /Contents ${numeroFlux} 0 R >>`,
    );
    objets.push(flux(contenuPage(page)));
  });

  objets.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  return assembler(objets);
}

function contenuPage(page: PagePdf): string {
  const morceaux = ["BT", "/F1 16 Tf", `1 0 0 1 60 ${HAUTEUR - 80} Tm`, `(${echapper(page.titre)}) Tj`, "ET"];
  morceaux.push("BT", "/F1 11 Tf", "14 TL", `1 0 0 1 60 ${HAUTEUR - 130} Tm`);
  for (const ligne of page.lignes) morceaux.push(`(${echapper(ligne)}) Tj`, "T*");
  morceaux.push("ET");
  return morceaux.join("\n");
}

function echapper(texte: string): string {
  return texte.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function flux(contenu: string): string {
  const octets = Buffer.from(contenu, "latin1");
  return `<< /Length ${octets.length} >>\nstream\n${contenu}\nendstream`;
}

function assembler(objets: readonly string[]): Buffer {
  let document = "%PDF-1.4\n";
  const decalages: number[] = [];

  objets.forEach((objet, index) => {
    decalages.push(Buffer.from(document, "latin1").length);
    document += `${index + 1} 0 obj\n${objet}\nendobj\n`;
  });

  const debutXref = Buffer.from(document, "latin1").length;
  document += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const decalage of decalages) {
    document += `${String(decalage).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;

  return Buffer.from(document, "latin1");
}
