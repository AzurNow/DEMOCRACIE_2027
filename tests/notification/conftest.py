"""Garde-fou des tests de notification : aucune connexion SMTP réelle, jamais.

La fixture autouse remplace `smtplib.SMTP` et `smtplib.SMTP_SSL` par des objets qui lèvent, dans
chaque test qui ne demande pas `serveur_smtp_local`. Le seul test qui parle SMTP le fait à un
serveur `socketserver` sur 127.0.0.1, port éphémère, sans TLS.
"""

from __future__ import annotations

import smtplib
from collections.abc import Iterator

import pytest

from tests.notification.doubles import ServeurSmtpLocal, SmtpInterdit


@pytest.fixture(autouse=True)
def smtp_interdit(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(smtplib, "SMTP_SSL", SmtpInterdit)
    if "serveur_smtp_local" not in request.fixturenames:
        monkeypatch.setattr(smtplib, "SMTP", SmtpInterdit)


@pytest.fixture
def serveur_smtp_local() -> Iterator[ServeurSmtpLocal]:
    serveur = ServeurSmtpLocal()
    yield serveur
    serveur.arreter()
