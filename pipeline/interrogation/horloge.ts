/**
 * L'horloge et l'attente, injectées : l'exécution d'un run ne lit jamais `Date.now` ni
 * `setTimeout` directement.
 *
 * Deux implémentations. `horlogeSysteme` pour un run réel. `HorlogeVirtuelle` pour les tests et
 * pour `pnpm run:dry` : le temps n'avance que lorsque tout ce qui peut s'exécuter s'est exécuté,
 * et il saute alors à l'échéance la plus proche. Un run de 48 heures se simule ainsi en
 * millisecondes, avec les mêmes délais (30 s, 120 s, 180 s) et le même ordre d'événements entre
 * outils qu'en temps réel — c'est ce qui permet de tester qu'un outil en panne ne retarde pas un
 * autre.
 */

export type IssueAttente = "ecoulee" | "annulee";

export interface Horloge {
  /** Millisecondes depuis l'époque Unix. */
  maintenant(): number;
  /** Attend `ms`, ou moins si `signal` est levé avant : l'issue le dit, sans rejet. */
  attendre(ms: number, signal: AbortSignal): Promise<IssueAttente>;
}

export const horlogeSysteme: Horloge = {
  maintenant: () => Date.now(),
  attendre: (ms, signal) =>
    new Promise<IssueAttente>((resoudre) => {
      if (signal.aborted) {
        resoudre("annulee");
        return;
      }
      const minuterie = setTimeout(() => resoudre("ecoulee"), ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(minuterie);
          resoudre("annulee");
        },
        { once: true },
      );
    }),
};

interface Echeance {
  readonly instant: number;
  readonly ordre: number;
  readonly resoudre: (issue: IssueAttente) => void;
}

function precede(a: Echeance, b: Echeance): boolean {
  return a.instant < b.instant || (a.instant === b.instant && a.ordre < b.ordre);
}

/**
 * Temps simulé. Une échéance n'est servie qu'au tour suivant de la boucle d'événements
 * (`setImmediate`), une fois toutes les continuations en attente exécutées : chaque file d'outil
 * a donc posé sa prochaine échéance avant que le temps n'avance. À échéances égales, l'ordre de
 * pose départage, ce qui rend la simulation déterministe.
 *
 * Contrat : le code piloté par cette horloge ne fait que des entrées-sorties synchrones. Une
 * entrée-sortie asynchrone réelle laisserait le temps avancer pendant qu'elle est en vol.
 */
export class HorlogeVirtuelle implements Horloge {
  private instant: number;
  private ordre = 0;
  private readonly echeances: Echeance[] = [];
  private avanceeProgrammee = false;

  constructor(depart: number) {
    this.instant = depart;
  }

  maintenant(): number {
    return this.instant;
  }

  attendre(ms: number, signal: AbortSignal): Promise<IssueAttente> {
    if (!Number.isFinite(ms) || ms < 0) throw new Error(`Attente invalide : ${ms} ms.`);
    if (signal.aborted) return Promise.resolve("annulee");
    return new Promise<IssueAttente>((resoudre) => {
      const echeance: Echeance = { instant: this.instant + ms, ordre: this.ordre++, resoudre };
      this.echeances.push(echeance);
      signal.addEventListener("abort", () => this.annuler(echeance), { once: true });
      this.programmerAvancee();
    });
  }

  private annuler(echeance: Echeance): void {
    const rang = this.echeances.indexOf(echeance);
    if (rang === -1) return;
    this.echeances.splice(rang, 1);
    echeance.resoudre("annulee");
  }

  private programmerAvancee(): void {
    if (this.avanceeProgrammee) return;
    this.avanceeProgrammee = true;
    setImmediate(() => this.avancer());
  }

  private avancer(): void {
    this.avanceeProgrammee = false;
    const prochaine = this.retirerProchaine();
    if (prochaine === null) return;
    this.instant = Math.max(this.instant, prochaine.instant);
    prochaine.resoudre("ecoulee");
    if (this.echeances.length > 0) this.programmerAvancee();
  }

  private retirerProchaine(): Echeance | null {
    let meilleure: Echeance | null = null;
    for (const echeance of this.echeances) {
      if (meilleure === null || precede(echeance, meilleure)) meilleure = echeance;
    }
    if (meilleure !== null) this.echeances.splice(this.echeances.indexOf(meilleure), 1);
    return meilleure;
  }
}
