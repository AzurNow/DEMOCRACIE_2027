"""Forme canonique d'un texte (`docs/CONTRATS.md` §1) : LF puis NFC, et rien d'autre."""

from __future__ import annotations

import hashlib
import unicodedata

from pipeline.collecte.textes.canonique import TexteCanonique, canoniser


def test_crlf_et_cr_isole_deviennent_lf() -> None:
    assert canoniser("un\r\ndeux\rtrois\n") == "un\ndeux\ntrois\n"


def test_e_decompose_devient_compose() -> None:
    decompose = "e\u0301te\u0301"
    assert canoniser(decompose) == "été"
    assert len(canoniser(decompose)) == 3


def test_ligature_cesure_espaces_et_coquille_restent_en_place() -> None:
    brut = "\ufb01nancement  des re-\ntraites,  «\u00a0programe\u00a0» \u00ad\n"
    assert canoniser(brut) == brut


def test_aucun_saut_de_ligne_final_n_est_ajoute_ni_retire() -> None:
    assert canoniser("fin") == "fin"
    assert canoniser("fin\n\n") == "fin\n\n"


def test_longueur_en_points_de_code_et_empreinte_des_octets_utf8_sans_bom() -> None:
    texte = TexteCanonique("é😀a")
    assert texte.longueur == 3  # un emoji compte pour un, comme Array.from() en TypeScript
    assert texte.octets == "é😀a".encode()
    assert not texte.octets.startswith(b"\xef\xbb\xbf")
    assert texte.sha256 == hashlib.sha256("é😀a".encode()).hexdigest()


def test_canoniser_est_idempotent() -> None:
    brut = "a\r\nb\u0301\rc"
    assert canoniser(canoniser(brut)) == canoniser(brut)
    assert unicodedata.is_normalized("NFC", canoniser(brut))
