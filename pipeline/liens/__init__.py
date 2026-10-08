"""Test HTTP des liens cités (§7 : « le lien cité existe (test HTTP déterministe) »), décision D20.

Un passage par run, après la fermeture de la fenêtre d'interrogation et avant la notation :
`python -m pipeline.liens <repertoire_du_run>` (ou `pnpm liens <repertoire_du_run>`).

Flux : `volume/reponses/*.json` (réponses obtenues, `normalise.liens`) → URL dédoublonnées sur la
chaîne exacte, en ordre trié → pour chacune, GET poli selon la norme de collecte du §6
(`pipeline/collecte` : robots.txt, une requête par seconde et par hôte, cinq redirections au plus,
suivies une à une, schéma vérifié à chaque étape), jusqu'à trois tentatives pour un échec
transitoire → verdict lu dans la table `config/test-liens.toml` → copie conservée (corps et
Save Page Now pour `existe` ; instantané Wayback existant le plus proche pour `inaccessible` et
`non_testable`, jamais créé ; rien pour `mort`) → un fichier par URL,
`volume/liens/<sha256 de l'URL>.json` (`schema/existence-lien.schema.json`), écrit une fois.

La notation lit ces fichiers par `pipeline/notation/fournisseur-fichiers.ts`.
"""
