# Guide Configuration - DRONE OPS

## 1. Connexion WiFi

### Le Beelink crée automatiquement un réseau WiFi (télécommande)

**Dès le démarrage**, le Beelink expose un point d'accès WiFi **réservé à la
télécommande** (publication du flux). Il passe en **5GHz** si la carte le
supporte, sinon en 2.4GHz:

| Paramètre | Valeur |
|-----------|--------|
| **SSID** | `corelink-001-drone` |
| **Mot de passe** | `9fK7qP2xL8vT4wR!3kD8mN5` |
| **IP du serveur** | `10.0.0.1` |

### Le routeur 4G expose le réseau WiFi « écrans »

Le routeur 4G Cudy IR02 (raccordé en Ethernet au Beelink) expose un second
réseau, **à utiliser pour les écrans et tablettes** qui affichent le flux ou
récupèrent les vidéos:

| Paramètre | Valeur |
|-----------|--------|
| **SSID** | `corelink-001-screen` |
| **Mot de passe** | `4vR9!mQ2xK8sT7wP5nZ3` |
| **IP du serveur** | `192.168.10.10` |
| **Internet** | Oui, via la 4G |

> Détails de raccordement et configuration du routeur: voir `GUIDE_ROUTER.md`.

### Connexion depuis un appareil

**Smartphone/Tablette/PC**:
1. Ouvrir les paramètres WiFi
2. Chercher le réseau `corelink-001-drone`
3. Se connecter avec le mot de passe: `9fK7qP2xL8vT4wR!3kD8mN5`
4. L'appareil obtient automatiquement une IP (10.0.0.x)

**Vérification**:
```bash
ping 10.0.0.1
```

---

## 2. Configuration RTMP sur la télécommande DJI

### DJI Mavic 2 Enterprise / Matrice 4TD / M30T

#### Étape 1: Connexion WiFi
1. Allumer la télécommande DJI
2. Dans les paramètres WiFi, chercher `corelink-001-drone`
3. Se connecter avec le mot de passe: `9fK7qP2xL8vT4wR!3kD8mN5`

#### Étape 2: Configuration RTMP

**Dans l'application DJI Pilot 2**:

1. Ouvrir les **paramètres** (⚙️)
2. Aller dans **"Live Streaming"** ou **"RTMP"**
3. Configurer:

```
┌─────────────────────────────┐
│    RTMP Settings            │
├─────────────────────────────┤
│ Server IP: 10.0.0.1        │
│ Port: 1935                 │
│ Stream Key: drone          │
│                             │
│ ☑ Enable RTMP              │
└─────────────────────────────┘
```

**Paramètres exacts**:
- **Serveur**: `10.0.0.1` (IP du Beelink)
- **Port**: `1935`
- **Stream Key**: `drone` (FIXE - ne pas modifier)

**URL complète**: `rtmp://10.0.0.1:1935/live/drone`

#### Étape 3: Test

1. Activer le stream RTMP
2. Vérifier sur l'écran du Beelink que le flux apparaît
3. Le flux s'enregistre automatiquement

---

## 3. Workflow Opérationnel

### Séquence complète

```
┌─────────────────────────────────────┐
│ 1. ALLUMAGE                         │
│    - Brancher batterie              │
│    - Kill Switch ON                 │
│    - Animation droneOps au boot     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. SÉLECTION PILOTE                 │
│    - Écran tactile actif            │
│    - Touchez votre nom             │
│    - Confirmez                     │
│    (WiFi AP déjà disponible)        │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. TÉLÉCOMMANDE                     │
│    - WiFi: corelink-001-drone            │
│    - RTMP: clé "drone"             │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4. VOL                              │
│    - Flux live sur écran            │
│    - Enregistrement auto            │
│    - Vidéos: /var/lib/drone/videos/ │
└─────────────────────────────────────┘
```

---

## 4. Écran de démarrage

### Splash Screen Plymouth

Au démarrage du système, vous verrez:
- **droneOps** branding avec animation
- Indicateur de chargement circulaire
- Remplacement du logo Ubuntu standard

Pour réinstaller le thème Plymouth:
```bash
sudo bash /opt/drone/plymouth/install-plymouth-theme.sh
```

---

## 5. Accès aux vidéos

### Depuis un appareil connecté au WiFi

**Interface web**:
```
http://10.0.0.1:8080
```

**Liste des vidéos**:
```
http://10.0.0.1:8080/videos
```

### Téléchargement

Les vidéos sont au format `.flv` et peuvent être:
- Visionnées directement dans le navigateur
- Téléchargées pour archivage
- Converties avec FFmpeg si nécessaire

---

## 6. Vérification du système

### LEDs et status

| Service | Port | Status |
|---------|------|--------|
| **WiFi AP** | - | Dès le boot |
| **RTMP** | 1935 | Actif si télécommande connectée |
| **Web UI** | 8080 | http://10.0.0.1:8080 |
| **HLS** | 8888 | http://10.0.0.1:8888 |

### Test de connexion

```bash
# Test WiFi
ping 10.0.0.1

# Test RTMP
ffprobe rtmp://10.0.0.1:1935/live/drone

# Test API
curl http://10.0.0.1:8080/health
```

### Health Check complet

```bash
sudo /opt/drone/scripts/healthcheck.sh
```

---

## 7. Dépannage

### Pas de flux vidéo

1. **Vérifier WiFi**: Télécommande connectée à `corelink-001-drone`?
2. **Vérifier RTMP**: Paramètres corrects dans DJI Pilot?
3. **Vérifier service**: `ssh drone@10.0.0.1` → `sudo systemctl status mediamtx`

### WiFi non détecté

- Le Beelink est-il allumé? (LED power)
- Redémarrer le Beelink
- Vérifier: `ssh drone@10.0.0.1` → `sudo systemctl status drone-wifi-ap`
- Forcer le redémarrage WiFi: `sudo systemctl restart drone-wifi-ap`

### Vidéos vides ou corrompues

- Vérifier l'espace disque: `df -h /var/lib/drone/videos`
- Vérifier les logs: `sudo journalctl -u drone-api -f`

### Écran de sélection pilote

- **Problème**: L'écran revient sur le pilote précédent
- **Solution**: Le système demande toujours la sélection au démarrage
- Si le problème persiste: `sudo systemctl restart drone-api drone-ui`

---

## 8. Arrêt du système

1. Appuyer sur le **Kill Switch** (OFF)
2. Le système s'éteint proprement
3. Attendre 30s avant de débrancher

**⚠️ IMPORTANT**: Ne pas débrancher brutalement - risque de corruption des vidéos.

---

## 9. Commandes utiles

### Services systemd

```bash
# Status des services
sudo systemctl status drone-wifi-ap
sudo systemctl status drone-api
sudo systemctl status drone-ui
sudo systemctl status mediamtx

# Redémarrer les services
sudo systemctl restart drone-wifi-ap
sudo systemctl restart drone-api
sudo systemctl restart drone-ui
sudo systemctl restart mediamtx

# Logs en temps réel
sudo journalctl -u drone-api -f
sudo journalctl -u drone-wifi-ap -f
```

### Configuration

```bash
# Modifier les pilotes
sudo nano /etc/drone/users.json

# Recharger la config (redémarrer le service)
sudo systemctl restart drone-api
```

---

## 10. Architecture des services

```
┌─────────────────────────────────────────┐
│            SERVICES SYSTEMD             │
├─────────────────────────────────────────┤
│  drone-wifi-ap  → Point d'accès WiFi   │
│  mediamtx       → Serveur RTMP         │
│  drone-api      → API Node.js          │
│  drone-ui       → Kiosk Firefox        │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│            DÉMARRAGE                  │
├─────────────────────────────────────────┤
│  1. Plymouth (animation boot)         │
│  2. drone-wifi-ap (WiFi disponible)   │
│  3. mediamtx + drone-api (serveurs)   │
│  4. drone-ui (écran tactile)            │
└─────────────────────────────────────────┘
```

**Ordre de démarrage**: WiFi → MediaMTX → API → UI (tous en parallèle après dépendances)
