/** Appels au serveur local. Aucune URL absolue : tout est relatif à l'origine servie. */

import type { Brouillon, Diagnostic, Raccourcis, Session, VueItem, VueLot } from "./types.ts";

export interface Echec {
  statut: number;
  corps: unknown;
}

async function demander<T>(chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await fetch(chemin, options);
  const texte = await reponse.text();
  const corps: unknown = texte.length === 0 ? null : JSON.parse(texte);
  if (!reponse.ok) throw { statut: reponse.status, corps } as Echec;
  return corps as T;
}

export const api = {
  session: () => demander<Session>("/api/session"),
  raccourcis: () => demander<Raccourcis>("/api/raccourcis"),
  lot: (lot_id: string) => demander<VueLot>(`/api/lots/${encodeURIComponent(lot_id)}`),
  diagnostic: (lot_id: string) => demander<Diagnostic>(`/api/lots/${encodeURIComponent(lot_id)}/diagnostic`),
  item: (lot_id: string, item_id: string) =>
    demander<VueItem>(`/api/lots/${encodeURIComponent(lot_id)}/items/${encodeURIComponent(item_id)}`),
  decider: (charge: unknown) =>
    demander<{ ok: true; id: string }>("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(charge),
    }),
  annuler: (lot_id: string) =>
    demander<{ ok: true; id: string; item_id: string }>("/api/annulations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lot_id }),
    }),
  lireBrouillon: () => demander<Brouillon | null>("/api/brouillon"),
  ecrireBrouillon: (brouillon: Brouillon) =>
    demander<null>("/api/brouillon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(brouillon),
    }),
};

export function urlSource(lot_id: string, item_id: string, cle: string): string {
  return `/api/lots/${encodeURIComponent(lot_id)}/items/${encodeURIComponent(item_id)}/source/${encodeURIComponent(cle)}`;
}
