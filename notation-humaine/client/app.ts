/**
 * L'écran de notation humaine : une tâche à la fois, dans l'ordre de la file du serveur. Chaque
 * échec du serveur (refus de la grille, tâche indisponible, double soumission, erreur inattendue) est
 * montré tel qu'il est rendu ; rien n'est avalé, rien n'est reformulé.
 */

import { api, EchecApi } from "./api.ts";
import { afficherVue } from "./affichage.ts";
import { el, liste, vider } from "./dom.ts";
import { afficherErreurs, construireFormulaire } from "./formulaire.ts";
import type { FileDeTravail, MotifRefus, Session } from "./types.ts";

function cible(id: string): HTMLElement {
  const noeud = document.getElementById(id);
  if (noeud === null) throw new Error(`Élément #${id} absent de la page.`);
  return noeud;
}

function afficherComptes(file: FileDeTravail): void {
  cible("comptes").textContent =
    `À noter : ${file.a_noter.length} · ` +
    `en attente du test des liens : ${file.en_attente_test_des_liens} · ` +
    `en attente d'un juge : ${file.attend_juge} · ` +
    `sans motif admis : ${file.sans_motif_admis}`;
}

/** Ce que le serveur a répondu en échec, dit en clair : un refus de grille liste tous ses motifs. */
function messagesDeLEchec(echec: EchecApi): readonly string[] {
  const corps = echec.corps as { motifs?: readonly MotifRefus[]; erreur?: string; detail?: string | readonly string[] } | null;
  if (corps === null) return [`Échec HTTP ${echec.statut}.`];
  if (corps.motifs !== undefined) return corps.motifs.map((m) => `${m.code} — ${m.detail}`);
  const detail = corps.detail === undefined ? [] : [corps.detail].flat();
  return [`${corps.erreur === undefined ? `HTTP ${echec.statut}` : corps.erreur} — ${detail.join(" ; ")}`];
}

/** D30 (2) : le serveur demande à l'humain de décider la note d'une Q-ATT indécidable. */
function exigeNoteDecidee(echec: EchecApi): boolean {
  const corps = echec.corps as { motifs?: readonly MotifRefus[] } | null;
  return corps !== null && corps.motifs !== undefined && corps.motifs.some((m) => m.code === "attribution_indecidable");
}

function afficherFile(file: FileDeTravail): void {
  const ecran = cible("ecran");
  vider(ecran);
  ecran.append(
    el(
      "div",
      { class: "vide" },
      el("h2", {}, "Rien à noter pour le moment"),
      liste([
        `Réponses en attente du test des liens : ${file.en_attente_test_des_liens}`,
        `Réponses en attente d'un juge : ${file.attend_juge}`,
        `Réponses sans motif admis : ${file.sans_motif_admis}`,
      ]),
    ),
  );
}

async function afficherTache(session: Session, reponse_id: string): Promise<void> {
  const vue = await api.vue(reponse_id);
  const formulaire = construireFormulaire(vue, session.grille);
  const retour = el("div", { class: "retour" });
  formulaire.racine.append(retour);
  formulaire.racine.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    void soumettre(session, reponse_id, formulaire, retour);
  });
  const ecran = cible("ecran");
  vider(ecran);
  ecran.append(el("div", { class: "volets" }, afficherVue(vue), formulaire.racine));
}

async function soumettre(session: Session, reponse_id: string, formulaire: ReturnType<typeof construireFormulaire>, retour: HTMLElement): Promise<void> {
  vider(retour);
  const lecture = formulaire.lire();
  if (!lecture.ok) {
    retour.append(afficherErreurs(lecture.erreurs));
    return;
  }
  try {
    await api.noter(reponse_id, lecture.saisie);
  } catch (erreur) {
    if (!(erreur instanceof EchecApi)) throw erreur;
    if (exigeNoteDecidee(erreur)) formulaire.revelerNoteDecidee();
    retour.append(afficherErreurs(messagesDeLEchec(erreur)));
    return;
  }
  await suivante(session);
}

async function suivante(session: Session): Promise<void> {
  const file = await api.file();
  afficherComptes(file);
  const [premiere] = file.a_noter;
  if (premiere === undefined) afficherFile(file);
  else await afficherTache(session, premiere.reponse_id);
}

async function demarrer(): Promise<void> {
  const session = await api.session();
  cible("identite").textContent = `Annotateur ${session.annotateur_id} · run ${session.run_id} · grille ${session.version_grille}`;
  await suivante(session);
}

demarrer().catch((erreur: unknown) => {
  const ecran = cible("ecran");
  vider(ecran);
  ecran.append(el("p", { class: "alerte", role: "alert" }, `Erreur : ${erreur instanceof Error ? erreur.message : String(erreur)}`));
});
