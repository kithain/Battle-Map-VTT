// -*- coding: utf-8 -*-
/**
 * @file obs_app.js
 * @description
 * Ce script JavaScript est le cœur de l'application Battle Map VTT côté client (vue Observateur - OBS).
 * Il est responsable de l'affichage en temps réel des cartes de bataille et des tokens
 * sur un élément `<canvas>`, en se synchronisant avec le serveur via Socket.IO.
 *
 * Fonctionnalités principales:
 * - Rendu dynamique de la carte et des tokens sur un canvas HTML5.
 * - Synchronisation en temps réel des changements de carte et de la position des tokens.
 * - Gestion du redimensionnement de la fenêtre pour adapter le canvas.
 * - Chargement intelligent des images de carte et des portraits de token, incluant un système de cache
 *   et des logiques de fallback pour les portraits.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Références à l'élément canvas et à son contexte de dessin 2D.
    const canvas = document.getElementById('map-canvas');
    const ctx = canvas.getContext('2d');

    // Détection intelligente de l'adresse du serveur de synchronisation.
    // Utilise le hostname actuel pour construire l'URL du serveur.
    const SYNC_SERVER_HOST = window.location.hostname;
    const SYNC_SERVER_URL = `http://${SYNC_SERVER_HOST}:9000`;

    // État local de l'application OBS, contenant la carte et la liste des tokens.
    let state = {
        map: null,    // L'objet Image de la carte actuellement affichée.
        tokens: [],   // Liste des objets token, chacun avec ses propriétés et son image de portrait chargée.
    };

    // Cache pour les images de portrait afin d'éviter de recharger les mêmes images plusieurs fois.
    const portraitCache = {};

    // =================================================================================
    // Fonctions de Rendu et Utilitaires
    // =================================================================================


    /**
     * Redimensionne le canvas pour qu'il corresponde à la taille actuelle de la fenêtre du navigateur.
     * Appelle `draw()` pour redessiner le contenu après le redimensionnement.
     */
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        draw(); // Redessine le contenu après le changement de taille du canvas.
    }

    /**
     * Fonction principale de dessin qui efface le canvas et redessine la carte et tous les tokens.
     * Gère l'adaptation de la carte à la taille du canvas tout en conservant son ratio d'aspect.
     * Dessine les tokens avec leurs portraits ou leur couleur de fond, ainsi que leur nom.
     */
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Efface tout le contenu précédent du canvas.
        
        // Dessine la carte si elle est chargée.
        if (state.map && state.map.complete) {
            const mapAspectRatio = state.map.width / state.map.height;     // Ratio d'aspect de l'image de la carte.
            const canvasAspectRatio = canvas.width / canvas.height;        // Ratio d'aspect du canvas.
            
            let drawWidth, drawHeight, drawX, drawY;

            // Calcule les dimensions et la position de la carte pour qu'elle s'adapte au canvas
            // sans être déformée (comportement "contain").
            if (mapAspectRatio > canvasAspectRatio) {
                // La carte est plus large proportionnellement que le canvas, elle prendra toute la largeur.
                drawWidth = canvas.width;
                drawHeight = drawWidth / mapAspectRatio;
                drawX = 0;
                drawY = (canvas.height - drawHeight) / 2; // Centre verticalement.
            } else {
                // La carte est plus haute proportionnellement que le canvas, elle prendra toute la hauteur.
                drawHeight = canvas.height;
                drawWidth = drawHeight * mapAspectRatio;
                drawY = 0;
                drawX = (canvas.width - drawWidth) / 2; // Centre horizontalement.
            }
            
            // Dessine l'image de la carte sur le canvas.
            ctx.drawImage(state.map, drawX, drawY, drawWidth, drawHeight);

            // Dessine chaque token.
            state.tokens.forEach(token => {
                // Calcule la position et la taille du token par rapport à la carte affichée et au canvas.
                const tokenX = drawX + (token.x / state.map.width) * drawWidth;
                const tokenY = drawY + (token.y / state.map.height) * drawHeight;
                const tokenSize = (token.size / state.map.width) * drawWidth;

                ctx.save(); // Sauvegarde l'état actuel du contexte (pour le clip et le style).
                
                // Dessine le portrait du token si disponible.
                if (token.portraitImg && token.portraitImg.complete) {
                    ctx.beginPath();
                    // Dessine un cercle pour masquer les coins de l'image de portrait.
                    ctx.arc(tokenX + tokenSize / 2, tokenY + tokenSize / 2, tokenSize / 2, 0, Math.PI * 2, true);
                    ctx.closePath();
                    ctx.clip(); // Applique le masque circulaire.
                    
                    ctx.drawImage(token.portraitImg, tokenX, tokenY, tokenSize, tokenSize); // Dessine l'image.
                    
                    ctx.beginPath();
                    ctx.arc(tokenX + tokenSize / 2, tokenY + tokenSize / 2, tokenSize / 2, 0, Math.PI * 2, true);
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = token.color || '#FFFFFF'; // Couleur de bordure du token.
                    ctx.stroke(); // Dessine la bordure.

                } else {
                    // Si pas de portrait, dessine un cercle coloré.
                    ctx.beginPath();
                    ctx.arc(tokenX + tokenSize / 2, tokenY + tokenSize / 2, tokenSize / 2, 0, Math.PI * 2, false);
                    ctx.fillStyle = token.color || 'blue'; // Couleur de remplissage.
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#fff'; // Bordure blanche par défaut.
                    ctx.stroke();
                }
                
                ctx.restore(); // Restaure l'état précédent du contexte (supprime le clip et le style).

                // Dessine le nom du token sous le token.
                ctx.fillStyle = 'white';    // Couleur du texte.
                ctx.textAlign = 'center';   // Alignement du texte.
                ctx.font = '14px Arial';    // Police et taille du texte.
                ctx.strokeStyle = 'black';  // Contour du texte.
                ctx.lineWidth = 3;          // Épaisseur du contour.
                ctx.strokeText(token.name, tokenX + tokenSize / 2, tokenY + tokenSize + 15); // Dessine le contour.
                ctx.fillText(token.name, tokenX + tokenSize / 2, tokenY + tokenSize + 15);     // Dessine le texte.
            });
        }
    }

    /**
     * Charge une image de carte à partir d'une URL et la définit comme la carte actuelle dans l'état de l'application.
     * Met à jour le canvas après le chargement.
     *
     * @param {string|null} url - L'URL de l'image de la carte ou `null` pour effacer la carte.
     */
    function loadMap(url) {
        if (!url) {
            state.map = null; // Efface la carte si l'URL est nulle.
            draw();           // Redessine le canvas vide.
            return;
        }
        console.log('[MAP_OBS] Tentative de chargement de la carte:', url);
        
        // Vérifie si l'URL est relative (commence par /) ou absolue.
        let finalUrl = url;
        if (url.startsWith('/') && !url.startsWith('//')) {
            // Si l'URL est relative, la convertit en URL absolue en y ajoutant l'adresse du serveur de synchronisation.
            finalUrl = `${SYNC_SERVER_URL}${url}`;
            console.log('[MAP_OBS] URL convertie en absolue pour chargement:', finalUrl);
        }
        
        const mapImage = new Image();
        mapImage.crossOrigin = "Anonymous"; // Permet le chargement d'images depuis des origines différentes (nécessaire pour canvas).
        mapImage.src = finalUrl;
        mapImage.onload = () => {
            console.log('[MAP_OBS] Carte chargée avec succès:', finalUrl);
            state.map = mapImage; // Met à jour l'objet carte dans l'état.
            draw();               // Redessine la carte sur le canvas.
        };
        mapImage.onerror = (error) => {
            console.error("[MAP_OBS] Impossible de charger l'image de la carte:", finalUrl, error);
            
            // Logique de récupération: si la `finalUrl` a été construite (différente de l'originale),
            // tente de charger l'image avec l'URL originale au cas où la conversion aurait été incorrecte.
            if (finalUrl !== url) {
                console.log('[MAP_OBS] Tentative de chargement avec l\'URL originale:', url);
                const originalImage = new Image();
                originalImage.crossOrigin = "Anonymous";
                originalImage.src = url;
                originalImage.onload = () => {
                    console.log('[MAP_OBS] Carte chargée avec succès (URL originale):', url);
                    state.map = originalImage;
                    draw();
                };
                originalImage.onerror = () => {
                    console.error("[MAP_OBS] Échec du chargement avec les deux méthodes. Aucune carte ne sera affichée.");
                    state.map = null; // Efface la carte en cas d'échec définitif.
                    draw();
                };
            } else {
                // Si l'URL originale a déjà échoué, efface la carte.
                state.map = null;
                draw();
            }
        }
    }


    /**
     * Charge l'image de portrait d'un token. Utilise un cache pour éviter les rechargements inutiles.
     * Inclut une logique de fallback pour essayer différents répertoires si l'image n'est pas trouvée
     * dans le chemin spécifié (ex: PNJ, Male, Players, Allies).
     *
     * @param {object} token - L'objet token dont le portrait doit être chargé.
     * @returns {Promise<Image>} Une promesse qui résout avec l'objet Image du portrait chargé.
     */
    function loadTokenPortrait(token) {
        // Si l'URL du portrait n'est pas définie ou si l'image est déjà en cache, utilise l'image en cache.
        if (!token.portraitUrl || portraitCache[token.portraitUrl]) {
            token.portraitImg = portraitCache[token.portraitUrl]; // Assigne l'image mise en cache.
            return Promise.resolve(token.portraitImg);             // Résout immédiatement la promesse.
        }

        console.log('[PORTRAIT_OBS] Tentative de chargement du portrait:', token.portraitUrl);
        
        return new Promise((resolve, reject) => {
            // Liste des dossiers alternatifs à essayer si le chargement original échoue.
            const tryFolders = ['PNJ', 'Male', 'Players', 'Allies'];
            
            // Extrait des informations du chemin original du portrait.
            let originalUrl = token.portraitUrl;
            let fileName = originalUrl.split('/').pop(); // Obtient le nom de fichier (ex: "goblin.png").
            let isAbsolute = originalUrl.startsWith('http://') || originalUrl.startsWith('https://'); // Vérifie si l'URL est absolue.
            
            // Détermine l'URL de base du serveur pour construire les chemins relatifs.
            let baseServerUrl = isAbsolute ? '' : SYNC_SERVER_URL;
            
            /**
             * Fonction récursive pour essayer de charger l'image d'un portrait.
             * @param {string} url - L'URL à tenter de charger.
             * @param {Array<string>} remainingFolders - La liste des dossiers restants à essayer en cas d'échec.
             */
            const tryLoadImage = (url, remainingFolders) => {
                console.log('[PORTRAIT_OBS] Tentative de chargement du portrait depuis:', url);
                
                const portraitImg = new Image();
                portraitImg.crossOrigin = 'Anonymous'; // Nécessaire pour les images cross-origin sur canvas.
                portraitImg.src = url;
                
                portraitImg.onload = () => {
                    console.log('[PORTRAIT_OBS] Portrait chargé avec succès:', url);
                    portraitCache[token.portraitUrl] = portraitImg; // Ajoute l'image au cache.
                    token.portraitImg = portraitImg;                   // Assigne l'image au token.
                    resolve(portraitImg);                              // Résout la promesse.
                };
                
                portraitImg.onerror = () => {
                    console.error("[PORTRAIT_OBS] Échec du chargement du portrait:", url);
                    
                    // Si d'autres dossiers alternatifs sont disponibles, les essaie.
                    if (remainingFolders.length > 0) {
                        const nextFolder = remainingFolders.shift(); // Prend le prochain dossier.
                        // Construit un nouveau chemin en remplaçant le dossier actuel par le suivant.
                        let basePath = originalUrl;
                        if (basePath.includes('/portraits/')) {
                            // Extrait la partie de l'URL jusqu'à "portraits/", puis ajoute le nouveau dossier et le nom du fichier.
                            basePath = basePath.substring(0, basePath.indexOf('/portraits/') + '/portraits/'.length);
                            const nextUrl = baseServerUrl + basePath + nextFolder + '/' + fileName;
                            tryLoadImage(nextUrl, remainingFolders); // Tente de charger depuis le nouveau chemin.
                        } else {
                            // Fallback si la structure de l'URL n'est pas standard (ex: juste /portraits/fichier.png).
                            const nextUrl = baseServerUrl + '/portraits/' + nextFolder + '/' + fileName;
                            tryLoadImage(nextUrl, remainingFolders);
                        }
                    } else {
                        // Tous les essais ont échoué.
                        console.error("[PORTRAIT_OBS] Impossible de charger le portrait après tous les essais.");
                        portraitCache[token.portraitUrl] = null; // Marque le portrait comme non chargeable dans le cache.
                        reject(new Error(`Impossible de charger l'image de portrait: ${token.portraitUrl}`)); // Rejette la promesse.
                    }
                };
            };
            
            // Extrait le dossier actuel du chemin original pour éviter de le retenter.
            let currentFolder = '';
            const portraitsIndex = originalUrl.indexOf('/portraits/');
            if (portraitsIndex >= 0) {
                const afterPortraits = originalUrl.substring(portraitsIndex + '/portraits/'.length);
                const folderEndIndex = afterPortraits.indexOf('/');
                if (folderEndIndex >= 0) {
                    currentFolder = afterPortraits.substring(0, folderEndIndex);
                }
            }
            
            // Retire le dossier déjà présent dans l'URL originale de la liste `tryFolders` pour éviter des doublons.
            const folderIndex = tryFolders.indexOf(currentFolder);
            if (folderIndex >= 0) {
                tryFolders.splice(folderIndex, 1);
            }
            
            // Commence le processus de chargement en essayant d'abord l'URL originale.
            let portraitUrl = isAbsolute ? originalUrl : `${SYNC_SERVER_URL}${originalUrl}`;
            tryLoadImage(portraitUrl, tryFolders);
        });
    }


    // =================================================================================
    // Logique de Synchronisation Socket.IO
    // =================================================================================

    // Initialise le client Socket.IO pour se connecter au serveur de synchronisation.
    // Utilise 'websocket' comme transport pour une communication en temps réel.
    const socket = io(SYNC_SERVER_URL, { transports: ['websocket'] });
    let initialStateReceived = false; // Flag pour suivre si l'état initial a déjà été reçu.
    let reconnecting = false;         // Flag pour indiquer si le client est en cours de reconnexion.

    /**
     * Gère l'événement `connect` lorsque le client OBS se connecte au serveur.
     * Demande l'état initial uniquement lors de la première connexion pour éviter
     * de réinitialiser l'état local en cas de reconnexion.
     */
    socket.on('connect', () => {
        console.log('[SYNC_OBS] Connecté au serveur pour la vue OBS.');
        
        if (!initialStateReceived) {
            console.log('[SYNC_OBS] Première connexion, demande d\'état initial.');
            socket.emit('request_initial_state'); // Demande l'état complet (carte et tokens).
        } else {
            console.log('[SYNC_OBS] Reconnexion détectée, utilisation de l\'état existant.');
            reconnecting = true; // Définit le flag de reconnexion.
            socket.emit('request_current_map'); // Demande juste la carte courante pour s'assurer de sa présence.
        }
    });
    
    /**
     * Gère l'événement `disconnect` lorsque le client OBS est déconnecté du serveur.
     */
    socket.on('disconnect', () => {
        console.log('[SYNC_OBS] Déconnecté du serveur, en attente de reconnexion...');
    });

    /**
     * Gère l'événement `initial_state` reçu du serveur.
     * Met à jour la carte et la liste des tokens dans l'état local de l'OBS.
     * @param {object} data - Contient les données `map` et `tokens`.
     */
    socket.on('initial_state', (data) => {
        console.log('[SYNC_OBS] État initial reçu:', data);
        // N'applique l'état initial que si ce n'est pas une reconnexion, pour éviter les réinitialisations.
        if (!reconnecting) {
            loadMap(data.map);          // Charge la carte.
            state.tokens = data.tokens || []; // Met à jour la liste des tokens.
            state.tokens.forEach(loadTokenPortrait); // Charge les portraits pour chaque token.
            draw();                     // Redessine le canvas.
        }
        initialStateReceived = true; // Marque que l'état initial a été reçu.
        reconnecting = false;        // Réinitialise le flag de reconnexion.
    });

    /**
     * Gère l'événement `map_changed` lorsqu'une nouvelle carte est définie par le Maître de Jeu.
     * @param {object} data - Contient l'URL de la nouvelle carte (`map`).
     */
    socket.on('map_changed', (data) => {
        console.log('[SYNC_OBS] Changement de carte reçu:', data.map);
        loadMap(data.map); // Charge la nouvelle carte.
    });

    /**
     * Gère l'événement `token_added` lorsqu'un nouveau token est ajouté.
     * Ajoute le token à l'état local de l'OBS et le dessine.
     * @param {object} tokenData - Les données du token ajouté.
     */
    socket.on('token_added', (tokenData) => {
        console.log('[SYNC_OBS] Token ajouté:', tokenData);
        // Vérifie si le token existe déjà (peut arriver en cas de reconnexion ou de latence).
        const existing = state.tokens.find(t => t.id === tokenData.id);
        if (!existing) {
            state.tokens.push(tokenData);      // Ajoute le token à l'état.
            loadTokenPortrait(tokenData).then(draw).catch(err => {
                console.error("[SYNC_OBS] Erreur lors du chargement du portrait, dessin sans portrait.", err);
                draw(); // Dessine même si le portrait échoue.
            }); // Charge son portrait et redessine.
        }
    });

    /**
     * Gère l'événement `token_moved` lorsqu'un token est déplacé.
     * Met à jour la position du token dans l'état local et redessine.
     * @param {object} tokenData - Les données du token déplacé (ID, x, y).
     */
    socket.on('token_moved', (tokenData) => {
        const token = state.tokens.find(t => t.id === tokenData.id);
        if (token) {
            token.x = tokenData.x; // Met à jour la position X.
            token.y = tokenData.y; // Met à jour la position Y.
            draw();                // Redessine.
        }
    });

    /**
     * Gère l'événement `token_removed` lorsqu'un token est supprimé.
     * Retire le token de l'état local et redessine.
     * @param {object} tokenData - Les données du token supprimé (ID).
     */
    socket.on('token_removed', (tokenData) => {
        console.log('[SYNC_OBS] Token supprimé:', tokenData.id);
        state.tokens = state.tokens.filter(t => t.id !== tokenData.id); // Filtre le token supprimé.
        draw(); // Redessine.
    });

    /**
     * Gère l'événement `all_tokens_cleared` lorsque tous les tokens sont effacés.
     * Vide la liste des tokens dans l'état local et redessine.
     */
    socket.on('all_tokens_cleared', () => {
        console.log('[SYNC_OBS] Tous les tokens ont été effacés.');
        state.tokens = []; // Vide la liste des tokens.
        draw();            // Redessine.
    });

    // =================================================================================
    // Initialisation de l'Application (Exécuté au chargement du DOM)
    // =================================================================================

    // Ajoute un écouteur d'événements pour le redimensionnement de la fenêtre.
    window.addEventListener('resize', resizeCanvas);
    // Appelle resizeCanvas() une fois au démarrage pour définir la taille initiale du canvas.
    resizeCanvas();
});
