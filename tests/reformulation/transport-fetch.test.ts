/**
 * Transport réel, essayé sur un `fetch` factice : aucun test n'appelle le réseau. Les octets du corps
 * sont rendus tels quels ; un échec de `fetch` devient `ErreurReseau`, sans en-tête ni clé.
 */

import { describe, expect, it } from "vitest";
import { ErreurReseau } from "../../pipeline/interrogation/editeur.ts";
import { transportFetch } from "../../pipeline/reformulation/transport-fetch.ts";

const REQUETE = {
  endpoint: "https://api.invalid/v1/chat/completions",
  entetes: { authorization: "Bearer cle-secrete-123" },
  corps: { model: "m" },
};

describe("transport fetch", () => {
  it("envoie un POST JSON avec les en-têtes, rend statut et octets exacts", async () => {
    const octets = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    const vus: { url: string; init: RequestInit }[] = [];
    const transport = transportFetch((url, init) => {
      vus.push({ url, init });
      return Promise.resolve(new Response(octets, { status: 201 }));
    });
    const reponse = await transport.envoyer(REQUETE, new AbortController().signal);
    expect(reponse.statut).toBe(201);
    expect([...reponse.corps]).toEqual([...octets]);
    expect(vus[0]?.url).toBe(REQUETE.endpoint);
    expect(vus[0]?.init.method).toBe("POST");
    expect(vus[0]?.init.body).toBe('{"model":"m"}');
  });

  it("cas limite 6 : fetch rejeté ⇒ ErreurReseau, message sans la clé", async () => {
    const transport = transportFetch(() => Promise.reject(new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") })));
    const echec = transport.envoyer(REQUETE, new AbortController().signal);
    await expect(echec).rejects.toThrow(ErreurReseau);
    await expect(echec).rejects.toThrow(/ECONNREFUSED/u);
    await expect(echec).rejects.not.toThrow(/cle-secrete-123/u);
  });

  it("corps coupé pendant la lecture ⇒ ErreurReseau", async () => {
    const coupe = new ReadableStream<Uint8Array>({
      start(controleur) {
        controleur.error(new Error("connexion coupée"));
      },
    });
    const transport = transportFetch(() => Promise.resolve(new Response(coupe, { status: 200 })));
    await expect(transport.envoyer(REQUETE, new AbortController().signal)).rejects.toThrow(ErreurReseau);
  });
});
