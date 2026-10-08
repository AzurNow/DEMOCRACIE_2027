"""Le passage du test des liens sur un run : une URL après l'autre, en ordre trié (D20).

Pour chaque URL : si son résultat est déjà écrit (relance après interruption), il est repris tel
quel, ni retesté ni réécrit. Sinon, jusqu'à `tentatives.maximum` tentatives tant que le résultat
est transitoire (table), espacées de `tentatives.espacement_s` sur l'horloge injectée ; le dernier
résultat est traduit en verdict par la table. Puis la copie : page et Save Page Now pour `existe`,
recherche d'instantané existant pour `inaccessible` et `non_testable`, rien pour `mort` (D19 : un
lien mort ne soutient jamais rien). Enfin le résultat est contrôlé et écrit une fois.

Un résultat que la table ne classe pas n'a pas de verdict : aucun fichier n'est écrit, le lien
reste « en attente du test des liens » pour la notation, et le bilan le signale.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Protocol

from pipeline.collecte.horloge import Horloge, instant_iso
from pipeline.collecte.wayback import SERVICE, ArchivageReussi, Archiveur
from pipeline.liens.constat import Constat
from pipeline.liens.instantanes import InstantaneAbsent, InstantaneTrouve, Recherche
from pipeline.liens.schemas import ResultatNonConforme
from pipeline.liens.sortie import (
    Copie,
    Tentative,
    conserver_page,
    construire_resultat,
    ecrire_resultat,
    lire_resultat,
    nom_resultat,
)
from pipeline.liens.table import TableLiens


class Sonde(Protocol):
    def sonder(self, url: str) -> Constat: ...


class Chercheur(Protocol):
    def chercher(self, url: str, instant: datetime) -> Recherche: ...


@dataclass(frozen=True)
class Dependances:
    sonde: Sonde
    archiveur: Archiveur
    chercheur: Chercheur
    horloge: Horloge
    table: TableLiens


@dataclass(frozen=True)
class Bilan:
    url: str
    etat: str
    """`teste`, `repris`, `sans_verdict` ou `refuse` (résultat non conforme : rien n'est écrit)."""
    verdict: str | None = None
    motif: str | None = None
    echec_wayback: str | None = None


@dataclass(frozen=True)
class _Contexte:
    url: str
    instant_reference: datetime
    repertoire: Path
    deps: Dependances
    tentatives: list[Tentative] = field(default_factory=list)


# ------------------------------------------------------------------------------ tentatives


def tester(url: str, deps: Dependances) -> list[Tentative]:
    """Les tentatives faites, la dernière portant le résultat qui décide du verdict."""
    tentatives: list[Tentative] = []
    for numero in range(1, deps.table.tentatives_max + 1):
        if numero > 1:
            deps.horloge.dormir(deps.table.espacement_s)
        horodatage = instant_iso(deps.horloge.maintenant())
        constat = deps.sonde.sonder(url)
        tentatives.append(Tentative(numero=numero, horodatage=horodatage, constat=constat))
        if not deps.table.est_transitoire(constat):
            break
    return tentatives


# ------------------------------------------------------------------------------ copies


def _copie_existe(ctx: _Contexte) -> Copie:
    sha256, page = conserver_page(ctx.repertoire, ctx.tentatives[-1].constat)
    archivage = ctx.deps.archiveur.sauvegarder(ctx.url)
    if isinstance(archivage, ArchivageReussi):
        wayback: dict[str, object] = {"operation": SERVICE, "issue": "reussi", "archive_url": archivage.archive_url}
        return Copie(wayback=wayback, page=page, sha256_contenu=sha256, archive_url=archivage.archive_url)
    wayback = {"operation": SERVICE, "issue": "echec", "motif": archivage.motif, "tentatives": archivage.tentatives}
    return Copie(wayback=wayback, page=page, sha256_contenu=sha256)


def _copie_mort(_ctx: _Contexte) -> Copie:
    return Copie(wayback={"operation": "aucune"})


def _copie_recherche(ctx: _Contexte) -> Copie:
    recherche = ctx.deps.chercheur.chercher(ctx.url, ctx.instant_reference)
    wayback: dict[str, object] = {
        "operation": "recherche_instantane",
        "instant_reference": instant_iso(ctx.instant_reference),
    }
    if isinstance(recherche, InstantaneTrouve):
        wayback |= {"issue": "trouve", "archive_url": recherche.archive_url, "horodatage_instantane": recherche.horodatage}
        if recherche.statut is not None:
            wayback["statut_instantane"] = recherche.statut
        return Copie(wayback=wayback, archive_url=recherche.archive_url)
    if isinstance(recherche, InstantaneAbsent):
        return Copie(wayback=wayback | {"issue": "absent"})
    return Copie(wayback=wayback | {"issue": "echec", "motif": recherche.motif})


COPIES: dict[str, Callable[[_Contexte], Copie]] = {
    "existe": _copie_existe,
    "mort": _copie_mort,
    "inaccessible": _copie_recherche,
    "non_testable": _copie_recherche,
}
"""D20, « copie conservée ». Un verdict du schéma absent d'ici lève `KeyError` : jamais de copie par défaut."""


# ------------------------------------------------------------------------------ une URL


def _echec_wayback(wayback: Mapping[str, object]) -> str | None:
    return f"{wayback['operation']} : {wayback['motif']}" if wayback.get("issue") == "echec" else None


def _reprendre(chemin: Path, url: str) -> Bilan:
    try:
        resultat = lire_resultat(chemin, url)
    except ResultatNonConforme as refus:
        return Bilan(url, "refuse", motif=f"résultat déjà écrit mais non conforme : {refus}")
    return Bilan(url, "repris", verdict=str(resultat["verdict_existence"]))


def traiter(url: str, instant_reference: datetime, repertoire: Path, deps: Dependances) -> Bilan:
    chemin = repertoire / nom_resultat(url)
    if chemin.exists():
        return _reprendre(chemin, url)
    ctx = _Contexte(url, instant_reference, repertoire, deps, tester(url, deps))
    finale = ctx.tentatives[-1].constat
    verdict = deps.table.verdict(finale)
    if verdict is None:
        motif = f"{finale.issue} (code HTTP {finale.code_http}) hors de la table {deps.table.version}"
        return Bilan(url, "sans_verdict", motif=motif)
    copie = COPIES[verdict](ctx)
    resultat = construire_resultat(url, verdict, ctx.tentatives, deps.table.version, copie)
    try:
        ecrire_resultat(repertoire, resultat)
    except ResultatNonConforme as refus:
        return Bilan(url, "refuse", verdict=verdict, motif=str(refus))
    return Bilan(url, "teste", verdict=verdict, echec_wayback=_echec_wayback(copie.wayback))


def passer(liens: Mapping[str, datetime], repertoire_liens: Path, deps: Dependances) -> list[Bilan]:
    """Toutes les URL, en ordre trié de la chaîne exacte : le passage est déterministe."""
    repertoire_liens.mkdir(parents=True, exist_ok=True)
    return [traiter(url, liens[url], repertoire_liens, deps) for url in sorted(liens)]


# ------------------------------------------------------------------------------ bilan


def formater_bilan(bilans: list[Bilan], version_table: str) -> str:
    lignes = [f"Test des liens, table {version_table} : {len(bilans)} URL."]
    for etat in ("teste", "repris"):
        par_verdict: dict[str, int] = {}
        for bilan in (b for b in bilans if b.etat == etat and b.verdict is not None):
            par_verdict[bilan.verdict] = par_verdict.get(bilan.verdict, 0) + 1
        detail = ", ".join(f"{verdict} {nombre}" for verdict, nombre in sorted(par_verdict.items()))
        lignes.append(f"  {etat} : {sum(par_verdict.values())} ({detail or 'aucun'})")
    lignes += _section("Échecs Wayback (consignés, verdict inchangé)", [(b.url, b.echec_wayback) for b in bilans])
    lignes += _section("Sans verdict (en attente du test des liens)", [(b.url, b.motif) for b in bilans if b.etat == "sans_verdict"])
    lignes += _section("Refusés (rien d'écrit)", [(b.url, b.motif) for b in bilans if b.etat == "refuse"])
    return "\n".join(lignes)


def _section(titre: str, paires: list[tuple[str, str | None]]) -> list[str]:
    retenues = [(url, motif) for url, motif in paires if motif is not None]
    return [f"  {titre} : {len(retenues)}", *(f"    {url} — {motif}" for url, motif in retenues)]


def code_de_sortie(bilans: list[Bilan]) -> int:
    """1 si une URL n'a pas reçu de verdict pour une raison qui n'est pas un verdict ; sinon 0."""
    return 1 if any(b.etat in ("sans_verdict", "refuse") for b in bilans) else 0
