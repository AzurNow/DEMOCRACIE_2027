"""WebVTT de C3 (`docs/CONTRATS.md` §2) : écriture depuis des segments, analyse, texte dérivé, offset → cue.

La dérivation reproduit celle de `validation/domaine/webvtt.ts` (TypeScript), qui relit les mêmes
fichiers dans l'interface de validation : les deux doivent donner le même texte au point de code
près. `tests/collecte/dores.test.ts` le vérifie sur un fichier doré produit ici.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.collecte.transcription.webvtt import (
    ErreurVtt,
    SegmentInvalide,
    SegmentTranscrit,
    TranscriptionVide,
    analyser_vtt,
    cue_de,
    ecrire_vtt,
    formater_horodatage,
    texte_derive,
)

RACINE = Path(__file__).resolve().parents[2]
FIXTURE_VTT = RACINE / "validation/fixtures/staging-demo/transcriptions/b6db45bad6003978deea167807cc2f9b1d0080b35bacc4c1a8800ad5f6aafd0c.vtt"
FIXTURE_TXT = RACINE / "validation/fixtures/staging-demo/textes/f7c3b51e5eb8f98dbbb6c87e18d6961476b8f10cbc00f40a388c5e611d57494a.txt"


def seg(debut: float, fin: float, texte: str) -> SegmentTranscrit:
    return SegmentTranscrit(debut, fin, texte)


# --------------------------------------------------------------------------- cas 1 : VTT → texte


def test_cues_dans_l_ordre_joints_par_un_saut_de_ligne() -> None:
    vtt = (
        "WEBVTT\n\n"
        "00:42:10.000 --> 00:42:14.500\nPremière phrase de l'extrait.\n\n"
        "00:42:14.500 --> 00:42:19.000\nSeconde phrase de l'extrait.\n"
    )
    assert texte_derive(vtt) == "Première phrase de l'extrait.\nSeconde phrase de l'extrait."


def test_la_fixture_de_l_interface_donne_son_texte_canonique() -> None:
    """Le couple `.vtt`/`.txt` de démonstration lu par l'interface de validation."""
    assert texte_derive(FIXTURE_VTT.read_text("utf-8")) == FIXTURE_TXT.read_text("utf-8")


def test_nfc_appliquee_a_une_entree_nfd() -> None:
    vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\ne\u0301te\u0301\n"
    texte = texte_derive(vtt)
    assert texte == "\u00e9t\u00e9"
    assert len(texte) == 3


def test_cue_multiligne_ses_lignes_jointes_par_un_saut_de_ligne() -> None:
    """Règle de `validation/domaine/webvtt.ts` : le texte d'un cue est sa charge utile telle
    qu'écrite, lignes jointes par `\\n`, sans espace ajoutée ni ligne fusionnée."""
    vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nLigne une\nligne deux\n\n00:00:02.000 --> 00:00:03.000\nSuite\n"
    document = analyser_vtt(vtt)
    assert document.texte == "Ligne une\nligne deux\nSuite"
    assert [cue.offset for cue in document.cues] == [0, 21]  # 20 points de code, plus la jonction


def test_identifiant_de_cue_et_reglages_ignores() -> None:
    vtt = (
        "WEBVTT\n\n"
        "intro-1\n00:00:00.000 --> 00:00:01.000 align:start position:10%\nBonjour\n\n"
        "2\n00:01.000 --> 00:02.500\nAu revoir\n"
    )
    document = analyser_vtt(vtt)
    assert document.texte == "Bonjour\nAu revoir"
    assert [(cue.debut_ms, cue.fin_ms) for cue in document.cues] == [(0, 1000), (1000, 2500)]


def test_blocs_note_style_region_ignores_sans_decaler_les_offsets() -> None:
    vtt = (
        "WEBVTT\n\n"
        "NOTE commentaire\nsur deux lignes\n\n"
        "STYLE\n::cue { color: red }\n\n"
        "00:00:00.000 --> 00:00:01.000\nUn\n\n"
        "REGION\nid:bas\n\n"
        "00:00:01.000 --> 00:00:02.000\nDeux\n"
    )
    document = analyser_vtt(vtt)
    assert document.texte == "Un\nDeux"
    assert [cue.offset for cue in document.cues] == [0, 3]


def test_en_tete_webvtt_avec_metadonnees_et_fins_de_ligne_crlf() -> None:
    vtt = "WEBVTT - Débat\r\nKind: captions\r\nLanguage: fr\r\n\r\n00:00:00.000 --> 00:00:01.000\r\nTexte\r\n"
    assert texte_derive(vtt) == "Texte"


def test_sans_en_tete_webvtt_erreur() -> None:
    with pytest.raises(ErreurVtt, match="en-tête WEBVTT"):
        analyser_vtt("00:00:00.000 --> 00:00:01.000\nTexte\n")


def test_balise_de_cue_refusee_plutot_qu_ignoree() -> None:
    """L'interface (TypeScript) garde les balises dans le texte dérivé ; les retirer ici donnerait
    deux textes, donc deux jeux d'offsets. Refus nommé, jamais une dérivation divergente."""
    vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n<v Orateur>Bonjour</v>\n"
    with pytest.raises(ErreurVtt, match="balise ou entité"):
        analyser_vtt(vtt)


def test_entite_de_cue_refusee() -> None:
    vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA &amp; B\n"
    with pytest.raises(ErreurVtt, match="balise ou entité"):
        analyser_vtt(vtt)


def test_cue_vide_refuse() -> None:
    vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n\n00:00:01.000 --> 00:00:02.000\nTexte\n"
    with pytest.raises(ErreurVtt, match="sans texte"):
        analyser_vtt(vtt)


def test_bloc_sans_fleche_refuse() -> None:
    with pytest.raises(ErreurVtt, match="sans flèche"):
        analyser_vtt("WEBVTT\n\nTexte orphelin\n")


def test_horodatage_illisible_refuse() -> None:
    with pytest.raises(ErreurVtt, match="horodatage illisible"):
        analyser_vtt("WEBVTT\n\n00:00:00,000 --> 00:00:01.000\nTexte\n")


def test_fichier_sans_cue_refuse() -> None:
    with pytest.raises(ErreurVtt, match="aucun cue"):
        analyser_vtt("WEBVTT\n\nNOTE rien\n")


# --------------------------------------------------------------------------- cas 2 : offset → cue


def test_offset_retombe_dans_son_cue_frontiere_exacte_comprise() -> None:
    document = analyser_vtt(
        "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAbc\n\n01:00:02.000 --> 01:00:03.500\nDé\n"
    )
    # « Abc » occupe [0, 3), le saut de ligne de jonction est l'offset 3, « Dé » commence à 4.
    assert cue_de(document, 0).debut_ms == 1000
    assert cue_de(document, 2).debut_ms == 1000
    assert cue_de(document, 3).debut_ms == 1000  # saut de ligne de jonction : cue précédent, comme en TS
    assert cue_de(document, 4).debut_ms == 3_602_000  # premier point de code du second cue
    assert cue_de(document, 5).debut_ms == 3_602_000


def test_offset_compte_en_points_de_code_emoji_compris() -> None:
    document = analyser_vtt("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n\U0001f30d\n\n00:00:01.000 --> 00:00:02.000\nB\n")
    assert document.texte == "\U0001f30d\nB"
    assert cue_de(document, 2).debut_ms == 1000


@pytest.mark.parametrize("offset", [-1, 7])
def test_offset_hors_du_texte_derive_erreur(offset: int) -> None:
    document = analyser_vtt("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nAbc\n\n00:00:01.000 --> 00:00:02.000\nDé\n")
    assert len(document.texte) == 6
    with pytest.raises(ErreurVtt, match="hors du texte dérivé"):
        cue_de(document, offset)


# --------------------------------------------------------------------------- cas 3 : écriture VTT


def test_horodatages_formates_hh_mm_ss_mmm() -> None:
    assert formater_horodatage(0.0) == "00:00:00.000"
    assert formater_horodatage(62.5) == "00:01:02.500"
    assert formater_horodatage(3725.04) == "01:02:05.040"


def test_horodatage_negatif_ou_non_fini_refuse() -> None:
    with pytest.raises(SegmentInvalide, match="horodatage"):
        formater_horodatage(-0.5)
    with pytest.raises(SegmentInvalide, match="horodatage"):
        formater_horodatage(float("nan"))


def test_segments_ecrits_en_webvtt_puis_relus_a_l_identique() -> None:
    ecrit = ecrire_vtt([seg(0.0, 2.5, " Bonjour à tous."), seg(2.5, 4.0, " Merci.")])
    assert ecrit.contenu == (
        "WEBVTT\n\n"
        "00:00:00.000 --> 00:00:02.500\nBonjour à tous.\n\n"
        "00:00:02.500 --> 00:00:04.000\nMerci.\n"
    )
    assert (ecrit.cues, ecrit.segments_exclus) == (2, 0)
    assert texte_derive(ecrit.contenu) == "Bonjour à tous.\nMerci."


def test_segment_au_dela_d_une_heure() -> None:
    ecrit = ecrire_vtt([seg(3599.5, 3601.25, "Passage de l'heure."), seg(7322.0, 7323.0, "Deux heures.")])
    assert "00:59:59.500 --> 01:00:01.250\n" in ecrit.contenu
    assert "02:02:02.000 --> 02:02:03.000\n" in ecrit.contenu


def test_segment_vide_ou_blanc_exclu_et_compte_jamais_un_cue_vide() -> None:
    ecrit = ecrire_vtt([seg(0.0, 1.0, "Un."), seg(1.0, 2.0, "   "), seg(2.0, 3.0, ""), seg(3.0, 4.0, "Deux.")])
    assert (ecrit.cues, ecrit.segments_exclus) == (2, 2)
    assert texte_derive(ecrit.contenu) == "Un.\nDeux."


def test_segments_non_ordonnes_erreur() -> None:
    with pytest.raises(SegmentInvalide, match="commence avant la fin"):
        ecrire_vtt([seg(5.0, 6.0, "Après"), seg(1.0, 2.0, "Avant")])


def test_segments_chevauchants_erreur() -> None:
    with pytest.raises(SegmentInvalide, match="commence avant la fin"):
        ecrire_vtt([seg(0.0, 2.0, "Un"), seg(1.5, 3.0, "Deux")])


def test_segment_qui_finit_avant_de_commencer_erreur() -> None:
    with pytest.raises(SegmentInvalide, match="finit avant de commencer"):
        ecrire_vtt([seg(2.0, 1.0, "À rebours")])


def test_segment_chevauchant_mais_blanc_ne_compte_pas() -> None:
    """Un segment exclu n'entre pas dans le fichier : il ne peut rien chevaucher."""
    ecrit = ecrire_vtt([seg(0.0, 2.0, "Un"), seg(1.0, 1.5, " "), seg(2.0, 3.0, "Deux")])
    assert ecrit.cues == 2


@pytest.mark.parametrize(
    ("texte", "motif"),
    [
        ("Ligne\nbrisée", "saut de ligne"),
        ("Retour\rchariot", "saut de ligne"),
        ("A --> B", "-->"),
        ("x < y", "balise ou entité"),
        ("Rock & roll", "balise ou entité"),
    ],
)
def test_texte_de_segment_qui_casserait_le_format_refuse(texte: str, motif: str) -> None:
    with pytest.raises(SegmentInvalide, match=motif):
        ecrire_vtt([seg(0.0, 1.0, texte)])


# --------------------------------------------------------------------------- cas 4 : transcription vide


def test_aucun_segment_transcription_vide() -> None:
    with pytest.raises(TranscriptionVide):
        ecrire_vtt([])


def test_que_des_segments_blancs_transcription_vide() -> None:
    with pytest.raises(TranscriptionVide, match="2 segment"):
        ecrire_vtt([seg(0.0, 1.0, " "), seg(1.0, 2.0, "")])


def test_retour_chariot_isole_refuse() -> None:
    with pytest.raises(ErreurVtt, match="retour chariot isolé"):
        analyser_vtt("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nUn\rDeux\n")
