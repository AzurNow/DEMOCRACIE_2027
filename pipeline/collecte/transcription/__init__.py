"""Transcription locale des enregistrements audio et vidéo collectés (sous-lot C3), `docs/CONTRATS.md` §2.

Flux : manifeste `staging/sources/<sha256>.json` d'un contenu `audio/*` ou `video/*` → copie locale
revérifiée → faster-whisper en local (poids à révision épinglée, empreintes vérifiées avant
chargement) → `staging/transcriptions/<sha256>.vtt`, puis sa fiche
`staging/transcriptions/<sha256>.json` (`schema/transcription.schema.json`). Un `.vtt` existant n'est
jamais réécrit. Le texte canonique en est ensuite dérivé par `pipeline/collecte/textes`.
"""
