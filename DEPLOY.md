# Guide de Déploiement - DRONE OPS

## Résumé des changements

Ce document décrit comment déployer les corrections apportées au système DRONE OPS.

---

## Problèmes corrigés

### 1. ✓ Boot Splash Screen
**Avant**: Logo Ubuntu s'affichait au démarrage
**Après**: Animation personnalisée "droneOps" avec indicateur de chargement

**Fichiers créés**:
- `plymouth/drone-ops/drone-ops.plymouth`
- `plymouth/drone-ops/drone-ops.script`
- `plymouth/install-plymouth-theme.sh`

### 2. ✓ Écran de sélection pilote
**Avant**: Redirection automatique vers le dernier pilote sélectionné
**Après**: Écran de sélection s'affiche toujours au démarrage

**Fichiers modifiés**:
- `src/client/src/App.jsx`
- `src/client/src/styles/global.css`

### 3. ✓ WiFi disponible au boot
**Avant**: WiFi parfois indisponible ou interface incorrecte
**Après**: Détection automatique de l'interface WiFi, démarrage fiable

**Fichiers modifiés**:
- `scripts/setup-wifi-ap.sh` (complètement réécrit)
- `systemd/drone-wifi-ap.service`
- `systemd/drone-api.service`
- `systemd/drone-ui.service`
- `scripts/start-kiosk.sh`

---

## Instructions de déploiement

### Option 1: Réinstallation complète (recommandé)

Si vous souhaitez une installation propre:

```bash
# Se connecter en SSH
ssh drone@10.0.0.1
# Password: drone2026

# Aller dans le répertoire d'installation
cd /opt/drone

# Mettre à jour depuis Git (si applicable)
git pull

# Lancer l'installation
sudo bash scripts/install.sh

# Redémarrer
sudo reboot
```

### Option 2: Mise à jour sélective (plus rapide)

Pour mettre à jour uniquement les fichiers modifiés:

```bash
# Se connecter en SSH
ssh drone@10.0.0.1

# Mettre à jour le code depuis Git
cd /opt/drone
sudo git pull

# Mettre à jour les scripts
sudo cp scripts/*.sh /opt/drone/scripts/
sudo chmod +x /opt/drone/scripts/*.sh

# Recompiler le frontend
cd /opt/drone
sudo npm run build

# Installer le thème Plymouth
sudo bash plymouth/install-plymouth-theme.sh

# Mettre à jour les services systemd
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload

# Activer les services
sudo systemctl enable drone-wifi-ap
sudo systemctl enable drone-ui

# Redémarrer
sudo reboot
```

### Option 3: Git Bundle + SCP (si le serveur n'a pas accès à Internet)

Si le serveur ne peut pas accéder à GitHub (pas de DNS, pas de connexion), vous pouvez créer un bundle Git et le transférer via SCP :

```bash
# Depuis votre machine locale (là où se trouve le repo git)
cd /path/to/drone

# 1. Créer un bundle contenant toute la branche main
git bundle create /tmp/drone-updates.bundle main

# 2. Transférer le bundle vers le serveur
scp -i ~/.ssh/drone-beelink /tmp/drone-updates.bundle drone@192.168.100.1:/tmp/

# 3. Se connecter en SSH
ssh -i ~/.ssh/drone-beelink drone@192.168.100.1

# 4. Appliquer le bundle
cd /opt/drone
git fetch /tmp/drone-updates.bundle main:refs/heads/main-temp
git merge main-temp
git branch -d main-temp

# 5. Recompiler le frontend
sudo npm run build

# 6. Installer le thème Plymouth (si modifié)
sudo bash plymouth/install-plymouth-theme.sh

# 7. Mettre à jour les services (si modifiés)
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload

# 8. Nettoyer
rm -f /tmp/drone-updates.bundle

# 9. Redémarrer
sudo reboot
```

**Notes :**
- Le bundle est un fichier autonome qui ne nécessite pas de connexion réseau
- Les modifications locales non commitées sur le serveur seront écrasées par le merge
- Si le serveur a des changements locaux importants, faites un `git stash` avant le merge

### Option 4: Mise à jour manuelle (si Git indisponible)

Copiez manuellement les fichiers modifiés via SCP:

```bash
# Depuis votre machine locale
scp -r src/ drone@10.0.0.1:/opt/drone/
scp -r scripts/ drone@10.0.0.1:/opt/drone/
scp -r systemd/ drone@10.0.0.1:/opt/drone/
scp -r plymouth/ drone@10.0.0.1:/opt/drone/

# Puis se connecter en SSH pour finaliser
ssh drone@10.0.0.1

# Recompiler le frontend
cd /opt/drone
sudo npm run build

# Mettre à jour les services
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload

# Installer Plymouth
sudo bash plymouth/install-plymouth-theme.sh

# Redémarrer
sudo reboot
```

---

## Vérification post-déploiement

### 1. Vérifier le boot splash
- Redémarrer le système
- Observer l'animation "droneOps" pendant le chargement
- Confirmer qu'il n'y a plus de logo Ubuntu

### 2. Vérifier l'écran de sélection
- Attendre que le système démarre
- Confirmer que l'écran de sélection pilote s'affiche automatiquement
- Sélectionner un pilote et vérifier la transition

### 3. Vérifier le WiFi
- Depuis un appareil: chercher le réseau "DRONE-OPS-001"
- Se connecter avec le mot de passe "drone2024"
- Vérifier la connectivité: `ping 10.0.0.1`

### 4. Health check complet
```bash
sudo /opt/drone/scripts/healthcheck.sh
```

---

## Rollback (si nécessaire)

### Thème Plymouth
```bash
sudo plymouth-set-default-theme ubuntu-logo -R
sudo update-initramfs -u
```

### Services
```bash
sudo systemctl disable drone-wifi-ap
sudo systemctl disable drone-ui
sudo systemctl daemon-reload
```

---

## Accès terminal (TTY) sans clavier USB

Si le serveur affiche l'interface tactile et que vous avez besoin d'un terminal (ex: pour réparer le réseau), vous pouvez basculer vers un console texte :

### Depuis le clavier USB
Appuyez sur **Ctrl+Alt+F2** pour accéder à la console TTY2. Connectez-vous avec `drone` (pas de mot de passe).

### Depuis SSH (si le réseau fonctionne)
```bash
ssh -i ~/.ssh/drone-beelink drone@192.168.100.1
```

### Commandes réseau utiles (si l'IP est perdue)
```bash
# Sur le serveur (via TTY ou SSH)
sudo ip addr add 192.168.100.1/24 dev enp1s0
sudo ip link set enp1s0 up
```

### Retour à l'interface graphique
**Ctrl+Alt+F1** pour revenir à l'affichage graphique (GDM3).

---

## Séquence de démarrage complète

1. **Plymouth** : Splash "droneOps" avec animation (pas de logo Ubuntu)
2. **GRUB** : Menu caché (timeout=0), démarrage direct
3. **GDM3** : Auto-login "drone" (pas de mot de passe)
4. **Openbox** : Lance Firefox en mode kiosk
5. **App** : Écran PIN (code: 123456) → Sélection pilote → Live view
6. **WiFi** : AP "DRONE-OPS-001" disponible dès le boot

---

## Support

En cas de problème:

1. **Logs**: `sudo journalctl -u <service> -f`
2. **Status**: `sudo systemctl status <service>`
3. **Health check**: `sudo /opt/drone/scripts/healthcheck.sh`
4. **SSH**: Connexion via `ssh drone@10.0.0.1`

---

## Liste des fichiers modifiés/créés

### Nouveaux fichiers
```
plymouth/
├── drone-ops/
│   ├── drone-ops.plymouth
│   └── drone-ops.script
└── install-plymouth-theme.sh
```

### Fichiers modifiés
```
src/client/src/
├── App.jsx
└── styles/global.css

scripts/
├── setup-wifi-ap.sh
├── start-kiosk.sh
└── install.sh

systemd/
├── drone-wifi-ap.service
├── drone-api.service
└── drone-ui.service

GUIDE_SETUP.md
```

### Services impactés
- `drone-wifi-ap` (nouveau)
- `drone-ui` (nouveau)
- `drone-api` (modifié)

---

## Notes

- **Le WiFi AP est maintenant un service systemd** : il démarre automatiquement au boot
- **Le thème Plymouth nécessite un redémarrage** pour être visible
- **L'écran de sélection pilote n'auto-redirige plus** vers le dernier utilisateur
- **Tous les changements sont répliqués sur GitHub**
