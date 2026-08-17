# DRONE OPS SUITE

> Système de retransmission vidéo pour opérations drone sur le terrain

[![License](https://img.shields.io/badge/license-Internal-red.svg)](LICENSE)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-22.04%20LTS-orange.svg)](https://ubuntu.com)
[![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-green.svg)](https://nodejs.org)

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
│  └──────────────┘      └──────────────┘      │             │
│         │                     │              │             │
│         │                     │     ┌────────▼────────┐    │
│         │                     │     │   Écran HDMI    │    │
│         │                     │     │   (Tactile)     │    │
│  ┌──────▼──────┐              │     └─────────────────┘    │
│  │ Kill Switch │              │                            │
│  │ (On/Off)    │              │                            │
│  └─────────────┘              │                            │
│                               │                            │
│                               │ WiFi                       │
│                               │                            │
└───────────────────────────────┼────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
            ┌───────▼───────┐       ┌───────▼───────┐
            │ Télécommande  │       │ Utilisateur   │
            │ DJI RC Plus   │       │ Annexe        │
            │ (RTMP)        │       │ (Tablette)    │
            └───────────────┘       └───────────────┘
                    │                       │
                    │                       │
            ┌───────▼───────┐       ┌───────▼───────┐
            │     Drone     │       │  Serveur     │
            │  Matrice 4TD  │       │  Extérieur   │
            │     M30T      │       │  (IP custom) │
            └───────────────┘       └───────────────┘
```

## Flux de Données

```
      Drone (RTMP)
          │
          ▼
    ┌─────────────────────────────────────┐
    │        Télécommande DJI Pilot 2      │
    │  (Configuration RTMP: rtmp://IP/live)
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
| **Retransmission** | Configuration d'IP(s) externe(s) pour partage du flux |
| **Interface tactile** | Sélection utilisateur + monitoring batterie |

### Utilisateurs

Le système charge les utilisateurs depuis `/etc/drone/users.json`:

```json
[
  {
    "id": 1,
    "name": "Capitaine Martin",
    "unit": "CIS Paris 15",
    "rtmp_key": "pilot_martin"
  },
  {
    "id": 2,
    "name": "Lieutenant Dupont",
    "unit": "GRIMP",
    "rtmp_key": "pilot_dupont"
  }
]
```

### Stocks vidéo

Les vidéos sont stockées dans `/var/lib/drone/videos/` avec la structure:

```
/var/lib/drone/videos/
├── 2024-01-15/
│   ├── martin_14h30.flv
│   ├── dupont_16h45.flv
│   └── martin_17h10.flv
└── 2024-01-16/
    └── martin_09h00.flv
```

**Rotation automatique**: Au démarrage, suppression des vidéos de plus de 7 jours.

### Accès Externe (Camions PC)

Les camions PC peuvent se connecter au WiFi **DRONE-OPS-XXX** et accéder au flux sans configuration préalable:

1. Se connecter au WiFi (mot de passe: `drone2024`)
2. Ouvrir un navigateur
3. Aller à `http://10.0.0.1:8080`

Le flux est automatiquement disponible pour tous les appareils connectés au WiFi du Beelink.

### Configuration des IPs (Optionnel)

Si retransmission vers un serveur externe nécessaire, voir `config/servers.json.example`.

## Démarrage Opérationnel

### Séquence de mise en route

```
1. Brancher batterie SmallRig VB99 (si pas déjà fait)
2. Activer le Kill Switch (ON)             ← Allume Beelink + Écran par USB-C
3. Attendre le boot automatique (~45s)
4. Sélectionner le pilote sur l'écran tactile
5. Connecter la télécommande au WiFi "DRONE-OPS-XXX"
6. Configurer DJI Pilot 2: rtmp://10.0.0.1:1935/live/{rtmp_key}
7. Démarrer le vol                         ← Le flux s'affiche automatiquement
```

### Arrêt

```
1. Appuyer Kill Switch (OFF)
2. Le système s'éteint proprement (arrêt forcé après 30s)
```

## Réseau WiFi

Le Beelink crée un point d'accès:

| Paramètre | Valeur |
|-----------|---------|
| SSID | `DRONE-OPS-{SERIAL}` |
| Mot de passe | `drone2024` |
| IP Beelink | `10.0.0.1` |
| IPs clients | `10.0.0.x` (DHCP) |

### Accès utilisateur annexe

Une fois connecté au WiFi, accéder à:
- **Flux live**: `http://10.0.0.1:8080` (interface web)
- **Vidéos historisées**: `http://10.0.0.1:8080/videos`

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
ssh drone@10.0.0.1
cd /opt/drone
git pull origin main
sudo systemctl restart drone-ui
```

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
| Drone | DJI Matrice 4TD / M30T | RTMP via DJI Pilot 2 |

### Logiciel

| Composant | Technologie |
|-----------|-------------|
| OS | Ubuntu Server 22.04 LTS |
| Runtime | Node.js 20 LTS |
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
├── package.json              # Dépendances Node.js
├── config/
│   ├── users.json.example    # Template utilisateurs
│   └── config.json.example   # Template configuration
├── src/
│   ├── server/
│   │   ├── index.js          # Serveur Express principal
│   │   ├── routes/
│   │   │   ├── videos.js     # API vidéos
│   │   │   └── config.js     # API configuration
│   │   └── services/
│   │       ├── battery.js    # Lecture batterie USB
│   │       ├── recorder.js    # Gestion FFmpeg
│   │       └── cleanup.js     # Nettoyage videos +7j
│   └── client/               # Interface React
│       ├── src/
│       ├── public/
│       └── index.html
├── systemd/
│   ├── drone-ui.service      # Service interface
│   └── drone-api.service     # Service API
└── scripts/
    ├── install.sh            # Script installation
    ├── cleanup-videos.sh    # Cron nettoyage
    └── start-kiosk.sh        # Lancement Firefox kiosk
```

## Sécurité

- Le WiFi est un réseau isolé (pas d'accès internet)
- Les vidéos sont stockées localement uniquement
- Aucune donnée n'est transmise à des serveurs tiers
- Configuration des IPs externes par l'administrateur uniquement

## Licence

Usage interne - Services d'incendie et de secours
