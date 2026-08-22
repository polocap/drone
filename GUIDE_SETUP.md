# Guide Configuration - DRONE OPS

## 1. Connexion WiFi

### Le Beelink crée automatiquement un réseau WiFi

**Dès le démarrage**, le Beelink expose un point d'accès WiFi:

| Paramètre | Valeur |
|-----------|--------|
| **SSID** | `DRONE-OPS-001` |
| **Mot de passe** | `drone2024` |
| **IP du serveur** | `10.0.0.1` |

### Connexion depuis un appareil

**Smartphone/Tablette/PC**:
1. Ouvrir les paramètres WiFi
2. Chercher le réseau `DRONE-OPS-001`
3. Se connecter avec le mot de passe: `drone2024`
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
2. Dans les paramètres WiFi, chercher `DRONE-OPS-001`
3. Se connecter avec le mot de passe: `drone2024`

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
│    - Attendre ~30s (splash screen) │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. SÉLECTION PILOTE                 │
│    - Toucher l'écran                │
│    - Choisir: Martin, Dupont, etc.  │
│    - Confirmer                      │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. TÉLÉCOMMANDE                     │
│    - WiFi auto: DRONE-OPS-001       │
│    - RTMP auto: clé "drone"         │
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

## 4. Accès aux vidéos

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

## 5. Vérification du système

### LEDs et status

| Service | Port | Status |
|---------|------|--------|
| **WiFi AP** | - | LED WiFi allumée |
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

---

## 6. Dépannage

### Pas de flux vidéo

1. **Vérifier WiFi**: Télécommande connectée à `DRONE-OPS-001`?
2. **Vérifier RTMP**: Paramètres corrects dans DJI Pilot?
3. **Vérifier service**: `ssh drone@10.0.0.1` → `sudo systemctl status mediamtx`

### WiFi non détecté

- Le Beelink est-il allumé? (LED power)
- Redémarrer le Beelink
- Vérifier: `ssh drone@10.0.0.1` → `sudo systemctl status drone-wifi-ap`

### Vidéos vides ou corrompues

- Vérifier l'espace disque: `df -h /var/lib/drone/videos`
- Vérifier les logs: `sudo journalctl -u drone-api -f`

---

## 7. Arrêt du système

1. Appuyer sur le **Kill Switch** (OFF)
2. Le système s'éteint proprement
3. Attendre 30s avant de débrancher

**⚠️ IMPORTANT**: Ne pas débrancher brutalement - risque de corruption des vidéos.
