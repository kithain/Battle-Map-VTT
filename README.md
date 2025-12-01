# Battle Map VTT

## Project Overview
This project is a real-time Virtual Tabletop (VTT) application designed for Game Masters (GMs) to manage battle maps and tokens. It features real-time synchronization between a main interactive GM view and a dedicated observer view, powered by Socket.IO. The application also integrates with an external Webtracker system for automated participant (players, allies, NPCs) token management, ensuring dynamic and persistent game state across sessions.

## Description
Ce projet est une application de Tabletop Virtuel (VTT) conçue pour la gestion en temps réel de cartes de bataille et de tokens, avec une intégration à un système Webtracker pour les données des participants. Elle permet aux Maîtres de Jeu de synchroniser facilement l'état du jeu entre plusieurs clients, incluant une vue principale interactive et une vue observateur dédiée.

## Fonctionnalités

### Vue Principale (Maître de Jeu)
*   **Synchronisation en temps réel :** Mises à jour instantanées des cartes et des positions des tokens via Socket.IO.
*   **Gestion de cartes :**
    *   Chargement dynamique de cartes (depuis des fichiers locaux ou des URL de données Base64).
    *   Persistance de la carte actuellement chargée.
*   **Gestion des tokens :**
    *   Ajout, déplacement et suppression de tokens sur la carte.
    *   Tokens glissables (draggable) avec accrochage à la grille.
    *   Persistance des positions et états des tokens.
*   **Intégration Webtracker :** Connexion à une API Webtracker externe pour générer et mettre à jour automatiquement les tokens des participants (joueurs, alliés, monstres) en fonction des données reçues.
*   **Flexibilité des portraits :** Le serveur gère le service des images de portraits avec des chemins flexibles.
*   **Interface utilisateur :** Barre d'outils pour charger des cartes, effacer des tokens et gérer la connexion au Webtracker.

### Vue Observateur (OBS)
*   Affichage en temps réel de la carte de bataille et des tokens sur un canevas HTML5.
*   Synchronisée automatiquement avec la vue principale sans interaction directe avec le Webtracker.

### Backend (Serveurs Python)
*   **Serveur de fichiers statiques :** Un simple serveur HTTP pour servir les fichiers frontend (HTML, CSS, JS, etc.).
*   **Serveur de synchronisation Socket.IO :**
    *   Gère l'état partagé (carte et tokens) entre tous les clients connectés.
    *   Stocke la carte et les tokens sur disque pour une persistance entre les sessions.
    *   Extrait et sauvegarde les images de cartes uploadées (Base64) en tant que fichiers.
    *   Service des fichiers de portraits depuis des chemins configurables (y compris un dossier Webtracker externe ou un dossier local).
    *   CORS activé pour les communications multi-origines.

## Technologies Utilisées

*   **Frontend :**
    *   HTML, CSS, JavaScript
    *   Socket.IO (client-side library)
*   **Backend :**
    *   Python 3
    *   `http.server` (pour le serveur de fichiers statiques)
    *   `socketio` (bibliothèque Python pour Socket.IO)
    *   `aiohttp` (framework web asynchrone pour le serveur de synchronisation)

## Installation

### Prérequis
*   Python 3.x
*   pip (gestionnaire de paquets Python)

### Étapes
1.  **Cloner le dépôt (ou télécharger les fichiers) :**
    ```bash
    git clone <URL_DE_VOTRE_DEPOT>
    cd battle_Map
    ```
2.  **Installer les dépendances Python :**
    ```bash
    pip install aiohttp python-socketio
    ```

## Utilisation

Le projet utilise deux serveurs Python qui peuvent être lancés indépendamment.

1.  **Lancer le serveur de fichiers statiques :**
    Ce serveur est responsable de servir les fichiers HTML, CSS et JavaScript de l'application.
    ```bash
    python server.py
    ```
    *   Le serveur démarrera sur `http://127.0.0.1:8000`.
    *   Une nouvelle fenêtre de navigateur s'ouvrira automatiquement.

2.  **Lancer le serveur de synchronisation Socket.IO :**
    Ce serveur gère l'état partagé de la carte et des tokens, ainsi que la communication en temps réel.
    ```bash
    python server_sync.py
    ```
    *   Le serveur démarrera sur `http://0.0.0.0:9000` (accessible localement via `http://localhost:9000`).
    *   Une nouvelle fenêtre de navigateur s'ouvrira automatiquement (sur `http://127.0.0.1:9000`, qui pointe vers la même application mais via un autre serveur, ce qui est utile pour les tests).

**Note sur le Webtracker :**
L'application est conçue pour se connecter à une API Webtracker externe (par défaut `http://localhost:5000`). Assurez-vous que votre Webtracker est en cours d'exécution et accessible à cette adresse si vous souhaitez utiliser l'intégration automatique des participants.

### Accéder aux vues

*   **Vue Maître de Jeu (principale) :** Ouvrez votre navigateur et accédez à `http://localhost:8000`.
*   **Vue Observateur (OBS) :** Ouvrez un onglet séparé et accédez à `http://localhost:9000/obs`.

### Accès depuis d'autres appareils (tablettes/mobiles)

Pour permettre à d'autres appareils sur votre réseau local d'accéder aux vues :
1.  **Identifiez l'adresse IP de votre machine** (l'appareil exécutant les serveurs Python).
2.  Accédez à l'application via `http://[VOTRE_ADRESSE_IP]:8000` pour la vue principale.
3.  Accédez à la vue OBS via `http://[VOTRE_ADRESSE_IP]:9000/obs`.

## Structure des dossiers
```
.
├───favicon.ico               # Icône du site affichée dans l'onglet du navigateur.
├───index.html                # Vue principale de l'application (pour le Maître de Jeu).
├───obs.html                  # Vue observateur (affichage sans interaction).
├───server_sync.py            # Serveur Socket.IO responsable de la synchronisation en temps réel des données (carte, tokens) entre les clients. Gère également la persistance des données.
├───server.py                 # Serveur HTTP statique pour servir les fichiers frontend (HTML, CSS, JS) de l'application.
├───assets/                   # Contient les ressources statiques de l'application.
│   ├───portraits/            # Emplacement par défaut pour les images de portraits des personnages (joueurs, PNJ, etc.).
│   └───tokens/               # Emplacement par défaut pour les images des tokens à utiliser sur la carte.
├───css/
│   └───style.css             # Fichier de styles CSS principal pour l'ensemble de l'application.
├───data/                     # Stocke les données persistantes de l'application.
│   ├───saved_map.json        # Fichier JSON sauvegardant l'URL de l'image de la carte actuellement chargée (ex: `{"map": "/maps/current_map.jpeg"}`).
│   ├───saved_tokens.json     # Fichier JSON sauvegardant l'état de tous les tokens actifs sur la carte, incluant leurs positions, tailles, couleurs, noms et URLs de portraits (ex: `{"tokens": [...]}`).
│   ├───maps/                 # Répertoire pour stocker les images des cartes de bataille uploadées.
│   │   └───current_map.jpeg  # Exemple d'image de carte actuellement chargée.
│   └───portraits/            # Répertoire local pour les portraits, utilisé comme fallback ou pour des portraits spécifiques.
│       ├───Allies/           # Sous-répertoire pour les portraits des alliés.
│       ├───Players/          # Sous-répertoire pour les portraits des joueurs.
│       └───PNJ/              # Sous-répertoire pour les portraits des Personnages Non-Joueurs.
└───js/
    ├───app.js                # Logique JavaScript principale pour la vue du Maître de Jeu (gestion de l'UI, Socket.IO client, Webtracker).
    ├───obs_app.js            # Logique JavaScript pour la vue observateur (rendu de la carte et des tokens sur canvas).
    ├───socket.io.js          # Bibliothèque cliente Socket.IO (version complète), utilisée pour la communication en temps réel.
    ├───socket.io.min.js      # Version minifiée de la bibliothèque cliente Socket.IO.
    └───webtracker-connector.js # Module JavaScript pour la connexion et l'interaction avec l'API Webtracker externe.```