# -*- coding: utf-8 -*-
"""
server_sync.py

Ce script implémente le cœur du serveur de synchronisation en temps réel pour l'application Battle Map VTT.
Il utilise Socket.IO pour gérer la communication bidirectionnelle entre le serveur et les clients
(vue Maître de Jeu et vue Observateur). Le serveur est responsable de:

1.  **Gestion de l'état partagé:** Maintenir l'état actuel de la carte de bataille et de tous les tokens placés.
2.  **Synchronisation en temps réel:** Diffuser les mises à jour (mouvements de tokens, changements de carte, ajouts/suppressions)
    à tous les clients connectés.
3.  **Persistance des données:** Sauvegarder l'état de la carte et des tokens sur le disque pour qu'il persiste
    entre les sessions du serveur.
4.  **Service des fichiers:** Gérer l'accès aux fichiers statiques (HTML, CSS, JS) et aux ressources dynamiques
    comme les images de portraits et de cartes, avec une logique pour gérer les chemins Webtracker et locaux.
5.  **Traitement des images:** Extraire et sauvegarder les images de cartes encodées en Base64 envoyées par les clients.
6.  **Ouverture automatique du navigateur:** Pour faciliter le développement et l'utilisation.
"""

import socketio    # Bibliothèque Python pour l'implémentation du serveur Socket.IO.
from aiohttp import web # Cadre web asynchrone utilisé pour construire l'application web et gérer les routes HTTP.
import asyncio     # Module pour l'écriture de code concurrent utilisant la syntaxe async/await.
import os          # Module pour interagir avec le système d'exploitation, notamment pour les chemins de fichiers.
import json        # Module pour l'encodage et le décodage de données JSON (utilisé pour la persistance).
import base64      # Module pour l'encodage et le décodage de données Base64 (utilisé pour les images de carte).
import webbrowser  # Module pour ouvrir des pages web dans un navigateur.
import threading   # Module pour exécuter des fonctions dans des threads séparés (utilisé pour ouvrir le navigateur).
import socket      # Module pour les opérations de socket réseau (utilisé pour obtenir l'adresse IP locale).
import time        # Module pour travailler avec le temps (utilisé pour les timestamps dans les URLs).

def get_local_ip():
    """
    Récupère l'adresse IP locale de la machine sur laquelle le serveur est exécuté.
    Ceci est utile pour construire des URL accessibles depuis d'autres appareils sur le réseau local.
    """
    try:
        # Crée un socket UDP temporaire
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Tente de se connecter à une adresse externe (Google DNS) sans envoyer de données.
        # Cela force le système à choisir l'interface réseau active et son adresse IP.
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0] # Récupère l'adresse IP de l'interface connectée.
        s.close() # Ferme le socket.
        return local_ip
    except Exception:
        # En cas d'erreur (par exemple, pas de connexion internet), retourne l'adresse de bouclage.
        return "127.0.0.1"

# Chemin absolu vers le répertoire du script actuel, pour garantir que les chemins de fichiers sont fiables
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Définition des chemins pour les données persistantes et les images de cartes
DATA_DIR = os.path.join(BASE_DIR, 'data') # Répertoire racine pour toutes les données sauvegardées.
MAP_IMAGES_DIR = os.path.join(DATA_DIR, 'maps') # Sous-répertoire pour les images des cartes.
MAP_SAVE_FILE = os.path.join(DATA_DIR, 'map_state.json') # Fichier JSON pour sauvegarder l'état de la carte.

# Crée les répertoires nécessaires si ils n'existent pas. `exist_ok=True` évite une erreur
# si le répertoire existe déjà.
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MAP_IMAGES_DIR, exist_ok=True)


# Configuration du serveur
HOST = "0.0.0.0"  # Écoute sur toutes les interfaces réseau disponibles, permettant l'accès depuis d'autres machines.
PORT = 9000       # Port sur lequel le serveur Socket.IO et l'application aiohttp écouteront.

# Initialisation du serveur Socket.IO asynchrone
# `cors_allowed_origins='*'` permet aux clients de n'importe quelle origine de se connecter,
# ce qui est important pour le développement et si le frontend est servi depuis un port différent.
sio = socketio.AsyncServer(cors_allowed_origins='*', async_mode='aiohttp') # Spécifie aiohttp comme mode asynchrone.

# Initialisation de l'application web aiohttp
app = web.Application()

# Attache le serveur Socket.IO à l'application web aiohttp.
# Toutes les communications Socket.IO passeront par le chemin '/socket.io'.
sio.attach(app, socketio_path='/socket.io')

def open_browser():
    """
    Ouvre automatiquement une nouvelle fenêtre de navigateur, pointant vers l'URL
    où la vue principale de l'application sera servie par ce serveur.
    """
    webbrowser.open_new(f'http://127.0.0.1:{PORT}')

# Définit une table de routes pour l'application web aiohttp.
routes = web.RouteTableDef()

@routes.get('/')
async def index(request):
    """
    Gère les requêtes GET pour le chemin racine ('/').
    Sert le fichier `index.html`, qui est la vue principale de l'application (pour le Maître de Jeu).
    """
    try:
        # Construit le chemin absolu vers index.html pour s'assurer que le fichier est trouvé.
        with open(os.path.join(BASE_DIR, 'index.html'), encoding='utf-8') as f:
            return web.Response(text=f.read(), content_type='text/html')
    except FileNotFoundError:
        print(f"Erreur: index.html non trouvé à {os.path.join(BASE_DIR, 'index.html')}")
        return web.Response(text="Erreur 404: Page introuvable.", status=404)
    except Exception as e:
        print(f"Erreur lors de l'accès à index.html: {e}")
        return web.Response(text=f"Erreur serveur: {str(e)}", status=500)

@routes.get('/obs')
async def obs_view(request):
    """
    Gère les requêtes GET pour le chemin '/obs'.
    Sert le fichier `obs.html`, qui est la vue observateur de l'application.
    """
    try:
        # Construit le chemin absolu vers obs.html.
        with open(os.path.join(BASE_DIR, 'obs.html'), encoding='utf-8') as f:
            return web.Response(text=f.read(), content_type='text/html')
    except FileNotFoundError:
        print(f"Erreur: obs.html non trouvé à {os.path.join(BASE_DIR, 'obs.html')}")
        return web.Response(text="Erreur 404: Page observateur introuvable.", status=404)
    except Exception as e:
        print(f"Erreur lors de l'accès à obs.html: {e}")
        return web.Response(text=f"Erreur serveur: {str(e)}", status=500)

# Ajoute toutes les routes définies dans `routes` à l'application web aiohttp.
app.add_routes(routes)

# Servir les images de portraits et cartes depuis différents emplacements possibles
# Cette section gère la flexibilité de l'emplacement des ressources statiques,
# notamment pour les portraits, qui peuvent provenir d'un Webtracker externe ou d'un dossier local.

# 1. Tenter de localiser le chemin traditionnel du Webtracker
# `PROJECT_ROOT` remonte d'un niveau par rapport au `BASE_DIR` (qui est 'battle_Map').
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, os.pardir))
webtracker_static_path = os.path.join(PROJECT_ROOT, 'Webtracker', 'app', 'static')

# 2. Définir un dossier local pour les portraits comme option de secours
LOCAL_PORTRAITS_DIR = os.path.join(DATA_DIR, 'portraits')
os.makedirs(LOCAL_PORTRAITS_DIR, exist_ok=True) # S'assurer que le dossier local existe.

# Créer des sous-dossiers courants pour organiser les portraits locaux.
os.makedirs(os.path.join(LOCAL_PORTRAITS_DIR, 'PNJ'), exist_ok=True)
os.makedirs(os.path.join(LOCAL_PORTRAITS_DIR, 'Allies'), exist_ok=True)
os.makedirs(os.path.join(LOCAL_PORTRAITS_DIR, 'Players'), exist_ok=True)

# Vérifier si le chemin des portraits du Webtracker existe et contient des portraits.
# Si oui, utiliser le chemin du Webtracker, sinon utiliser le dossier local.
if os.path.exists(os.path.join(webtracker_static_path, 'portraits')):
    portraits_path = os.path.join(webtracker_static_path, 'portraits')
    print(f"Utilisation des portraits depuis Webtracker: {portraits_path}")
else:
    portraits_path = LOCAL_PORTRAITS_DIR
    print(f"Utilisation des portraits locaux: {portraits_path}")

# Configuration des routes statiques pour servir les différents types de fichiers.
# `add_static` crée une route pour servir des fichiers depuis un répertoire donné.
app.router.add_static('/portraits/', path=portraits_path, name='portraits') # Pour les images de portraits.
app.router.add_static('/maps/', path=MAP_IMAGES_DIR, name='maps')           # Pour les images de cartes de bataille.
app.router.add_static('/data/', path=DATA_DIR, name='data')                 # Accès au dossier de données (pour saved_map.json, saved_tokens.json).

# Servir les fichiers statiques spécifiques à la battlemap (JS, CSS) avec des chemins absolus.
app.router.add_static('/js/',
                     path=os.path.join(BASE_DIR, 'js'),
                     name='js')
app.router.add_static('/css/',
                     path=os.path.join(BASE_DIR, 'css'),
                     name='css')

# Fichiers de sauvegarde pour la persistance des données entre les redémarrages du serveur.
MAP_SAVE_FILE = os.path.join(DATA_DIR, 'saved_map.json')       # Fichier pour sauvegarder l'état de la carte.
TOKENS_SAVE_FILE = os.path.join(DATA_DIR, 'saved_tokens.json') # Fichier pour sauvegarder l'état de tous les tokens.

# État partagé de la battlemap. Ce dictionnaire contient l'état actuel de la carte
# et de tous les tokens actifs. Il est synchronisé en temps réel avec les clients.
shared_state = {
    'tokens': [],  # Liste de dictionnaires, chaque dictionnaire représentant un token avec ses propriétés (id, x, y, portrait, etc.).
    'map': None    # L'URL ou le chemin de la carte actuellement affichée.
}

def extract_and_save_map_image(map_data_url):
    """
    Extrait une image encodée en Base64 d'une URL de données et la sauvegarde sur le disque.
    Cela permet de persister les images de cartes qui sont uploadées par le client.

    Args:
        map_data_url (str): L'URL de données (data:image/...) contenant l'image Base64.

    Returns:
        str: Le chemin relatif vers l'image sauvegardée si succès, None sinon.
    """
    try:
        # Vérifie si l'URL de données est valide.
        if not map_data_url or not map_data_url.startswith('data:image/'):
            print("URL de données invalide pour l'extraction de l'image.")
            return None

        # Sépare l'en-tête (mime type) et les données encodées.
        header, encoded = map_data_url.split(',', 1)
        mime_type = header.split(';')[0].split(':')[1] # Ex: image/jpeg
        extension = mime_type.split('/')[1]            # Ex: jpeg
        
        # Définit le nom de fichier pour la nouvelle carte avec la bonne extension.
        new_map_filename = f"current_map.{extension}"
        new_map_path = os.path.join(MAP_IMAGES_DIR, new_map_filename)

        # Nettoie les anciennes images de carte pour éviter l'accumulation
        # (supprime tout fichier commençant par 'current_map.' dans le répertoire).
        for old_file in os.listdir(MAP_IMAGES_DIR):
            if old_file.startswith('current_map.'):
                try:
                    os.remove(os.path.join(MAP_IMAGES_DIR, old_file))
                except OSError as e:
                    print(f"Erreur lors de la suppression de l'ancienne carte {old_file}: {e}")

        # Décode les données Base64 en binaire.
        binary_data = base64.b64decode(encoded)
        
        # Sauvegarde les données binaires dans le nouveau fichier.
        with open(new_map_path, 'wb') as f:
            f.write(binary_data)
            
        # Retourne le chemin relatif qui pourra être utilisé par le frontend.
        relative_url = f"/maps/{new_map_filename}" # Modifié pour correspondre à la route statique /maps/
        print(f"Image de carte sauvegardée: {relative_url}")
        return relative_url
    except Exception as e:
        print(f"Erreur lors de l'extraction et sauvegarde de l'image: {e}")
        return None

def save_map(map_data):
    """
    Sauvegarde l'état actuel de la carte dans un fichier JSON pour persistance.
    Si `map_data` est une URL de données (Base64), l'image est d'abord extraite et sauvegardée.

    Args:
        map_data (str): L'URL de la carte (peut être une URL de fichier ou une URL de données Base64).

    Returns:
        bool: True si la sauvegarde est réussie, False sinon.
    """
    try:
        if not map_data:
            print("Aucune donnée de carte à sauvegarder.")
            return False
        
        map_url_to_save = map_data
        # Si la carte est envoyée sous forme d'URL de données Base64, l'extraire et la sauvegarder.
        if map_data.startswith('data:image/'):
            extracted_url = extract_and_save_map_image(map_data)
            if extracted_url:
                map_url_to_save = extracted_url
            else:
                print("L'extraction de l'image de carte a échoué, impossible de sauvegarder la carte.")
                return False
            
        # Sauvegarde l'URL finale de la carte dans le fichier JSON.
        with open(MAP_SAVE_FILE, 'w', encoding='utf-8') as f:
            json.dump({'map': map_url_to_save}, f, indent=4)
        print(f"Carte '{map_url_to_save}' sauvegardée avec succès dans {MAP_SAVE_FILE}.")
        return True
    except Exception as e:
        print(f"Erreur lors de la sauvegarde de la carte: {e}")
        return False

def load_saved_map():
    """
    Charge la dernière carte sauvegardée depuis le fichier JSON.

    Returns:
        str: L'URL de la carte sauvegardée si trouvée, None sinon.
    """
    try:
        if os.path.exists(MAP_SAVE_FILE):
            with open(MAP_SAVE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                map_data = data.get('map')
                if map_data:
                    print(f"Carte '{map_data}' chargée depuis la sauvegarde.")
                    return map_data
    except json.JSONDecodeError:
        print(f"Erreur de décodage JSON lors du chargement de {MAP_SAVE_FILE}. Le fichier est peut-être corrompu ou vide.")
    except Exception as e:
        print(f"Erreur lors du chargement de la carte: {e}")
    
    print("Aucune carte sauvegardée trouvée ou chargement échoué.")
    return None

def find_token(token_id):
    """
    Recherche un token spécifique dans l'état partagé par son ID.

    Args:
        token_id (str): L'identifiant unique du token à trouver.

    Returns:
        dict: Le dictionnaire représentant le token si trouvé, None sinon.
    """
    for t in shared_state['tokens']:
        if t.get('id') == token_id:
            return t
    return None

def save_tokens():
    """
    Sauvegarde l'état actuel de tous les tokens dans un fichier JSON pour persistance.
    """
    try:
        with open(TOKENS_SAVE_FILE, 'w', encoding='utf-8') as f:
            json.dump({'tokens': shared_state['tokens']}, f, indent=4)
        print(f"[INFO] {len(shared_state['tokens'])} tokens sauvegardés avec succès dans {TOKENS_SAVE_FILE}.")
        return True
    except Exception as e:
        print(f"[ERREUR] Erreur lors de la sauvegarde des tokens: {e}")
        return False

def load_saved_tokens():
    """
    Charge les tokens sauvegardés depuis le fichier JSON.

    Returns:
        list: Une liste de dictionnaires représentant les tokens sauvegardés, ou une liste vide si aucun n'est trouvé ou en cas d'erreur.
    """
    try:
        if os.path.exists(TOKENS_SAVE_FILE):
            with open(TOKENS_SAVE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                tokens = data.get('tokens', [])
                print(f"[INFO] {len(tokens)} tokens chargés depuis la sauvegarde.")
                return tokens
    except json.JSONDecodeError:
        print(f"Erreur de décodage JSON lors du chargement de {TOKENS_SAVE_FILE}. Le fichier est peut-être corrompu ou vide.")
    except Exception as e:
        print(f"[ERREUR] Erreur lors du chargement des tokens: {e}")
    
    print("[INFO] Aucun token sauvegardé trouvé, initialisation avec liste vide.")
    return []

# Au démarrage du serveur, charger la carte et les tokens sauvegardés
# Ces lignes initialisent l'état partagé du serveur avec les données persistantes.
shared_state['map'] = load_saved_map()
shared_state['tokens'] = load_saved_tokens()


# --- Gestionnaire d'événements Socket.IO ---
# Ces fonctions gèrent les événements reçus des clients Socket.IO et les réponses du serveur.

@sio.event
async def connect(sid, environ):
    """
    Gère l'événement de connexion d'un nouveau client Socket.IO.
    Chaque client reçoit un Session ID (sid) unique.
    """
    print(f"[CONNEXION] Client connecté: {sid}")

@sio.event
async def request_initial_state(sid):
    """
    Gère l'événement `request_initial_state` où un client demande l'état initial
    de la battlemap (carte et tokens). Cet événement est généralement émis juste après la connexion.
    """
    print(f"[INFO] Envoi de l'état initial au client {sid}")
    
    # Assurer que tous les tokens ont des IDs valides avant de les envoyer.
    # Ceci est une mesure de robustesse pour les tokens qui auraient pu être ajoutés
    # sans ID via un autre mécanisme ou lors de l'auto-récupération.
    for token in shared_state['tokens']:
        if not token.get('id'):
            # Génère un ID unique simple si manquant.
            token['id'] = f"server-token-{len(shared_state['tokens'])}-{hash(str(token))}"
            print(f"[WARN] ID manquant assigné au token: {token['id']}")
    
    # Prépare l'état de la carte à envoyer. Ajoute un timestamp pour forcer le rechargement
    # de l'image côté client si l'URL est la même mais le contenu a changé.
    map_url_for_client = shared_state['map']
    if map_url_for_client:
        map_url_for_client = f"{map_url_for_client}?t={int(time.time())}"

    # Construit le dictionnaire d'état à envoyer.
    state_to_send = {
        'tokens': shared_state['tokens'],
        'map': map_url_for_client
    }
    
    print(f"[DEBUG] État initial envoyé à {sid}: {len(shared_state['tokens'])} tokens, map: {map_url_for_client}")
    
    # Émet l'événement `initial_state` uniquement au client demandeur (`to=sid`).
    await sio.emit('initial_state', state_to_send, to=sid)

@sio.event
async def move_token(sid, data):
    """
    Gère l'événement `move_token` lorsqu'un client déplace un token sur sa carte.
    Met à jour l'état du token sur le serveur et diffuse le mouvement aux autres clients.

    Args:
        sid (str): Le Session ID du client qui a initié le mouvement.
        data (dict): Contient l'ID du token et ses nouvelles coordonnées (x, y).
    """
    token_id = data.get('id')
    print(f"[ACTION] Mouvement de token reçu de {sid}: ID={token_id}, x={data.get('x')}, y={data.get('y')}")
    token = find_token(token_id)
    
    if token:
        # Si le token existe dans l'état partagé, met à jour ses coordonnées.
        token['x'] = data.get('x')
        token['y'] = data.get('y')
        print(f"[DEBUG] Token {token_id} mis à jour. Diffusion aux autres clients.")
        # Émet l'événement `token_moved` à tous les clients, sauf celui qui a initié l'action (`skip_sid=sid`).
        await sio.emit('token_moved', data, skip_sid=sid)
        
        # Sauvegarde l'état des tokens après chaque modification pour assurer la persistance.
        save_tokens()
    else:
        # Auto-récupération: Si le token n'est pas trouvé dans l'état partagé (par ex. si le serveur a redémarré
        # et qu'un client essaie de déplacer un token non encore synchronisé), l'ajoute.
        print(f"[WARN] Auto-récupération: Token {token_id} non trouvé dans l'état partagé. Ajout en cours.")
        new_token = {
            'id': token_id,
            'x': data.get('x'),
            'y': data.get('y'),
            'size': data.get('size', 50),       # Taille par défaut si non spécifiée.
            'color': data.get('color', 'blue'), # Couleur par défaut.
            'name': data.get('name', 'Token'),  # Nom par défaut.
            'portraitUrl': data.get('portraitUrl') # URL du portrait.
        }
        shared_state['tokens'].append(new_token) # Ajoute le nouveau token à l'état partagé.
        
        # Informe tous les clients du nouvel ajout de token.
        await sio.emit('token_added', new_token)
        
        # Diffuse ensuite le mouvement pour synchroniser les positions.
        await sio.emit('token_moved', data, skip_sid=sid)
        save_tokens() # Sauvegarde l'état des tokens après l'ajout.

@sio.event
async def add_token(sid, data):
    """
    Gère l'événement `add_token` lorsqu'un client ajoute un nouveau token.
    Ajoute le token à l'état partagé et diffuse l'information aux autres clients.

    Args:
        sid (str): Le Session ID du client qui a ajouté le token.
        data (dict): Les propriétés du nouveau token.
    """
    if not data or not data.get('id'):
        print(f"[ERREUR] Données de token invalides reçues pour ajout: {data}")
        return
        
    token_id = data.get('id')
    existing_token = find_token(token_id)
    
    if existing_token:
        print(f"[INFO] Token {token_id} existe déjà. Mise à jour de ses propriétés.")
        # Si le token existe déjà (peut arriver si un client se reconnecte ou resynchronise),
        # met à jour ses propriétés plutôt que de l'ajouter en double.
        for key, value in data.items():
            existing_token[key] = value
        # Émet l'événement de mise à jour aux autres clients.
        await sio.emit('token_updated', data, skip_sid=sid)
    else:
        print(f"[ACTION] Ajout d'un nouveau token ({token_id}) par {sid}.")
        shared_state['tokens'].append(data) # Ajoute le nouveau token à l'état partagé.
        # Notifie les autres clients de l'ajout.
        await sio.emit('token_added', data, skip_sid=sid)
        
        # Sauvegarde l'état des tokens après l'ajout.
        save_tokens()

@sio.event
async def remove_token(sid, data):
    """
    Gère l'événement `remove_token` lorsqu'un client supprime un token.
    Retire le token de l'état partagé et diffuse l'information aux autres clients.

    Args:
        sid (str): Le Session ID du client qui a supprimé le token.
        data (dict): Contient l'ID du token à supprimer.
    """
    token_id = data.get('id')
    print(f"[ACTION] Demande de suppression du token {token_id} reçue de {sid}.")
    initial_len = len(shared_state['tokens'])
    # Crée une nouvelle liste de tokens excluant celui à supprimer.
    shared_state['tokens'] = [t for t in shared_state['tokens'] if t.get('id') != token_id]
    
    if len(shared_state['tokens']) < initial_len:
        print(f"[INFO] Token {token_id} supprimé. Diffusion aux autres clients.")
        # Si la longueur a changé, le token a été supprimé avec succès.
        await sio.emit('token_removed', data, skip_sid=sid)
        save_tokens() # Sauvegarde l'état des tokens après la suppression.
    else:
        print(f"[WARN] Le token {token_id} n'a pas été trouvé dans l'état partagé pour la suppression.")


# Changement de carte
@sio.event
async def change_map(sid, data):
    """
    Gère l'événement `change_map` lorsqu'un client demande de changer la carte.
    Cela inclut le traitement des URLs de données Base64 pour les images de carte,
    la sauvegarde de la carte et la diffusion du changement à tous les clients.

    Args:
        sid (str): Le Session ID du client qui a initié le changement de carte.
        data (dict): Contient l'URL de la nouvelle carte (`map`).
    """
    map_data = data.get('map')
    print(f"[ACTION] Demande de changement de carte reçue de {sid}.")
    
    # Vérifie si l'URL de la carte est une URL de données Base64 (image embarquée).
    if map_data and map_data.startswith('data:image/'):
        print(f"[DEBUG] Traitement d'une URL de données (image Base64) pour la carte.")
        extracted_url = extract_and_save_map_image(map_data) # Extrait et sauvegarde l'image.
        if extracted_url:
            shared_state['map'] = extracted_url # Met à jour l'état partagé avec le chemin relatif de l'image.
            save_map(extracted_url) # Sauvegarde le nouvel état de la carte.
            
            # Construit une URL complète (absolue) pour que la carte soit accessible
            # depuis tous les appareils connectés sur le même réseau.
            server_ip = get_local_ip()
            # Ajoute un timestamp pour s'assurer que les navigateurs rechargent l'image et n'utilisent pas une version en cache.
            full_url = f"http://{server_ip}:{PORT}{extracted_url}?t={int(time.time())}"
            
            print(f"[INFO] Image de carte Base64 traitée et diffusée: {full_url}")
            # Émet l'événement `map_changed` à tous les clients avec la nouvelle URL absolue de la carte.
            await sio.emit('map_changed', {'map': full_url})
            return
        else:
            print("[ERREUR] L'extraction de l'image Base64 a échoué. La carte ne sera pas changée.")
            return
    
    # Si ce n'est pas une URL de données Base64 (c'est une URL directe d'image ou un chemin relatif).
    print(f"[DEBUG] Changement de carte via URL directe ou chemin relatif: {map_data}.")
    shared_state['map'] = map_data # Met à jour l'état partagé.
    save_map(map_data) # Sauvegarde le nouvel état de la carte.
    
    # Construit l'URL à diffuser, en ajoutant un timestamp pour éviter les problèmes de cache.
    map_url_for_client = f"{map_data}?t={int(time.time())}"
    # Émet l'événement `map_changed` à tous les clients.
    await sio.emit('map_changed', {'map': map_url_for_client})
    print(f"[INFO] Carte changée et sauvegardée, signalée à tous les clients.")

@sio.event
async def request_current_map(sid):
    """
    Gère l'événement `request_current_map` où un client demande la carte actuellement chargée.
    Envoie l'URL de la carte au client demandeur.
    """
    map_url = shared_state.get('map')
    print(f"[DEBUG] Demande de carte courante reçue de {sid}. Carte actuelle: {map_url}")
    
    if map_url:
        # Si la carte est un chemin relatif, le transforme en URL absolue pour l'accès externe.
        if not (map_url.startswith('http://') or map_url.startswith('https://')):
            server_ip = get_local_ip()
            full_url = f"http://{server_ip}:{PORT}{map_url}?t={int(time.time())}"
            print(f"[DEBUG] Envoi de l'URL absolue de la carte ({full_url}) au client {sid}.")
            await sio.emit('map_changed', {'map': full_url}, to=sid) # Émet seulement au client demandeur.
        else:
            print(f"[DEBUG] Envoi de l'URL de la carte (déjà absolue: {map_url}) au client {sid}.")
            await sio.emit('map_changed', {'map': f"{map_url}?t={int(time.time())}"}, to=sid) # Émet seulement au client demandeur.
    else:
        print(f"[DEBUG] Pas de carte disponible actuellement. Notification au client {sid}.")
        # Informe le client qu'aucune carte n'est disponible.
        await sio.emit('no_map_available', {}, to=sid)

@sio.event
async def clear_all_tokens(sid):
    """
    Gère l'événement `clear_all_tokens` lorsqu'un client demande d'effacer tous les tokens.
    Vide la liste des tokens dans l'état partagé et diffuse l'information aux autres clients.
    """
    print(f"[ACTION] Demande d'effacer tous les tokens reçue de {sid}.")
    shared_state['tokens'] = [] # Vide la liste des tokens.
    save_tokens() # Sauvegarde l'état vide des tokens.
    # Émet l'événement à tous les clients, sauf celui qui a initié l'action.
    await sio.emit('all_tokens_cleared', {}, skip_sid=sid)
    print("[INFO] Tous les tokens ont été effacés et sauvegardés.")

if __name__ == '__main__':
    # Démarrer le navigateur web après un court délai pour laisser le serveur aiohttp s'initialiser.
    threading.Timer(1.5, open_browser).start()
    
    print("\n==================================================================")
    print(f"Serveur Battle Map VTT démarré sur http://{HOST}:{PORT}")
    print("Accès local (Maître de Jeu):   http://localhost:9000")
    print("Accès local (Observateur OBS): http://localhost:9000/obs")
    print("\nPour accéder depuis d'autres appareils (tablettes/mobiles) sur le même réseau:")
    print(f"  Utilisez l'adresse IP de cette machine: http://{get_local_ip()}:{PORT}")
    print("  (Remplacez [VOTRE-IP] par l'adresse IP affichée ci-dessus si elle est différente de localhost)")
    print("==================================================================")
    
    # Lance l'application aiohttp. Cela démarre le serveur web et le serveur Socket.IO attaché.
    # `host='0.0.0.0'` permet au serveur d'être accessible depuis l'extérieur.
    # `port=9000` définit le port d'écoute.
    web.run_app(app, host=HOST, port=PORT)

