# KaraK Web

KaraK Web permet de créer et projeter des paroles à trous dans un navigateur récent.

## Utilisation

1. Choisissez une piste audio dans un format pris en charge par votre navigateur.
2. Collez les paroles ou importez un fichier `.txt`, une phrase par ligne.
3. Lancez l’audio et cliquez sur **Marquer** au début de chaque ligne ; ajustez les repères en écoutant.
4. Cliquez sur les mots à masquer ou choisissez une règle de masquage.
5. Exportez le projet JSON pour garder les paroles, repères et masques. À sa réouverture, sélectionnez de nouveau le fichier audio correspondant.
6. Cliquez sur **Projeter**. En projection : Espace lecture/pause, flèches pour changer de ligne, R pour révéler un mot, T pour tout révéler, H pour remasquer, F pour le plein écran et Échap pour revenir.

Les fichiers restent dans l’onglet du navigateur et ne sont pas envoyés à un serveur. Le projet exporté ne contient pas l’audio. L’alignement automatique Whisper est disponible uniquement dans l’application Mac.

Licence MIT ; voir [LICENSE](../LICENSE). Les mentions des dépendances tierces sont dans le dépôt.

*Créé par S. Bovat*
