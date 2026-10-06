/** Appels au serveur local. Aucune URL absolue : tout est relatif à l'origine servie. */

import type { FileDeTravail, Saisie, Session, Vue } from "./types.ts";

/** Réponse HTTP en erreur : le statut et le corps renvoyés par le serveur, tels quels. */
export class EchecApi extends Error {
  readonly statut: number;
  readonly corps: unknown;

  constructor(statut: number, corps: unknown) {
    super(`HTTP ${statut}`);
    this.statut = statut;
    this.corps = corps;
  }
}

async function demander<T>(chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await fetch(chemin, options);
  const texte = await reponse.text();
  const corps: unknown = texte.length === 0 ? null : JSON.parse(texte);
  if (!reponse.ok) throw new EchecApi(reponse.status, corps);
  return corps as T;
}

export const api = {
  session: () => demander<Session>("/api/session"),
  file: () => demander<FileDeTravail>("/api/file"),
  vue: (reponse_id: string) => demander<Vue>(`/api/vue/${encodeURIComponent(reponse_id)}`),
  noter: (reponse_id: string, saisie: Saisie) =>
    demander<{ ok: true; id: string }>("/api/notations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reponse_id, saisie }),
    }),
};
