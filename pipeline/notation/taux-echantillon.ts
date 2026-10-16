/**
 * §7 : « 10 % par défaut, 25 % après retrait d'un juge pour biais contrefactuel ». La règle vit ici,
 * une seule fois : le gel (`pipeline/gel/assemblage.ts`) inscrit le taux sans retrait, aucun juge
 * n'étant retiré au gel ; le contrôle croisé (`controle-croise.ts`) revérifie le taux du run noté.
 */

import type { TauxEchantillonHumain } from "./types.ts";

export const TAUX_ECHANTILLON_SANS_RETRAIT: TauxEchantillonHumain = 0.1;

export const TAUX_ECHANTILLON_APRES_RETRAIT: TauxEchantillonHumain = 0.25;
