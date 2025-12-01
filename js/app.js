// -*- coding: utf-8 -*-
/**
 * @file app.js
 * @description
 * Ce script JavaScript est le cœur de l'application Battle Map VTT côté client (vue Maître de Jeu).
 * Il gère l'interface utilisateur, le chargement des cartes, la manipulation des tokens,
 * et la communication en temps réel avec le serveur de synchronisation via Socket.IO.
 *
 * Fonctionnalités principales:
 * - Chargement et affichage dynamique des cartes de bataille.
 * - Création, déplacement (glisser-déposer), et suppression de tokens avec accrochage à la grille.
 * - Synchronisation en temps réel de l'état de la carte et des tokens avec les autres clients (via server_sync.py).
 * - Intégration avec un module Webtracker pour la gestion automatisée des tokens de participants.
 * - Gestion de la persistance locale (pour les positions personnalisées des tokens).
 */

// =================================================================================
// Variables Globales & Constantes
// =================================================================================

// Références aux éléments DOM principaux de l'interface.
const gridContainer = document.getElementById('grid-container'); // Conteneur principal pour la grille et la carte.
const mapContainer = document.getElementById('map-container');     // Conteneur spécifique pour l'image de la carte.
const tokensContainer = document.getElementById('tokens-container'); // Conteneur pour tous les tokens affichés.
const gridOverlay = document.getElementById('grid-overlay');       // Superposition de la grille visuelle.

// Flag pour éviter les boucles de synchronisation.
// Si `true`, indique que les mises à jour des tokens proviennent du serveur et ne doivent pas
// être renvoyées immédiatement, empêchant ainsi la re-création ou la re-synchronisation inutile.
window.receivingServerUpdate = false;

// Détection intelligente de l'adresse du serveur de synchronisation.
// Permet à l'application de se connecter correctement que ce soit en développement local (localhost)
// ou déployée sur un réseau (pour l'accès depuis des tablettes/mobiles).
const SYNC_SERVER_HOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? window.location.hostname  // Utilise 'localhost' ou '127.0.0.1' pour le développement local.
    : window.location.hostname; // Utilise l'adresse IP de la machine pour l'accès réseau.

const SYNC_SERVER_URL = `http://${SYNC_SERVER_HOST}:9000`; // URL complète du serveur de synchronisation Socket.IO.
const GRID_SIZE = 10; // Taille de la maille de la grille en pixels, utilisée pour l'accrochage des tokens.

let syncSocket = null;     // Instance du client Socket.IO, utilisée pour la communication temps réel.
let isSyncReady = false;   // Flag indiquant si la connexion Socket.IO est établie et prête à l'emploi.

// Stockage des positions personnalisées des tokens.
// Cela permet de sauvegarder et de restaurer les positions des tokens qui peuvent ne pas être
// gérées directement par le serveur, ou pour des ajustements côté client.
window.customTokenPositions = {};

// =================================================================================
// Fonctions Utilitaires
// =================================================================================

/**
 * Génère un identifiant unique pour un nouveau token.
 * @returns {string} Un ID de token unique.
 */
function generateTokenId() {
    return 't_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// =================================================================================
// Définitions de Classes
// =================================================================================

/**
 * @class MapManager
 * @description
 * Gère le chargement, l'affichage et les propriétés de la carte de bataille dans l'interface utilisateur.
 * Responsable de la mise à jour des dimensions de la grille en fonction de la taille de la carte chargée.
 */
class MapManager {
    /**
     * @constructor
     * @param {HTMLElement} mapContainer - L'élément DOM qui contient l'image de la carte.
     * @param {HTMLElement} gridContainer - L'élément DOM qui sert de conteneur principal pour la grille et la carte.
     * @param {HTMLElement} gridOverlay - L'élément DOM représentant la surcouche de la grille.
     */
    constructor(mapContainer, gridContainer, gridOverlay) {
        this.mapContainer = mapContainer;
        this.gridContainer = gridContainer;
        this.gridOverlay = gridOverlay;
    }

    /**
     * Charge une image de carte dans l'interface.
     * Met à jour les dimensions des conteneurs de grille pour correspondre à la taille de la carte.
     * Peut optionnellement synchroniser la nouvelle carte avec le serveur.
     *
     * @param {string} imageSrc - La source de l'image de la carte (URL directe ou Data URL Base64).
     * @param {boolean} [shouldSync=false] - Indique si la carte doit être envoyée au serveur de synchronisation.
     */
    loadMap(imageSrc, shouldSync = false) {
        // Supprime toutes les cartes précédemment chargées pour n'afficher que la nouvelle.
        while (this.mapContainer.firstChild) {
            this.mapContainer.removeChild(this.mapContainer.firstChild);
        }

        const mapImage = document.createElement('img');
        
        if (imageSrc) {
            // Si c'est une URL directe (http/https ou chemin relatif).
            if (imageSrc.startsWith('http') || imageSrc.startsWith('/')) {
                mapImage.src = imageSrc;
                console.log('[MAP] Chargement de la carte:', imageSrc);
            } 
            // Si c'est une Data URL Base64 (image encodée directement dans le CSS).
            else if (imageSrc.startsWith('data:image')) {
                mapImage.src = imageSrc;
                console.log('[MAP] Chargement de la carte (Base64):', imageSrc.substring(0, 50) + '...');
                
                // Si la synchronisation est requise et que le client est connecté au serveur,
                // envoie l'URL de données Base64 au serveur pour traitement.
                if (shouldSync && isSyncReady) {
                    console.log('[SYNC] Envoi de la carte Base64 au serveur pour sauvegarde et diffusion...');
                    syncSocket.emit('change_map', { map: imageSrc });
                }
            } else {
                console.error('[MAP] Source de carte invalide ou non reconnue:', imageSrc);
                return;
            }
        } else {
            console.error('[MAP] Source de carte invalide:', imageSrc);
            return;
        }
        
        mapImage.className = 'map-image'; // Applique la classe CSS pour le style.

        // Gère l'événement `onload` une fois que l'image est entièrement chargée.
        mapImage.onload = () => {
            const { naturalWidth, naturalHeight } = mapImage;
            // Ajuste les dimensions du conteneur de grille et de la surcouche pour qu'ils
            // correspondent à la taille naturelle de l'image de la carte.
            this.gridContainer.style.width = `${naturalWidth}px`;
            this.gridContainer.style.height = `${naturalHeight}px`;
            this.gridOverlay.style.width = `${naturalWidth}px`;
            this.gridOverlay.style.height = `${naturalHeight}px`;
            // S'assure que la zone de bataille s'ajuste dynamiquement.
            document.querySelector('.battle-area').style.height = 'auto';
            console.log(`[MAP] Carte chargée avec succès: ${naturalWidth}x${naturalHeight}px.`);
        };
        
        // Gère l'événement `onerror` si le chargement de l'image échoue.
        mapImage.onerror = () => {
            console.error(`[MAP] Échec du chargement de l'image de carte depuis: ${imageSrc}`);
            
            // Tente une récupération si l'URL contient une IP locale mais ne se charge pas.
            // Cela peut arriver si l'IP locale du serveur change ou est mal configurée.
            if (imageSrc.includes('http://') && !imageSrc.includes('127.0.0.1') && !imageSrc.includes('localhost')) {
                console.log('[MAP] Tentative de récupération avec chemin relatif...');
                // Extrait le chemin relatif de l'URL absolue.
                const parts = imageSrc.split('/');
                const relativePath = '/' + parts.slice(3).join('/'); // Ex: /maps/current_map.jpeg
                console.log(`[MAP] Essai avec chemin relatif: ${relativePath}`);
                
                // Crée une nouvelle image pour tenter de charger avec le chemin relatif.
                const newImg = document.createElement('img');
                newImg.className = 'map-image';
                newImg.src = relativePath;
                newImg.onload = () => {
                    const { naturalWidth, naturalHeight } = newImg;
                    this.gridContainer.style.width = `${naturalWidth}px`;
                    this.gridContainer.style.height = `${naturalHeight}px`;
                    this.gridOverlay.style.width = `${naturalWidth}px`;
                    this.gridOverlay.style.height = `${naturalHeight}px`;
                    document.querySelector('.battle-area').style.height = 'auto';
                    console.log(`[MAP] Récupération réussie, carte chargée: ${naturalWidth}x${naturalHeight}px.`);
                    
                    // Remplace l'image originale par la nouvelle si la récupération a fonctionné.
                    if (this.mapContainer.contains(mapImage)) {
                        this.mapContainer.removeChild(mapImage);
                    }
                    this.mapContainer.appendChild(newImg);
                };
                
                newImg.onerror = () => {
                    console.error(`[MAP] La récupération a échoué, impossible de charger la carte avec le chemin relatif: ${relativePath}`);
                };
            }
        };

        this.mapContainer.appendChild(mapImage); // Ajoute l'image au conteneur de la carte.
    }
}

/**
 * @class TokenManager
 * @description
 * Gère la création, la suppression, la mise à jour de la position et l'interactivité (glisser-déposer)
 * des tokens sur la carte. Il est responsable de la représentation visuelle des tokens et de leur
 * synchronisation initiale avec le serveur.
 */
class TokenManager {
    /**
     * @constructor
     * @param {HTMLElement} container - L'élément DOM où les tokens seront ajoutés.
     */
    constructor(container) {
        this.container = container;
        this.tokens = []; // Tableau pour garder une trace des éléments DOM des tokens.
    }

    /**
     * Crée un nouvel élément DOM pour un token et l'ajoute au conteneur.
     * Si un `existingId` est fourni, il est utilisé, sinon un nouvel ID est généré.
     * Configure le style, le portrait, le nom et rend le token déplaçable.
     *
     * @param {number} x - La position initiale X du token.
     * @param {number} y - La position initiale Y du token.
     * @param {number} size - La taille (largeur et hauteur) du token en pixels.
     * @param {string} color - La couleur principale du token ou de sa bordure.
     * @param {string} name - Le nom du token, affiché comme label.
     * @param {string} portraitUrl - L'URL de l'image de portrait du token, si disponible.
     * @param {string} [existingId=null] - Un ID existant pour le token, utile lors de la réception de tokens du serveur.
     * @returns {HTMLElement} L'élément DOM du token créé.
     */
    createToken(x, y, size, color, name, portraitUrl, existingId = null) {
        // Utilise l'ID fourni ou génère un nouvel ID unique.
        const tokenId = existingId || `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        // Empêche la recréation si un token avec cet ID existe déjà dans le DOM.
        if (document.getElementById(tokenId)) {
            return document.getElementById(tokenId);
        }

        const token = document.createElement('div');
        token.className = 'token'; // Classe CSS pour le style de base.
        token.id = tokenId;        // L'ID unique du token.
        token.style.width = `${size}px`;
        token.style.height = `${size}px`;
        token.style.left = `${x}px`; // Position X initiale.
        token.style.top = `${y}px`;  // Position Y initiale.
        token.style.position = 'absolute';
        token.style.borderRadius = '50%'; // Pour une forme de token circulaire.
        token.style.boxShadow = '0 0 8px rgba(0,0,0,0.6)'; // Ombre pour un effet de profondeur.
        token.dataset.name = name; // Stocke le nom dans un attribut de données.
        token.dataset.id = tokenId; // Stocke l'ID dans un attribut de données.

        // Configure l'apparence du token en fonction de la présence d'un portrait.
        if (portraitUrl) {
            // Construit l'URL complète du portrait en utilisant l'URL du serveur de synchronisation.
            const imageUrl = `${SYNC_SERVER_URL}${portraitUrl}`;
            token.style.backgroundImage = `url('${imageUrl}')`; // Image de fond du token.
            token.style.backgroundSize = 'cover';               // Couvre toute la surface du token.
            token.style.backgroundPosition = 'center';          // Centre l'image.
            token.style.backgroundColor = 'transparent';        // Fond transparent si image.
            token.style.border = `3px solid ${color}`;          // Bordure colorée.
        } else {
            token.style.backgroundColor = color; // Couleur de fond si pas de portrait.
            token.style.border = '2px solid #fff'; // Bordure blanche.
        }

        const nameLabel = document.createElement('div');
        nameLabel.className = 'token-name'; // Classe CSS pour le style du nom.
        nameLabel.textContent = name;       // Affiche le nom du token.
        token.appendChild(nameLabel);       // Ajoute le label au token.

        this.container.appendChild(token); // Ajoute l'élément token au DOM.
        this.tokens.push(token);           // Ajoute le token à la liste interne des tokens gérés.

        this.makeTokenDraggable(token); // Rend le token interactif (déplaçable).
        
        // Enregistre le token auprès du serveur de synchronisation s'il est créé localement
        // (c'est-à-dire pas en réponse à un événement de 'token_added' du serveur)
        // et que la synchronisation est active.
        if (isSyncReady && !window.receivingServerUpdate) {
            console.log(`[SYNC] Enregistrement du token ${tokenId} auprès du serveur.`);
            const tokenData = {
                id: tokenId,
                x: x,
                y: y,
                size: size,
                color: color,
                name: name,
                portraitUrl: portraitUrl
            };
            // Émet l'événement `add_token` au serveur.
            syncSocket.emit('add_token', tokenData);
        }
        
        return token;
    }

    /**
     * Rend un token spécifique déplaçable par l'utilisateur (souris et tactile).
     * Gère l'accrochage à la grille et les limites de déplacement sur la carte.
     * Synchronise les mouvements avec le serveur.
     * @param {HTMLElement} token - L'élément DOM du token à rendre déplaçable.
     */
    makeTokenDraggable(token) {
        let offsetX, offsetY; // Décalage entre le curseur et le coin supérieur gauche du token.

        // --- Gestion des événements de la souris ---
        const startDrag = (e) => {
            e.preventDefault(); // Empêche le comportement par défaut du navigateur (ex: sélection de texte).
            const rect = token.getBoundingClientRect(); // Obtient la position et la taille du token.
            offsetX = e.clientX - rect.left; // Calcule le décalage initial.
            offsetY = e.clientY - rect.top;
            document.addEventListener('mousemove', drag); // Commence à écouter les mouvements de la souris.
            document.addEventListener('mouseup', stopDrag);   // Arrête l'écoute du drag.
            token.style.zIndex = '1000'; // Met le token au-dessus des autres éléments pendant le drag.
        };

        const drag = (e) => {
            e.preventDefault();
            moveTokenTo(e.clientX, e.clientY); // Déplace le token à la nouvelle position.
        };

        const stopDrag = () => {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
            token.style.zIndex = '100'; // Restaure le z-index après le drag.
            saveTokenPosition();        // Sauvegarde la position finale.
        };
        
        // --- Gestion des événements tactiles (pour tablettes/mobiles) ---
        const startTouchDrag = (e) => {
            if (e.touches.length !== 1) return; // S'assure qu'un seul doigt est utilisé.
            e.preventDefault(); // Empêche le défilement par défaut.
            
            const touch = e.touches[0];
            const rect = token.getBoundingClientRect();
            offsetX = touch.clientX - rect.left;
            offsetY = touch.clientY - rect.top;
            
            document.addEventListener('touchmove', touchDrag, { passive: false }); // `passive: false` pour `preventDefault`.
            document.addEventListener('touchend', stopTouchDrag);
            document.addEventListener('touchcancel', stopTouchDrag); // En cas d'interruption du touch.
            token.style.zIndex = '1000';
        };
        
        const touchDrag = (e) => {
            if (e.touches.length !== 1) return;
            e.preventDefault();
            
            const touch = e.touches[0];
            moveTokenTo(touch.clientX, touch.clientY);
        };
        
        const stopTouchDrag = () => {
            document.removeEventListener('touchmove', touchDrag);
            document.removeEventListener('touchend', stopTouchDrag);
            document.removeEventListener('touchcancel', stopTouchDrag);
            token.style.zIndex = '100';
            saveTokenPosition();
        };
        
        // --- Fonction utilitaire commune pour le déplacement du token ---
        const moveTokenTo = (clientX, clientY) => {
            const gridRect = gridContainer.getBoundingClientRect();
            let newX = clientX - gridRect.left - offsetX; // Position relative au conteneur de la grille.
            let newY = clientY - gridRect.top - offsetY;
            
            // Accrochage à la grille: arrondit les positions aux multiples de GRID_SIZE.
            newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
            newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

            // Limite le déplacement du token aux bords du conteneur de la grille.
            newX = Math.max(0, Math.min(newX, gridRect.width - token.offsetWidth));
            newY = Math.max(0, Math.min(newY, gridRect.height - token.offsetHeight));

            token.style.left = `${newX}px`; // Applique la nouvelle position.
            token.style.top = `${newY}px`;

            // Sauvegarde la position personnalisée localement.
            window.customTokenPositions[token.id] = { x: newX, y: newY };
            
            // Si la synchronisation est prête, envoie la nouvelle position au serveur.
            if (isSyncReady) {
                console.log(`[SYNC] Envoi événement move_token pour le token ${token.id} à la position (${newX}, ${newY}).`);
                syncSocket.emit('move_token', { id: token.id, x: newX, y: newY });
            }
        };
        
        // --- Sauvegarde de la position finale du token (utilisé après stopDrag/stopTouchDrag) ---
        const saveTokenPosition = () => {
            const currentX = parseInt(token.style.left);
            const currentY = parseInt(token.style.top);
            if (!isNaN(currentX) && !isNaN(currentY)) {
                window.customTokenPositions[token.id] = { x: currentX, y: currentY };
                console.log(`[LOCAL] Position du token ${token.id} sauvegardée localement: ${currentX},${currentY}.`);
            }
        };

        // Ajout des écouteurs d'événements pour le début du drag.
        token.addEventListener('mousedown', startDrag);
        token.addEventListener('touchstart', startTouchDrag, { passive: false });
    }

    /**
     * Supprime un token du DOM et de la liste interne des tokens gérés.
     * @param {string} tokenId - L'ID du token à supprimer.
     */
    removeToken(tokenId) {
        const token = document.getElementById(tokenId);
        if (token) {
            this.tokens = this.tokens.filter(t => t.id !== tokenId); // Retire le token du tableau.
            token.remove(); // Retire l'élément du DOM.
            console.log(`[TOKEN] Token ${tokenId} supprimé.`);
        }
    }

    /**
     * Supprime tous les tokens de la carte.
     * Peut optionnellement notifier le serveur de synchronisation.
     * @param {boolean} [notifyServer=true] - Indique si le serveur doit être notifié de la suppression.
     */
    clearAllTokens(notifyServer = true) {
        // Retire tous les tokens du DOM et vide le tableau interne.
        while (this.tokens.length > 0) {
            const token = this.tokens.pop();
            token.remove();
        }
        console.log('[TOKEN] Tous les tokens locaux ont été effacés.');
        // Si la synchronisation est prête et la notification est demandée, informe le serveur.
        if (notifyServer && isSyncReady) {
            console.log('[SYNC] Notification du serveur pour effacer tous les tokens.');
            syncSocket.emit('clear_all_tokens');
        }
    }
    
    /**
     * Met à jour la position visuelle d'un token existant.
     * Utilisé principalement pour appliquer les mises à jour de position reçues du serveur.
     * @param {string} id - L'ID du token à mettre à jour.
     * @param {number} x - La nouvelle position X.
     * @param {number} y - La nouvelle position Y.
     */
    updateTokenPosition(id, x, y) {
        const token = document.getElementById(id);
        if (token) {
            token.style.left = `${x}px`;
            token.style.top = `${y}px`;
            // Met également à jour la position personnalisée locale si elle existe.
            window.customTokenPositions[id] = { x: x, y: y };
            console.log(`[TOKEN] Position du token ${id} mise à jour à (${x}, ${y}).`);
        }
    }
}

// =================================================================================
// Logique de Synchronisation Socket.IO
// =================================================================================

/**
 * Configure et initialise le client Socket.IO pour la communication en temps réel avec le serveur.
 * Établit les gestionnaires d'événements pour les messages du serveur.
 * @param {MapManager} mapManager - L'instance de MapManager pour gérer les mises à jour de la carte.
 * @param {TokenManager} tokenManager - L'instance de TokenManager pour gérer les mises à jour des tokens.
 */
function setupSyncClient(mapManager, tokenManager) {
    // Initialise la connexion Socket.IO avec l'URL du serveur de synchronisation.
    // Utilise 'websocket' comme transport préféré pour une communication efficace.
    syncSocket = io(SYNC_SERVER_URL, { transports: ['websocket'] });

    /**
     * Gère l'événement `connect` lorsque le client est connecté avec succès au serveur Socket.IO.
     * Demande l'état initial de la battlemap au serveur.
     */
    syncSocket.on('connect', () => {
        console.log('[SYNC] Connecté au serveur de synchronisation.');
        isSyncReady = true; // Met à jour le flag de disponibilité de la synchronisation.
        syncSocket.emit('request_initial_state'); // Demande les données actuelles de la carte et des tokens.
    });

    /**
     * Gère l'événement `disconnect` lorsque le client est déconnecté du serveur.
     */
    syncSocket.on('disconnect', () => {
        console.warn('[SYNC] Déconnecté du serveur de synchronisation.');
        isSyncReady = false; // Met à jour le flag de disponibilité.
    });

    /**
     * Gère l'événement `initial_state` reçu au démarrage ou après une reconnexion.
     * Met à jour la carte et tous les tokens pour refléter l'état actuel du serveur.
     * @param {object} state - L'objet d'état initial contenant la carte et les tokens.
     */
    syncSocket.on('initial_state', (state) => {
        console.log('[SYNC] État initial reçu du serveur:', state);
        if (state.map) {
            mapManager.loadMap(state.map); // Charge la carte reçue.
        }
        tokenManager.clearAllTokens(false); // Efface les tokens existants localement sans notifier le serveur.
        
        // Active le flag pour éviter de renvoyer au serveur les tokens que nous recevons.
        window.receivingServerUpdate = true;
        
        // Crée chaque token reçu du serveur. L'ID est passé pour garantir la cohérence.
        state.tokens.forEach(tokenData => {
            if (tokenData) {
                tokenManager.createToken(tokenData.x, tokenData.y, tokenData.size, tokenData.color, tokenData.name, tokenData.portraitUrl, tokenData.id);
            }
        });
        
        // Désactive le flag une fois tous les tokens créés.
        window.receivingServerUpdate = false;
    });

    /**
     * Gère l'événement `token_added` lorsqu'un nouveau token est ajouté par un autre client.
     * Crée le token correspondant localement.
     * @param {object} data - Les données du token ajouté.
     */
    syncSocket.on('token_added', (data) => {
        console.log('[SYNC] Token ajouté par un autre client:', data);
        
        // Active le flag pour éviter de renvoyer le token au serveur.
        window.receivingServerUpdate = true;
        
        // Crée le token en utilisant les données et l'ID du serveur.
        tokenManager.createToken(data.x, data.y, data.size, data.color, data.name, data.portraitUrl, data.id);
        
        // Désactive le flag.
        window.receivingServerUpdate = false;
    });

    /**
     * Gère l'événement `token_moved` lorsqu'un token est déplacé par un autre client.
     * Met à jour la position du token localement.
     * @param {object} data - Les données du token déplacé (ID, x, y).
     */
    syncSocket.on('token_moved', (data) => {
        console.log('[SYNC] Événement de déplacement de token reçu:', data);
        tokenManager.updateTokenPosition(data.id, data.x, data.y);
    });

    /**
     * Gère l'événement `token_removed` lorsqu'un token est supprimé par un autre client.
     * Supprime le token correspondant localement.
     * @param {object} data - Les données du token supprimé (ID).
     */
    syncSocket.on('token_removed', (data) => {
        console.log('[SYNC] Token supprimé par un autre client:', data);
        tokenManager.removeToken(data.id);
    });
    
    /**
     * Gère l'événement `all_tokens_cleared` lorsque tous les tokens sont effacés par un autre client.
     * Efface tous les tokens localement sans notifier le serveur.
     */
    syncSocket.on('all_tokens_cleared', () => {
        console.log('[SYNC] Tous les tokens effacés par un autre client.');
        tokenManager.clearAllTokens(false); // `false` pour éviter une notification en boucle au serveur.
    });

    /**
     * Gère l'événement `map_changed` lorsqu'une nouvelle carte est définie par un autre client.
     * Charge la nouvelle carte localement.
     * @param {object} data - Les données de la nouvelle carte (URL).
     */
    syncSocket.on('map_changed', (data) => {
        console.log('[SYNC] Carte changée par un autre client.');
        if (data.map) {
            mapManager.loadMap(data.map); // Charge la nouvelle carte.
        }
    });
}

// =================================================================================
// Initialisation de l'Application
// =================================================================================

/**
 * Exécute le code une fois que tout le contenu du DOM est chargé.
 * C'est le point d'entrée principal pour l'initialisation de l'application cliente.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Instancie les gestionnaires de la carte et des tokens, leur passant les éléments DOM pertinents.
    const mapManager = new MapManager(mapContainer, gridContainer, gridOverlay);
    const tokenManager = new TokenManager(tokensContainer);
    // Instancie le connecteur Webtracker (présumé défini ailleurs, probablement dans webtracker-connector.js).
    const webTrackerConnector = new WebTrackerConnector(tokenManager);

    // Configure le client Socket.IO pour la synchronisation en temps réel.
    setupSyncClient(mapManager, tokenManager);
    
    // Connecte le module Webtracker pour commencer à recevoir des données de participants.
    webTrackerConnector.connect();

    // --- Écouteurs d'événements pour les interactions utilisateur ---

    // Gère le clic sur le bouton de chargement de carte, déclenchant l'input de fichier caché.
    document.getElementById('load-map-btn').addEventListener('click', () => {
        document.getElementById('map-upload').click();
    });
    
    // Gère le clic sur le bouton d'actualisation de la carte.
    document.getElementById('refresh-map-btn').addEventListener('click', () => {
        console.log('[MAP] Demande de rafraîchissement de la carte...');
        if (isSyncReady) {
            // Si connecté, demande l'état actuel de la carte au serveur de synchronisation.
            syncSocket.emit('request_current_map');
            console.log('[SYNC] Demande de l\'état actuel de la carte envoyée au serveur.');
        } else {
            // Si non connecté, tente de charger une carte par défaut directement depuis le serveur statique.
            const serverPrefix = window.location.origin; // Ex: http://192.168.1.100:9000
            // Construit une URL potentielle pour une carte par défaut.
            const mapUrl = serverPrefix + '/data/maps/current_map.jpeg'; // Note: corrected to .jpeg based on folder structure
            console.log(`[MAP] Tentative de chargement direct depuis: ${mapUrl}.`);
            mapManager.loadMap(mapUrl, false); // Charge localement sans notifier le serveur.
        }
    });

    // Gère la sélection d'un fichier image de carte par l'utilisateur.
    document.getElementById('map-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const mapDataUrl = event.target.result; // Récupère le contenu du fichier sous forme de Data URL.
                // Charge la carte localement et demande la synchronisation avec le serveur.
                mapManager.loadMap(mapDataUrl, true);
            };
            reader.readAsDataURL(file); // Lit le fichier comme une Data URL.
        }
    });

    // Gère le clic sur le bouton pour effacer tous les tokens.
    document.getElementById('clear-tokens-btn').addEventListener('click', () => {
        tokenManager.clearAllTokens(true); // Efface les tokens et notifie le serveur.
    });

    // Gère le clic sur le bouton pour reconnecter le Webtracker.
    document.getElementById('reconnect-webtracker-btn').addEventListener('click', () => {
        webTrackerConnector.connect(); // Tente de (re)connecter le Webtracker.
    });
});
