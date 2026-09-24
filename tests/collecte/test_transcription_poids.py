"""Poids du modèle de transcription (C3, cas limite 6) : révision épinglée, empreintes vérifiées avant
tout chargement. Aucun test ne télécharge ni ne charge le vrai modèle : fichiers et téléchargeur
factices, liste de fichiers attendus injectée.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from pipeline.collecte.transcription.poids import (
    DEPOT,
    FICHIERS,
    REVISION,
    EmpreintePoidsInvalide,
    FichierPoids,
    PoidsAbsent,
    blob_git,
    preparer_poids,
    repertoire_modele,
    verifier_poids,
)

CONFIG = b'{"alignment_heads": []}\n'
MODELE = b"poids factices"
ATTENDUS = (
    FichierPoids("model.bin", len(MODELE), sha256=hashlib.sha256(MODELE).hexdigest(), blob_git=None),
    FichierPoids("config.json", len(CONFIG), sha256=None, blob_git=blob_git(CONFIG)),
)


def _poser(repertoire: Path, nom: str, octets: bytes) -> None:
    repertoire.mkdir(parents=True, exist_ok=True)
    (repertoire / nom).write_bytes(octets)


def test_revision_et_empreintes_epinglees_dans_le_code() -> None:
    assert DEPOT == "dropbox-dash/faster-whisper-large-v3-turbo"
    assert len(REVISION) == 40
    assert {f.nom for f in FICHIERS} == {
        "model.bin",
        "config.json",
        "preprocessor_config.json",
        "tokenizer.json",
        "vocabulary.json",
    }
    assert all((f.sha256 is None) != (f.blob_git is None) for f in FICHIERS)
    [modele] = [f for f in FICHIERS if f.nom == "model.bin"]
    assert modele.sha256 == "e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da"


def test_repertoire_du_modele_hors_git_sous_la_revision(tmp_path: Path) -> None:
    assert repertoire_modele(tmp_path) == tmp_path / "modeles" / DEPOT / REVISION


def test_blob_git_calcule_comme_git_hash_object() -> None:
    # `printf 'hello\n' | git hash-object --stdin`
    assert blob_git(b"hello\n") == "ce013625030ba8dba906f756967f9e9ca394464a"


def test_poids_conformes_empreintes_sha256_de_chaque_fichier(tmp_path: Path) -> None:
    _poser(tmp_path, "model.bin", MODELE)
    _poser(tmp_path, "config.json", CONFIG)

    empreintes = verifier_poids(tmp_path, ATTENDUS)

    assert empreintes == {
        "model.bin": hashlib.sha256(MODELE).hexdigest(),
        "config.json": hashlib.sha256(CONFIG).hexdigest(),
    }


def test_empreinte_sha256_differente_refus(tmp_path: Path) -> None:
    _poser(tmp_path, "model.bin", MODELE + b"!")
    _poser(tmp_path, "config.json", CONFIG)

    with pytest.raises(EmpreintePoidsInvalide, match="model.bin"):
        verifier_poids(tmp_path, ATTENDUS)


def test_empreinte_git_differente_refus(tmp_path: Path) -> None:
    _poser(tmp_path, "model.bin", MODELE)
    _poser(tmp_path, "config.json", CONFIG.replace(b"[]", b"[1]"))

    with pytest.raises(EmpreintePoidsInvalide, match="config.json"):
        verifier_poids(tmp_path, ATTENDUS)


def test_taille_differente_refus_avant_meme_de_hacher(tmp_path: Path) -> None:
    _poser(tmp_path, "model.bin", MODELE[:-1])
    _poser(tmp_path, "config.json", CONFIG)

    with pytest.raises(EmpreintePoidsInvalide, match="taille"):
        verifier_poids(tmp_path, ATTENDUS)


def test_fichier_manquant_erreur_nommee(tmp_path: Path) -> None:
    _poser(tmp_path, "model.bin", MODELE)

    with pytest.raises(PoidsAbsent, match="config.json"):
        verifier_poids(tmp_path, ATTENDUS)


def test_premier_lancement_telecharge_les_seuls_fichiers_absents(tmp_path: Path) -> None:
    _poser(tmp_path, "config.json", CONFIG)
    demandes: list[str] = []

    def telecharger(nom: str, repertoire: Path) -> None:
        demandes.append(nom)
        _poser(repertoire, nom, MODELE)

    empreintes = preparer_poids(tmp_path, telecharger, ATTENDUS)

    assert demandes == ["model.bin"]
    assert set(empreintes) == {"model.bin", "config.json"}


def test_second_lancement_hors_ligne(tmp_path: Path) -> None:
    _poser(tmp_path, "model.bin", MODELE)
    _poser(tmp_path, "config.json", CONFIG)

    def telecharger(nom: str, repertoire: Path) -> None:
        raise AssertionError(f"aucun téléchargement attendu : {nom}")

    preparer_poids(tmp_path, telecharger, ATTENDUS)


def test_telechargement_qui_ne_produit_rien_erreur_nommee(tmp_path: Path) -> None:
    with pytest.raises(PoidsAbsent, match="model.bin"):
        preparer_poids(tmp_path, lambda nom, repertoire: None, ATTENDUS)


def test_fichier_present_mais_altere_n_est_jamais_retelecharge(tmp_path: Path) -> None:
    """Une empreinte fausse est un refus bruyant, pas une occasion de remplacer le fichier."""
    _poser(tmp_path, "model.bin", b"x" * len(MODELE))
    _poser(tmp_path, "config.json", CONFIG)

    def telecharger(nom: str, repertoire: Path) -> None:
        raise AssertionError(f"aucun téléchargement attendu : {nom}")

    with pytest.raises(EmpreintePoidsInvalide):
        preparer_poids(tmp_path, telecharger, ATTENDUS)
