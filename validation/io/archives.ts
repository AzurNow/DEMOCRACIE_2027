/**
 * Service des sources archivées, avec vérification d'empreinte avant affichage.
 *
 * « La source telle qu'archivée » est la promesse que fait l'écran de validation à
 * l'annotateur. Ici, elle devient une propriété vérifiée : le sha256 du fichier local est
 * recalculé à chaque demande et comparé à celui que porte l'item. En cas d'écart, rien n'est
 * servi — un annotateur qui compare une citation à un document qui n'est plus celui qui a été
 * archivé valide une chose et en signe une autre.
 *
 * Le coût est un hachage de quelques mégaoctets par affichage, soit quelques millisecondes.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export type MotifRefus = "hors_perimetre" | "fichier_absent" | "empreinte_divergente" | "pas_un_fichier";

export interface ArchiveServie {
  readonly ok: true;
  readonly contenu: Buffer;
  readonly type_mime: string;
  readonly chemin: string;
}

export interface ArchiveRefusee {
  readonly ok: false;
  readonly motif: MotifRefus;
  readonly detail: string;
}

const TYPES_MIME: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

export interface DemandeArchive {
  /** Racine autorisée : aucun fichier hors de cet arbre n'est servi. */
  readonly racine: string;
  /** Chemin tel que l'item le porte, relatif à la racine du dépôt. */
  readonly chemin_local: string;
  /** Empreinte attendue, celle de l'item. */
  readonly sha256: string;
}

export function servirArchive(demande: DemandeArchive): ArchiveServie | ArchiveRefusee {
  const chemin = resolve(demande.racine, demande.chemin_local);
  const dedans = relative(demande.racine, chemin);
  if (dedans.startsWith("..") || isAbsolute(dedans)) {
    return { ok: false, motif: "hors_perimetre", detail: demande.chemin_local };
  }
  if (!existsSync(chemin)) {
    return { ok: false, motif: "fichier_absent", detail: chemin };
  }
  if (!statSync(chemin).isFile()) {
    return { ok: false, motif: "pas_un_fichier", detail: chemin };
  }

  const contenu = readFileSync(chemin);
  const obtenue = createHash("sha256").update(contenu).digest("hex");
  if (obtenue !== demande.sha256) {
    return {
      ok: false,
      motif: "empreinte_divergente",
      detail: `attendue ${demande.sha256}, obtenue ${obtenue}`,
    };
  }

  return { ok: true, contenu, type_mime: typeMime(chemin), chemin };
}

function typeMime(chemin: string): string {
  const point = chemin.lastIndexOf(".");
  const extension = point < 0 ? "" : chemin.slice(point).toLowerCase();
  return TYPES_MIME[extension] ?? "application/octet-stream";
}
