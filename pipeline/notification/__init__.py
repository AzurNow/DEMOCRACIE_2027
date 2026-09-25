"""Notification des campagnes (protocole 0.10, §4 « Droit de réponse ») : `pnpm notifier`.

Lit la file `validation/notifications/dues.jsonl` (écrite par promote, contester et panel), les
contacts du périmètre (sur l'entrée standard, depuis `outils/contacts.ts`), et journalise chaque
envoi dans `validation/notifications/envois.jsonl`, qu'il écrit seul. Bibliothèque standard
seulement : `smtplib`, `email.message`, `ssl`, `json`, `argparse`.
"""
