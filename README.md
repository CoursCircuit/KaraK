# KaraK

KaraK est une application de karaoké pédagogique pour préparer des paroles à trous et les projeter en classe. Elle permet d’importer une piste audio et des paroles, de masquer des mots et de proposer des repères temporels grâce à une reconnaissance vocale exécutée localement.

## Télécharger et installer

[Télécharger KaraK 1.3.0 pour Mac Apple Silicon (.dmg)](https://github.com/CoursCircuit/KaraK/releases/download/v1.3.0/KaraK-1.3.0-arm64.dmg).

Nécessite macOS 15 ou ultérieur et un Mac à puce Apple. Ouvrez le DMG puis glissez KaraK dans Applications. Cette version est signée localement, sans certificat Developer ID ni notarisation Apple : macOS peut signaler qu’il ne peut pas vérifier son développeur. Consultez les réglages **Confidentialité et sécurité** si vous choisissez de l’ouvrir. Aucune version Intel ou Windows n’est fournie pour cette version.

## Préparer et projeter

1. Choisissez un fichier MP3, M4A, WAV ou AAC.
2. Collez les paroles, une phrase par ligne, ou importez un fichier texte. Répétez les refrains dans l’ordre du morceau.
3. Choisissez la langue et cliquez sur **Proposer les repères**, puis vérifiez et appliquez les propositions. Vous pouvez aussi placer les repères manuellement en écoutant l’audio.
4. Cliquez sur les mots à cacher ou utilisez une règle de masquage. Enregistrez votre projet, puis cliquez sur **Projeter**.

En projection, **Espace** contrôle la lecture, les flèches changent de ligne, **R** révèle un mot, **T** révèle tout, **H** remasque, **F** passe en plein écran et **Échap** revient à la préparation.

Les fichiers et l’analyse restent sur le Mac. Le projet JSON référence l’audio : pour le transférer, copiez le JSON et le fichier audio ensemble en conservant leur emplacement relatif, ou sélectionnez à nouveau l’audio. Utilisez uniquement les fichiers et paroles que vous êtes autorisé à employer.

## Développement

Sur macOS, avec Node.js, npm, CMake et les outils de développement Apple :

```sh
npm ci
./scripts/prepare-alignment.sh
npm start
npm run build:mac
```

Le script télécharge les sources de whisper.cpp, compile son moteur et télécharge le modèle de reconnaissance en vérifiant son empreinte. Les binaires et modèles sont exclus du dépôt ; ils sont nécessaires à la reconstruction du DMG complet et occupent plusieurs centaines de Mo. Le téléchargement et l’installation de ces composants nécessitent une connexion Internet ; leur utilisation dans KaraK est locale.

## Licences

Le code de KaraK est proposé sous [licence MIT](LICENSE). Le moteur [whisper.cpp](https://github.com/ggml-org/whisper.cpp) et le modèle [Whisper](https://github.com/openai/whisper) possèdent leurs propres mentions MIT, conservées dans [assets/alignment](assets/alignment/). Les composants Electron et leurs dépendances restent soumis à leurs licences respectives.

*Créé par S. Bovat*
