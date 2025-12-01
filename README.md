# Battle Map VTT

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
├───favicon.ico
├───index.html                # Vue principale de l'application
├───obs.html                  # Vue observateur
├───server_sync.py            # Serveur Socket.IO pour la synchronisation
├───server.py                 # Serveur HTTP pour fichiers statiques
├───assets/
│   ├───portraits/
│   └───tokens/
├───css/
│   └───style.css             # Styles de l'application
├───data/
│   ├───saved_map.json        # État persistant de la carte
│   ├───saved_tokens.json     # État persistant des tokens
│   ├───maps/                 # Images de cartes sauvegardées
│   │   └───current_map.jpeg
│   └───portraits/            # Portraits locaux (fallback)
│       ├───Allies/
│       ├───Players/
│       └───PNJ/
└───js/
    ├───app.js                # Logique frontend de la vue principale
    ├───obs_app.js            # Logique frontend de la vue observateur (canvas)
    ├───socket.io.js
    ├───socket.io.min.js
    └───webtracker-connector.js # Module de connexion à l'API Webtracker
```