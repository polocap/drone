# Guide Connexion SSH - DRONE OPS

## ⚠️ Trois méthodes d'accès DIFFÉRENTES

| Méthode | Interface | IP | Usage |
|---------|-----------|-----|-------|
| **Admin (routeur 4G)** | WiFi `corelink-001-screen` ou LAN du Cudy | `192.168.10.10` | Configuration serveur — **méthode principale** |
| **Admin (câble direct)** | Ethernet Mac ↔ Beelink | 192.168.100.1 | Sans routeur (dépannage) |
| **Opérateur** | WiFi `corelink-001-drone` | 10.0.0.1 | Visionnage flux + SSH de proximité |

> **Important**: depuis l'arrivée du routeur 4G, le port Ethernet du Beelink
> est occupé par le Cudy IR02. Le Beelink ne peut plus rejoindre le WiFi de
> votre Mac ou d'une box : sa carte WiFi sert de point d'accès pour la
> télécommande (`corelink-001-drone`). L'accès admin passe donc par le réseau du
> routeur. Voir `GUIDE_ROUTER.md` pour le raccordement.

---

## 🔧 ACCÈS ADMIN - Via le routeur 4G Cudy (méthode principale)

Le Beelink est raccordé au routeur par câble Ethernet et obtient l'IP
`192.168.10.10` (réservation DHCP, voir GUIDE_ROUTER.md).

#### Étape 1: Connecter le Mac au réseau du routeur

- **WiFi**: rejoindre `corelink-001-screen` (mot de passe `4vR9!mQ2xK8sT7wP5nZ3`)
- **ou câble Ethernet** du Mac sur un port LAN libre du Cudy
  (vérifié : le Mac garde Internet par son WiFi tant que « Wi-Fi » est avant
  l'adaptateur USB-Ethernet dans Réglages réseau → Ordre des services)

#### Étape 2: SSH

```bash
ssh drone@192.168.10.10
# Mot de passe: drone2026
# ou avec la clé: ssh -i ~/.ssh/drone-beelink drone@192.168.10.10
```

> **Fonctionne sans carte SIM** : le WiFi `corelink-001-screen` et le LAN du
> routeur sont actifs même sans réseau 4G. Seule la sortie Internet manque.

En cas de problème (réservation modifiée, IP inconnue):

```bash
# Liste des clients DHCP dans l'admin du routeur: http://192.168.10.1
#   (admin / Cudy!IR02-2026) — le Beelink apparaît en filaire
# Ou par mDNS, une fois avahi installé sur le Beelink (voir ci-dessous):
ssh drone@drone-ops.local
```

> Le Beelink répond aussi en HTTP sur ce réseau: `http://192.168.10.10:8080`
>
> **Bonus confort** : quand le Beelink aura Internet (SIM insérée), installer
> avahi pour le raccourci `drone-ops.local` :
> `sudo apt install avahi-daemon`

---

## 🔧 ACCÈS ADMIN - Câble direct Mac ↔ Beelink (sans routeur)

#### Étape 1: Vérifier l'interface sur le Beelink

```bash
# Vérifier que enp1s0 est UP et a une IP
ip addr show enp1s0
```

Si `enp1s0` n'a pas d'adresse IPv4, en ajouter une:

```bash
sudo ip link set enp1s0 up
sudo ip addr add 192.168.100.1/24 dev enp1s0
```

Vérifier que ça a bien pris:

```bash
ip addr show enp1s0
# Devrait afficher: inet 192.168.100.1/24
```

#### Étape 2: Configurer l'IP sur le Mac

Sur votre Mac, identifier l'interface Ethernet USB:

```bash
# Trouver l'interface (souvent en6 pour un adaptateur USB Ethernet)
networksetup -listallhardwareports
```

Ajouter une IP dans le même sous-réseau:

```bash
sudo ifconfig en6 inet 192.168.100.2 netmask 255.255.255.0 up
```

Vérifier:

```bash
ifconfig en6
# Devrait afficher: inet 192.168.100.2
```

#### Étape 3: Activer SSH sur le Beelink

```bash
# Vérifier si SSH tourne
sudo systemctl status ssh

# Si "inactive" ou "not found", démarrer SSH:
sudo systemctl start ssh
sudo systemctl enable ssh
```

#### Étape 4: SSH depuis le Mac

```bash
ssh drone@192.168.100.1
# Mot de passe: drone2026
```

> **Note:** Cette configuration est temporaire. après un redémarrage du Mac, il faudra relancer la commande `sudo ifconfig en6 ...`.

---

### Méthode B: Via un routeur/switch générique (autre que le Cudy)

Si le Beelink est connecté à un routeur:

#### Étape 1: Connecter le câble Ethernet
Brancher un câble Ethernet entre le Beelink et votre routeur/switch

#### Étape 2: Configurer l'IP sur le Beelink

```bash
# Activer l'interface
sudo ip link set enp1s0 up

# Tenter DHCP
sudo dhclient enp1s0

# Vérifier si une IP a été attribuée
ip addr show enp1s0

# Si pas d'IP, en ajouter une statique
sudo ip addr add 192.168.1.100/24 dev enp1s0
```

**Adapter selon votre réseau:**
- Routeur en `192.168.0.x`: utilisez `192.168.0.100/24`
- Routeur en `10.0.0.x`: utilisez `10.0.0.100/24`

#### Étape 3: Activer SSH sur le Beelink

```bash
sudo systemctl start ssh
sudo systemctl enable ssh
```

#### Étape 4: SSH depuis le Mac

```bash
ssh drone@192.168.1.100
```

---

### Vérifications communes (les deux méthodes)

**Si SSH ne répond pas, vérifier sur le Beelink:**

```bash
# 1. SSH écoute sur toutes les interfaces
sudo ss -tlnp | grep :22
# Doit afficher: 0.0.0.0:22

# 2. Pare-feu n bloque pas
sudo ufw status
sudo ufw allow 22/tcp

# 3. Logs SSH
sudo journalctl -u ssh -n 20
```

---

## 🔍 Résolution des problèmes de connexion SSH

### "Connection timed out" - La connexion expire

**Vérifier étape par étape sur le Beelink:**

```bash
# 1. Vérifier l'interface est UP
ip link show enp1s0
# Doit afficher: state UP

# 2. Vérifier l'IP est configurée
ip addr show enp1s0 | grep "inet "
# Doit afficher: inet 192.168.100.1/24 (connexion directe) ou 192.168.1.x (routeur)

# 3. Vérifier SSH tourne
sudo systemctl status ssh
# Doit afficher: Active: active (running)

# 4. Vérifier SSH écoute sur 0.0.0.0:22 (toutes les interfaces)
sudo ss -tlnp | grep :22
# Doit afficher: 0.0.0.0:22

# 5. Vérifier le pare-feu
sudo iptables -L | grep -i ssh
sudo ufw status
```

**Si SSH n'écoute que sur localhost (127.0.0.1):**

```bash
# Éditer la config SSH
sudo nano /etc/ssh/sshd_config

# Chercher et modifier:
#ListenAddress 127.0.0.1  # <- Commenter cette ligne
ListenAddress 0.0.0.0      # <- Ajouter ceci

# Redémarrer SSH
sudo systemctl restart ssh
```

**Si le pare-feu bloque:**

```bash
# Autoriser SSH sur toutes les interfaces
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -i enp1s0 -p tcp --dport 22 -j ACCEPT

# Sauvegarder les règles
sudo iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
```

**Si SSH ne démarre pas:**

```bash
# Voir les erreurs
sudo journalctl -u ssh -n 50

# Réinstaller SSH si nécessaire
sudo apt update
sudo apt install --reinstall openssh-server

# Générer les clés si manquantes
sudo ssh-keygen -A
sudo systemctl restart ssh
```

### "Connection refused" - Connexion refusée

```bash
# Sur le Beelink
# Vérifier que le port 22 est ouvert
sudo lsof -i :22

# Vérifier les logs SSH
sudo tail -f /var/log/auth.log

# Autoriser l'utilisateur drone
sudo nano /etc/ssh/sshd_config
# Vérifier: AllowUsers drone
# ou commenter la ligne AllowUsers pour autoriser tous

sudo systemctl restart ssh
```

### "Permission denied" - Clé SSH refusée

```bash
# Sur votre Mac
# Vérifier que la clé existe
ls -la ~/.ssh/drone-beelink

# Vérifier les permissions
cd ~/.ssh
chmod 600 drone-beelink
chmod 644 drone-beelink.pub

# Supprimer l'ancienne entrée connue
ssh-keygen -R 192.168.1.100

# Réessayer avec verbose
ssh -v -i ~/.ssh/drone-beelink drone@192.168.1.100
```

**Sur le Beelink, vérifier la clé autorisée:**

```bash
# Vérifier que la clé est présente
sudo cat /home/drone/.ssh/authorized_keys

# Si vide, ajouter la clé publique
echo "votre_clé_publique" | sudo tee -a /home/drone/.ssh/authorized_keys
sudo chown drone:drone /home/drone/.ssh/authorized_keys
sudo chmod 600 /home/drone/.ssh/authorized_keys
```

---

## 📡 ACCÈS OPÉRATEUR - WiFi télécommande (proximité)

**Pour une vérification rapide à côté du serveur** (ce WiFi est réservé à la
télécommande en opération, ne pas l'utiliser pendant un vol):

### Depuis un PC/Mac connecté au WiFi
1. Connectez-vous au WiFi: `corelink-001-drone`
2. Mot de passe: `9fK7qP2xL8vT4wR!3kD8mN5`
3. Accédez à: http://10.0.0.1:8080

### En SSH (si besoin)
```bash
# Une fois connecté au WiFi corelink-001-drone
ssh drone@10.0.0.1
```

---

## 🔍 Diagnostic réseau

**Sur le Beelink, exécutez:**
```bash
# Diagnostic complet
sudo /opt/drone/scripts/network-diagnostic.sh

# Configuration réseau
sudo /opt/drone/scripts/configure-network.sh

# Réparation automatique SSH
sudo /opt/drone/scripts/fix-ssh.sh
```

---

## ❌ Commandes de secours

### Redémarrer SSH
```bash
sudo systemctl restart ssh
sudo systemctl status ssh
```

### Réinitialiser complètement SSH
```bash
# Arrêter SSH
sudo systemctl stop ssh

# Supprimer les anciennes clés
sudo rm /etc/ssh/ssh_host_*

# Régénérer
sudo ssh-keygen -A

# Redémarrer
sudo systemctl start ssh
```

### Test de connectivité
```bash
# Depuis le Beelink - tester si le port 22 est accessible
nc -zv localhost 22

# Depuis votre Mac - tester la connexion (directe)
nc -zv 192.168.100.1 22

# Depuis votre Mac - tester la connexion (routeur)
nc -zv 192.168.1.100 22
```

---

## 📊 Commandes utiles

### Sur le Beelink
```bash
# Voir toutes les IPs
ip addr show | grep "inet "

# Configurer le réseau
sudo /opt/drone/scripts/configure-network.sh

# Voir les services
sudo systemctl status mediamtx
sudo systemctl status drone-api
sudo systemctl status drone-wifi-ap

# Logs
sudo journalctl -u mediamtx -f
sudo journalctl -u drone-api -f
```

### Espace disque
```bash
df -h /var/lib/drone/videos
ls -lh /var/lib/drone/videos/
```

---

## 🌐 Résumé des IPs et ports

| Service | IP | Port | Accès |
|---------|-----|------|-------|
| SSH (admin - routeur 4G) | 192.168.10.10 | 22 | WiFi `corelink-001-screen` ou LAN Cudy |
| SSH (admin - câble direct) | 192.168.100.1 | 22 | Ethernet direct Mac ↔ Beelink |
| SSH (proximité) | 10.0.0.1 | 22 | WiFi `corelink-001-drone` |
| Interface web (écrans) | 192.168.10.10 | 8080 | WiFi `corelink-001-screen` |
| Interface web (proximité) | 10.0.0.1 | 8080 | WiFi `corelink-001-drone` |
| RTMP (télécommande) | 10.0.0.1 | 1935 | WiFi `corelink-001-drone` |
| HLS | 10.0.0.1 ou 192.168.10.10 | 8888 | selon réseau |
| Routeur (admin Cudy) | 192.168.10.1 | 80 | WiFi `corelink-001-screen` — `admin` / `Cudy!IR02-2026` |

---

## 🔐 Accès root

Pour les opérations administratives:
```bash
ssh drone@<ip>
sudo -i
# ou
ssh root@<ip>
```

**⚠️ Note:** Le réseau du routeur 4G (192.168.10.x) est l'accès admin normal.
Le câble direct (192.168.100.1) sert au dépannage sans routeur. Le WiFi
10.0.0.1 est réservé à la télécommande et aux vérifications de proximité.

---

## 🆘 Dernière solution - Mode secours

Si rien ne fonctionne, connectez un clavier et écran au Beelink:

```bash
# Créer un utilisateur temporaire
sudo adduser tempadmin
sudo usermod -aG sudo tempadmin

# Activer le login root temporairement
sudo passwd root
# Puis SSH avec root
```
