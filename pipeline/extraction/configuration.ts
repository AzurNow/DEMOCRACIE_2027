/**
 * Configuration de l'extraction double (décision D52 (1) et (3)) : les deux modèles, **dans
 * l'ordre**, et la version du prompt. Les modèles sont des données : aucun `if` ne lit leur nom.
 * Le premier fournit les champs d'un item apparié ; `assertion.extraction.modeles` les liste dans
 * cet ordre.
 *
 * §4 exige deux modèles « de familles différentes ». Le cœur n'a aucun moyen de connaître la
 * famille d'un identifiant et n'en invente pas de table : il refuse seulement deux identifiants
 * identiques. La différence de famille reste une affaire de configuration, relue par l'auteur.
 */

export interface ConfigurationExtraction {
  /** Identifiants des deux modèles, dans l'ordre de la configuration. */
  readonly modeles: readonly [string, string];
  /** Version du prompt envoyé aux deux modèles, par exemple `prompts/extraction-1.0.0`. */
  readonly version_prompt: string;
}

export class ModelesIdentiques extends Error {
  constructor(modele: string) {
    super(
      `Les deux extracteurs portent le même identifiant « ${modele} » : l'extraction double exige deux ` +
        `modèles distincts (§4, décision D52 (1)).`,
    );
    this.name = "ModelesIdentiques";
  }
}

export class ConfigurationIncomplete extends Error {
  constructor(champ: string) {
    super(`Configuration de l'extraction : ${champ} est vide. Aucune valeur par défaut.`);
    this.name = "ConfigurationIncomplete";
  }
}

export function exigerConfiguration(configuration: ConfigurationExtraction): void {
  const [premier, second] = configuration.modeles;
  if (premier.length === 0) throw new ConfigurationIncomplete("modeles[0]");
  if (second.length === 0) throw new ConfigurationIncomplete("modeles[1]");
  if (configuration.version_prompt.length === 0) throw new ConfigurationIncomplete("version_prompt");
  if (premier === second) throw new ModelesIdentiques(premier);
}
