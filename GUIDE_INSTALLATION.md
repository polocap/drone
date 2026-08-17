# Guide d'Installation DRONE OPS Suite

Ce guide détaille l'installation complète de la suite DRONE OPS sur un Beelink S12 Mini.

## Table des matières

1. [Pré-requis](#pré-requis)
2. [Installation d'Ubuntu Server](#installation-dubuntu-server)
3. [Configuration SSH](#configuration-ssh)
4. [Installation automatique](#installation-automatique)
5. [Configuration manuelle](#configuration-manuelle)
6. [Configuration du WiFi Access Point](#configuration-du-wifi-access-point)
7. [Configuration du Kiosk](#configuration-du-kiosk)
8. [Tests et validation](#tests-et-validation)
9. [Dépannage](#dépannage)

---

## Pré-requis

### Matériel

- Beelink S12 Mini (Intel N100, 8GB RAM, 256GB SSD)
- Écran HDMI avec tactile
- Batterie SmallRig VB99 Mini + câble USB-C
- Câble HDMI
- Clavier USB (pour l'installation initiale)
- Ordinateur pour créer la clé USB bootable

### Logiciel

- USB bootable avec Ubuntu Server 22.04 LTS
- Accès internet (pour télécharger les packages)
- Accès SSH au Beelink (après installation)

### Clone du repository

```bash
# Sur votre machine de développement
git clone <repo-url> drone-ops-suite
cd drone-ops-suite
```

---

## Installation d'Ubuntu Server

### 1. Créer la clé USB bootable

**Télécharger Ubuntu Server 22.04 LTS:**
- https://ubuntu.com/download/server

**Créer la clé USB:**

```bash
# macOS
diskutil list
diskutil unmountDisk /dev/diskX
sudo dd if=ubuntu-22.04.3-live-server-amd64.iso of=/dev/diskX bs=1m

# Linux
sudo dd if=ubuntu-22.04.3-live-server-amd64.iso of=/dev/sdX bs=1M status=progress
```

### 2. Installation sur le Beelink

1. Brancher la clé USB au Beelink
2. Appuyer sur F7 au démarrage pour accéder au menu boot
3. Sélectionner la clé USB
4. Suivre l'assistant d'installation

**Configuration importante:**

| Étape | Configuration |
|-------|---------------|
| **Language** | English |
| **Network** | Connecter ethernet (temporairement pour l'install) |
| **Proxy** | Laisser vide |
| **Mirror** | Par défaut |
| **Storage** | Use entire disk (avec LVM) |
| **Profile** | |
| - Server name | `drone-ops` |
| - Username | `drone` |
| - Password | `<votre-mot-de-passe>` |
| **SSH Setup** | ✓ Install OpenSSH server |
| **Featured Snaps** | Ne rien sélectionner |

5. Attendre la fin de l'installation (~15 min)
6. Retirer la clé USB et redémarrer

---

## Configuration SSH

### 1. Se connecter au Beelink

**Depuis votre ordinateur:**

```bash
# Si sur le même réseau
ssh drone@<IP-BEELINK>

# Mot de passe: celui défini lors de l'installation
```

**Pour trouver l'IP:**
```bash
# Sur le Beelink (écran/clavier)
ip addr show
```

### 2. Configurer les clés SSH

**Option A - Copier votre clé existante:**

```bash
# Sur votre ordinateur
ssh-copy-id drone@<IP-BEELINK>
```

**Option B - Générer une nouvelle clé:**

```bash
# Sur votre ordinateur
ssh-keygen -t ed25519 -C "drone-admin" -f ~/.ssh/drone-beelink

# Copier la clé
ssh-copy-id -i ~/.ssh/drone-beelink.pub drone@<IP-BEELINK>

# Ajouter au SSH config
cat >> ~/.ssh/config <<EOF
Host drone-beelink
    HostName <IP-BEELINK>
    User drone
    IdentityFile ~/.ssh/drone-beelink
EOF
```

### 3. Désactiver l'authentification par mot de passe

```bash
# Sur le Beelink
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

sudo systemctl restart sshd
```

**⚠️ ATTENTION: Assurez-vous que la connexion par clé fonctionne avant de désactiver les mots de passe!**

### 4. Mapper le dossier distant (optionnel)

```bash
# Sur votre ordinateur
ssh drone@<IP-BEELINK> "mkdir -p /home/drone/drone-ops"

# Sur macOS/Linux - installer sshfs si pas disponible
# macOS: brew install sshfs
# Ubuntu: sudo apt install sshfs

sshfs drone-beelink:/home/drone/drone-ops ~/Projects/drone-ops-remote
```

---

## Installation automatique

La méthode recommandée est d'utiliser le script d'installation automatique.

### 1. Copier les fichiers sur le Beelink

**Méthode A - Via Git:**

```bash
# Sur le Beelink
ssh drone@<IP-BEELINK>
sudo mkdir -p /opt/drone
sudo chown drone:drone /opt/drone

git clone <repo-url> /opt/drone
cd /opt/drone
```

**Méthode B - Via SCP:**

```bash
# Sur votre ordinateur
scp -r drone-ops-suite/* drone@<IP-BEELINK>:/home/drone/
ssh drone@<IP-BEELINK>
sudo mv /home/drone/drone-ops-suite /opt/drone
sudo chown -R drone:drone /opt/drone
```

### 2. Lancer l'installation

```bash
# Sur le Beelink
cd /opt/drone
sudo bash scripts/install.sh
```

Le script va:
- ✅ Installer Node.js 20
- ✅ Installer FFmpeg
- ✅ Installer Firefox
- ✅ Installer MediaMTX (serveur RTMP)
- ✅ Créer les répertoires
- ✅ Configurer les services systemd
- ✅ Configurer le nettoyage automatique
- ✅ Installer les dépendances npm

### 3. Configurer les utilisateurs

```bash
# Éditer le fichier des pilotes
sudo nano /etc/drone/users.json
```

Exemple:
```json
[
  {
    "id": 1,
    "name": "Capitaine Martin",
    "unit": "CIS Paris 15",
    "rtmp_key": "pilot_martin"
  }
]
```

### 4. Redémarrer pour activer le kiosk

```bash
sudo reboot
```

---

## Configuration manuelle

Si vous avez des problèmes avec le script, voici la configuration manuelle.

### 1. Installation de Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Vérifier:
```bash
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 2. Installation de FFmpeg

```bash
sudo apt install -y ffmpeg

# Vérifier
ffmpeg -version
```

### 3. Installation de Firefox

```bash
sudo apt install -y firefox

# Vérifier
firefox --version
```

### 4. Installation de MediaMTX

```bash
MEDIAMTX_VERSION="1.8.5"

cd /tmp
wget https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_linux_amd64.tar.gz

sudo mkdir -p /opt/mediamtx
sudo tar -xzf mediamtx_v${MEDIAMTX_VERSION}_linux_amd64.tar.gz -C /opt/mediamtx
sudo chmod +x /opt/mediamtx/mediamtx

# Vérifier
/opt/mediamtx/mediamtx --version
```

### 5. Création des répertoires

```bash
sudo mkdir -p /opt/drone
sudo mkdir -p /var/lib/drone/videos
sudo mkdir -p /etc/drone
sudo mkdir -p /var/log/drone

sudo chown -R drone:drone /var/lib/drone
sudo chown -R drone:drone /var/log/drone
```

### 6. Copie des fichiers de configuration

```bash
# Depuis le dossier du projet
sudo cp config/users.json.example /etc/drone/users.json
sudo cp config/servers.json.example /etc/drone/servers.json
sudo cp config/mediamtx.yml /etc/drone/mediamtx.yml
sudo cp systemd/*.service /etc/systemd/system/

sudo systemctl daemon-reload
```

### 7. Installation des dépendances npm

```bash
cd /opt/drone
npm install --production
npm run build
```

### 8. Activation des services

```bash
sudo systemctl enable mediamtx
sudo systemctl enable drone-api

sudo systemctl start mediamtx
sudo systemctl start drone-api
```

---

## Configuration du WiFi Access Point

### Méthode 1: NetworkManager (recommandée)

```bash
# Vérifier les interfaces WiFi
nmcli device status

# Créer le hotspot
sudo nmcli device wifi hotspot \
  ifname wlo1 \
  con-name "DRONE-OPS-HOTSPOT" \
  ssid "DRONE-OPS-001" \
  password "drone2024"

# Configurer l'IP statique
sudo nmcli connection modify "DRONE-OPS-HOTSPOT" \
  ipv4.addresses "10.0.0.1/24" \
  ipv4.gateway "10.0.0.1" \
  ipv4.method "shared"

# Démarrer automatiquement au boot
sudo nmcli connection modify "DRONE-OPS-HOTSPOT" connection.autoconnect yes

# Redémarrer la connexion
sudo nmcli connection up "DRONE-OPS-HOTSPOT"
```

### Méthode 2: hostapd (avancée)

```bash
# Installer hostapd et dnsmasq
sudo apt install -y hostapd dnsmasq

# Configurer l'interface
sudo cat > /etc/network/interfaces.d/wlo1 <<EOF
auto wlo1
iface wlo1 inet static
    address 10.0.0.1
    netmask 255.255.255.0
EOF

# Configurer hostapd
sudo cat > /etc/hostapd/hostapd.conf <<EOF
interface=wlo1
driver=nl80211
ssid=DRONE-OPS-001
hw_mode=g
channel=6
ieee80211n=1
wmm_enabled=1
ht_capab=[HT40+][SHORT-GI-20][DSSS_CCK-40]
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
wpa_passphrase=drone2024
EOF

# Configurer dnsmasq
sudo cat > /etc/dnsmasq.conf <<EOF
interface=wlo1
dhcp-range=10.0.0.50,10.0.0.200,255.255.255.0,24h
domain=local
address=/drone.local/10.0.0.1
EOF

# Activer les services
sudo systemctl unmask hostapd
sudo systemctl enable hostapd dnsmasq
sudo systemctl start hostapd dnsmasq
```

### Vérification du WiFi

```bash
# Vérifier que le hotspot est actif
nmcli device wifi list

# Vérifier les clients connectés
sudo iw dev wlo1 station dump
```

---

## Configuration du Kiosk

### Ubuntu Desktop (si vous avez installé la version Desktop)

```bash
# Désactiver l'économiseur d'écran
sudo apt install -y xscreensaver
xscreensaver -nosplash &

# Désactiver la mise en veille
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# Configurer l'autologin
sudo cat > /etc/gdm3/custom.conf <<EOF
[Daemon]
AutomaticLoginEnable = true
AutomaticLogin = drone

[Security]
DisallowTCP = false

[xdmcp]
Enable=true
EOF
```

### Openbox (version légère)

```bash
# Installer Openbox
sudo apt install -y xorg openbox lightdm

# Configurer LightDM pour autologin
sudo cat > /etc/lightdm/lightdm.conf <<EOF
[Seat:*]
autologin-user=drone
autologin-user-timeout=0
autologin-session=openbox
xserver-command=X -s 0 -dpms
EOF

# Configurer Openbox autostart
mkdir -p ~/.config/openbox
cat > ~/.config/openbox/autostart <<'EOF'
#!/bin/bash
xset -dpms &
xset s off &
unclutter -idle 0.1 -root &
/opt/drone/scripts/start-kiosk.sh &
EOF
chmod +x ~/.config/openbox/autostart

# Activer le service drone-ui
sudo systemctl enable drone-ui
```

---

## Tests et validation

### 1. Vérifier les services

```bash
# Status de tous les services
sudo systemctl status mediamtx
sudo systemctl status drone-api

# Logs
sudo journalctl -u mediamtx -f
sudo journalctl -u drone-api -f
```

### 2. Tester l'API

```bash
# Health check
curl http://localhost:8080/health

# Liste des pilotes
curl http://localhost:8080/api/pilots

# Config
curl http://localhost:8080/api/config

# Batterie
curl http://localhost:8080/api/battery

# Vidéos
curl http://localhost:8080/api/videos
```

### 3. Tester le flux RTMP

**Depuis un autre appareil avec FFmpeg:**

```bash
# Stream de test
ffmpeg -re -i test-video.mp4 -c copy -f flv rtmp://10.0.0.1:1935/live/test_stream

# Note: test-video.mp4 doit exister
```

**Vérifier que le flux est disponible:**

```bash
# Sur le Beelink
ffprobe rtmp://localhost:1935/live/test_stream
```

### 4. Tester l'interface web

```bash
# Sur un navigateur (autre machine sur le même WiFi)
http://10.0.0.1:8080

# Vous devriez voir:
# - L'écran de sélection du pilote
# - Après sélection, l'écran de visualisation
```

### 5. Vérifier l'enregistrement

```bash
# Vérifier que les vidéos sont créées
ls -la /var/lib/drone/videos/

# Devrait avoir une structure comme:
# /var/lib/drone/videos/2024-01-15/stream_key_14-30.flv
```

### 6. Vérifier l'accès distant

**Depuis un appareil connecté au WiFi DRONE-OPS-001:**

1. Ouvrir un navigateur
2. Aller à `http://10.0.0.1:8080`
3. Vérifier que l'interface s'affiche
4. Aller à `http://10.0.0.1:8080/videos`
5. Vérifier que les vidéos sont listées

---

## Dépannage

### Le flux ne s'affiche pas

**Vérifier MediaMTX:**
```bash
sudo systemctl status mediamtx
sudo journalctl -u mediamtx -n 50
```

**Vérifier le flux RTMP:**
```bash
# Sur la télécommande DJI, vérifier:
# - Connexion au WiFi "DRONE-OPS-001"
# - IP du serveur: 10.0.0.1
# - Port: 1935
# - Stream path: /live/{rtmp_key}

# Test avec FFplay
ffplay rtmp://10.0.0.1:1935/live/<stream_key>
```

**Vérifier le pare-feu:**
```bash
# Si activé, ouvrir les ports
sudo ufw allow 1935/tcp  # RTMP
sudo ufw allow 8080/tcp # API
sudo ufw allow 8888/tcp # HLS
sudo ufw allow 8889/tcp # WebRTC
```

### L'interface ne répond pas

```bash
# Vérifier le service API
sudo systemctl status drone-api
sudo journalctl -u drone-api -n 100

# Redémarrer
sudo systemctl restart drone-api
```

### Firefox ne démarre pas en kiosk

```bash
# Vérifier que X est disponible
echo $DISPLAY

# Lancer manuellement pour tester
/usr/bin/firefox --kiosk --url "http://localhost:8080"

# Vérifier les logs
journalctl -u drone-ui -n 100
```

### Le WiFi ne fonctionne pas

```bash
# Vérifier l'interface
nmcli device status

# Recréer le hotspot
sudo nmcli connection delete "DRONE-OPS-HOTSPOT"
sudo nmcli device wifi hotspot ifname wlo1 con-name "DRONE-OPS-HOTSPOT" ssid "DRONE-OPS-001" password "drone2024"

# Vérifier les logs
sudo journalctl -u NetworkManager -f
```

### La batterie n'est pas détectée

**Option 1: Batterie USB:**
```bash
# Vérifier que la batterie est reconnue
lsusb
upower -e

# Si UPower ne la détecte pas, essayer:
sudo apt install -y acpi
acpi -V
```

**Option 2: Monitoring basique:**
```bash
# Si pas de batterie USB, le système affichera 100% par défaut
# Pour configurer manuellement, modifier src/server/routes/battery.js
```

### Les vidéos ne sont pas enregistrées

```bash
# Vérifier que le dossier existe
ls -la /var/lib/drone/videos/

# Permissions
sudo chmod -R 777 /var/lib/drone/videos/

# Vérifier l'espace disque
df -h /

# Logs FFmpeg
journalctl -u mediamtx | grep -i record
```

### Mise à jour

```bash
# SSH sur le Beelink
ssh drone@<IP>

# Aller dans le dossier
cd /opt/drone

# Pull les changements
sudo git pull

# Réinstaller les dépendances si nécessaire
sudo npm install --production
sudo npm run build

# Redémarrer les services
sudo systemctl restart drone-api
sudo systemctl restart mediamtx
```

---

## Checklist finale

Avant d'être opérationnel, vérifiez:

- [ ] Ubuntu Server installé et SSH fonctionnel
- [ ] Node.js 20+ installé
- [ ] FFmpeg installé
- [ ] Firefox installé
- [ ] MediaMTX fonctionnel (port 1935)
- [ ] API drone fonctionnelle (port 8080)
- [ ] WiFi Access Point configuré (10.0.0.1)
- [ ] Fichier /etc/drone/users.json configuré
- [ ] Firefox démarre en kiosk automatiquement
- [ ] Test du flux RTMP avec une source
- [ ] Test de l'interface web depuis un autre appareil
- [ ] Test de l'enregistrement vidéo
- [ ] Test de la suppression automatique (+7 jours)

---

## Contacts et support

En cas de problème, vérifiez les logs:
- MediaMTX: `journalctl -u mediamtx -f`
- API: `journalctl -u drone-api -f`
- UI: `journalctl -u drone-ui -f`
