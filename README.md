# DRONE OPS SUITE

> Système de retransmission vidéo pour opérations drone sur le terrain

[![License](https://img.shields.io/badge/license-Internal-red.svg)](LICENSE)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-26.04%20LTS-orange.svg)](https://ubuntu.com)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-green.svg)](https://nodejs.org)

## Concept

Solution de retransmission vidéo pour opérations drone sur le terrain. Le système permet aux pompiers de visualiser le flux RTMP du drone sur un grand écran, d'historiser les enregistrements, et de partager le flux avec des terminaux externes.

## Architecture Matérielle

```
┌─────────────────────────────────────────────────────────────┐
│                       VALISE TERRAIN                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │ SmallRig     │      │   Beelink    │                    │
│  │ VB99 Mini    │──────│   S12 Mini   │──────┐             │
│  │ (Batterie)   │ USB  │  (Ubuntu)    │ HDMI │             │
│  └──────────────┘      └──────┬───────┘      │             │
│         │                     │              │             │
│         │                     │       ┌──────▼────────┐    │
│         │              WiFi   │       │  Écran HDMI   │    │
│         │           corelink  │       │  (Tactile)    │    │
│         │            -001 AP  │       └───────────────┘    │
│         │                     │ Ethernet                   │
│         │              ┌──────▼───────┐                    │
│         │              │  Cudy IR02   │                    │
│         │              │ (Routeur 4G) │─── SIM 4G ──► Net  │
│         │              └──────┬───────┘                    │
│         │                     │ WiFi corelink-screen       │
└─────────────────────────────┼────────────────────────────┘
                              │
                  ┌───────────┼──────────────┐
                  ▼           ▼              ▼
          ┌───────────┐ ┌──────────┐  ┌──────────────┐
          │ Télécommande│ │ Écrans / │  │ Mac (admin   │
          │ DJI RC Plus │ │ tablettes│  │ SSH)         │
          │ (RTMP)      │ │ (flux)   │  │              │
          └───────────┘ └──────────┘  └──────────────┘
```

**Rôles des réseaux:**
- WiFi `corelink-001` (AP du Beelink, 5GHz si supporté) : **télécommande
  uniquement** — publie le flux RTMP vers le serveur.
- WiFi `corelink-screen` (routeur 4G Cudy IR02) : **écrans et tablettes** —
  consultation du flux, récupération des vidéos, SSH admin, Internet 4G.
- Ethernet Beelink ↔ Cudy : alimente la retransmission RTMP 4G et l'accès admin.

## Flux de Données

```
      Drone (RTMP)
          │
          ▼
    ┌─────────────────────────────────────┐
    │        Télécommande DJI Pilot 2      │
    │  (Configuration RTMP: rtmp://IP/live)│
    └─────────────────────────────────────┘
          │
          ▼
    ┌─────────────────────────────────────┐
    │          Beelink S12 Mini           │
    │  ┌─────────────────────────────┐    │
    │  │   MediaMTX (RTMP Server)    │────┼──► Écran principal (HDMI)
    │  └─────────────────────────────┘    │      (Flux live + UI)
    │  ┌─────────────────────────────┐    │
    │  │   FFmpeg (Recording)        │────┼──► Stockage local (/videos)
    │  └─────────────────────────────┘    │      (Auto-suppression +7j)
    │  ┌─────────────────────────────┐    │
    │  │   Node.js API              │────┼──► Utilisateurs WiFi
    │  │   - Historique vidéos      │    │      (Téléchargement)
    │  │   - Retransmission externe │    │
    │  │   - Monitoring batterie    │    │
    │  └─────────────────────────────┘    │
    └─────────────────────────────────────┘
```

## Fonctionnalités

### Principales

| Fonction | Description |
|----------|-------------|
| **Flux Live** | Affichage temps réel du flux RTMP du drone sur écran HDMI |
| **Enregistrement** | Capture automatique des vidéos en local |
| **Historique** | Conservation des 7 derniers jours de vol |
| **Retransmission 4G** | Push du flux vers un serveur RTMP externe via le routeur 4G (URL choisie dans les Réglages) |
| **Interface tactile** | Sélection utilisateur + monitoring batterie |

### Utilisateurs

**New Workflow**: Several pilots can use the same drone/remote.

1. **Télécommande DJI**: Config with **single stream key** `drone` (fixed, stored in the remote)
2. **Beelink startup**: User selects their identity on the screen (Capitaine Martin, Lt Dupont, etc.)
3. **Videos**: Automatically recorded with pilot name + timestamp

Configuration in `/etc/drone/users.json`:

```json
[
  {
    "id": 1,
    "name": "Capitaine Martin",
    "unit": "CIS Paris 15"
  },
  {
    "id": 2,
    "name": "Lieutenant Dupont",
    "unit": "GRIMP"
  }
]
```

**Stream Key**: `drone` (fixed for all operations)

### Stocks vidéo

Les vidéos sont stockées dans `/var/lib/drone/videos/` avec la structure:

```
/var/lib/drone/videos/
├── 2024-08-22/
│   ├── 2024-08-22_14h30.flv
│   ├── 2024-08-22_16h45.flv
│   └── 2024-08-22_17h10.flv
└── 2024-08-23/
    └── 2024-08-23_09h00.flv
```

**Rotation automatique**: Suppression des vidéos de plus de 7 jours (cron quotidien).

### Accès Externe (Camions PC / écrans)

Les écrans et camions PC se connectent au WiFi du **routeur 4G** et accèdent au flux sans configuration préalable:

1. Se connecter au WiFi `corelink-screen` (mot de passe: `4vR9!mQ2xK8sT7wP5nZ3`)
2. Ouvrir un navigateur
3. Aller à `http://192.168.10.10:8080`

Le flux est automatiquement disponible pour tous les appareils connectés au WiFi du routeur (voir `GUIDE_ROUTER.md`).

### Configuration des IPs (Optionnel)

Si retransmission vers un serveur externe nécessaire, activer « Serveur externe »
dans les **Réglages** de l'app et saisir le lien RTMP distant. Le flux est alors
retransmis automatiquement via la 4G dès qu'un drone publie.

## Démarrage Opérationnel

### Séquence de mise en route

```
1. Brancher batterie SmallRig VB99 (si pas déjà fait)
2. Activer le Kill Switch (ON)             ← Allume Beelink + Écran par USB-C
3. Attendre le boot automatique (~30s)     ← Splash screen droneOps
4. Sélectionner le pilote sur l'écran tactile
5. La télécommande se connecte automatiquement au WiFi "corelink-001"
6. Le flux RTMP démarre automatiquement     ← Clé "drone" pré-configurée
7. Démarrer le vol                          ← Le flux s'affiche automatiquement
   (et est retransmis en 4G si "Serveur externe" est activé)
```

### Configuration Télécommande DJI Mavic 2 Enterprise

**Paramètres RTMP:**
- **Server IP**: `10.0.0.1`
- **Port**: `1935`
- **Stream Key**: `drone` (FIXE - ne pas modifier)

**URL complète**: `rtmp://10.0.0.1:1935/live/drone`

### Arrêt

```
1. Appuyer Kill Switch (OFF)
2. Le système s'éteint proprement (arrêt forcé après 30s)
```

## Réseaux WiFi

Le système expose **deux réseaux WiFi** aux rôles distincts:

### 1. Réseau télécommande (AP du Beelink) — flux drone uniquement

Le Beelink crée son propre point d'accès (5GHz si la carte le supporte, sinon 2.4GHz):

| Paramètre | Valeur |
|-----------|--------|
| SSID | `corelink-001` |
| Mot de passe | `9fK7qP2xL8vT4wR!3kD8mN5` |
| IP Beelink | `10.0.0.1` |
| IPs clients | `10.0.0.x` (DHCP) |
| Usage | Télécommande DJI (publication RTMP) — pas d'Internet |

### 2. Réseau écrans (routeur 4G Cudy IR02) — consultation + Internet

| Paramètre | Valeur |
|-----------|--------|
| SSID | `corelink-screen` |
| Mot de passe | `4vR9!mQ2xK8sT7wP5nZ3` |
| IP Beelink (LAN routeur) | `192.168.10.10` (réservation DHCP) |
| IP routeur | `192.168.10.1` |
| Usage | Écrans/tablettes (flux + vidéos), SSH admin, Internet 4G |

### Accès utilisateur annexe

Une fois connecté au WiFi écrans, accéder à:
- **Flux live**: `http://192.168.10.10:8080` (interface web)
- **Vidéos historisées**: `http://192.168.10.10:8080/videos`
- (depuis le WiFi télécommande, remplacer par `10.0.0.1`)

## Retransmission 4G

Quand « Serveur externe » est activé dans les **Réglages** (lien RTMP distant),
le Beelink retransmet automatiquement le flux du drone vers ce lien **via le
routeur 4G** (ffmpeg en sortie, pas de redirection de port nécessaire).
L'état de la retransmission et de la 4G est visible dans le panneau **Infos**.

## Monitoring Batterie

**Note**: La SmallRig VB99 ne transmet pas de données via le port DC 12V.

L'interface affiche une **estimation** basée sur:
- Capacité de la batterie: 99 Wh (VB99)
- Consommation estimée: ~35 W (Beelink S12 + écran)
- Autonomie maximale: ~170 minutes (2h50)

L'estimation est initialisée au démarrage du système et décroît avec le temps d'utilisation.

## Mise à jour

### Simple (recommandé)

```bash
# Via le réseau du routeur 4G (Mac sur corelink-screen):
ssh drone@192.168.10.10
# ou en proximité, sur le WiFi corelink-001:
ssh drone@10.0.0.1

cd /opt/drone
git pull origin main
sudo systemctl restart drone-ui
```

> ⚠️ Après une mise à jour, redémarrer aussi `drone-api` (retransmission 4G)
> et `drone-wifi-ap` (bande WiFi) si les scripts/config ont changé:
> `sudo systemctl restart drone-api drone-wifi-ap`

### Complète (après mise à jour OS)

```bash
ssh drone@10.0.0.1
cd /opt/drone
git pull origin main
npm install --production
sudo npm run build
sudo systemctl restart drone-ui
```

## Spécifications Techniques

### Matériel

| Composant | Modèle | Spécifications |
|-----------|--------|----------------|
| SBC | Beelink S12 Mini | Intel N100, 8GB RAM, 256GB SSD |
| Batterie | SmallRig VB99 Mini | 99Wh, USB-C PD 100W |
| Écran | HDMI 1080p | Tactile capacitif 10 points |
| Routeur 4G | Cudy IR02 | LTE Cat4, WiFi écrans `corelink-screen`, LAN 192.168.10.x |
| Drone | DJI Matrice 4TD / M30T | RTMP via DJI Pilot 2 |

### Logiciel

| Composant | Technologie |
|-----------|-------------|
| OS | Ubuntu Server 26.04 LTS |
| Runtime | Node.js 22 LTS |
| RTMP Server | MediaMTX |
| Recording | FFmpeg |
| Interface | React + Vite (kiosk Firefox) |
| API | Express.js |
| Service | systemd |

### Performances

| Métrique | Valeur |
|----------|--------|
| Latence RTMP | < 500ms |
| Stockage vidéo | ~1.5 GB/h (1080p) |
| Autonomie batterie | ~4h (flux continu) |
| Boot time | ~45s |

## Structure du Projet

```
drone/
├── README.md                 # Ce fichier
├── GUIDE_INSTALLATION.md     # Guide complet d'installation
├── GUIDE_SSH.md              # Accès SSH (routeur 4G, câble direct, WiFi)
├── GUIDE_ROUTER.md           # Raccordement routeur 4G Cudy IR02
├── package.json              # Dépendances Node.js
├── config/
│   ├── users.json.example    # Template utilisateurs
│   ├── hostapd.conf          # AP WiFi télécommande (5GHz si supporté)
│   ├── mediamtx.yml          # Serveur RTMP/HLS/WebRTC
│   └── config.json.example   # Template configuration
├── src/
│   ├── server/
│   │   ├── index.js          # Serveur Express principal
│   │   ├── routes/
│   │   │   ├── videos.js     # API vidéos
│   │   │   └── config.js     # API configuration
│   │   └── services/
│   │       ├── battery.js    # Lecture batterie USB
│   │       ├── proxy.js      # Proxy HLS/WebRTC
│   │       ├── rtmp-push.js  # Retransmission 4G (serveur externe)
│   │       ├── recorder.js   # Gestion FFmpeg
│   │       └── cleanup.js    # Nettoyage videos +7j
│   └── client/               # Interface React
│       ├── src/
│       ├── public/
│       └── index.html
├── systemd/
│   ├── drone-ui.service      # Service interface
│   ├── drone-api.service     # Service API
│   └── drone-wifi-ap.service # Service point d'accès WiFi
└── scripts/
    ├── install.sh            # Script installation
    ├── setup-wifi-ap.sh      # AP WiFi télécommande (5GHz auto)
    ├── configure-network.sh  # Netplan Ethernet routeur + WiFi AP
    ├── network-diagnostic.sh # Diagnostic réseau (routeur/4G inclus)
    ├── cleanup-videos.sh     # Cron nettoyage
    ├── healthcheck-mediamtx.sh # Healthcheck MediaMTX
    └── start-kiosk.sh        # Lancement Firefox kiosk
```

## Sécurité

- Le WiFi télécommande (`corelink-001`) est un réseau isolé (pas d'accès internet)
- Le WiFi écrans (`corelink-screen`) donne accès à Internet via la 4G
- La retransmission RTMP est une connexion **sortante** uniquement (pas de port exposé sur Internet)
- Les vidéos sont stockées localement uniquement
- Configuration des liens RTMP externes par l'administrateur uniquement

## Licence

Usage interne - Services d'incendie et de secours
