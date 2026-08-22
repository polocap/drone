# Guide Connexion SSH - DRONE OPS

## Paramètres de connexion

```
Hôte: 10.0.0.1 (ou IP Ethernet si WiFi AP désactivé)
Utilisateur: drone
Mot de passe: drone2026
```

## Méthode 1: Terminal (macOS/Linux)

```bash
# Connexion basique
ssh drone@10.0.0.1

# Avec mot de passe
# Password: drone2026

# Connexion avec clé SSH (recommandé)
ssh -i ~/.ssh/drone-beelink drone@10.0.0.1
```

## Méthode 2: Windows (PuTTY)

1. Télécharger PuTTY: https://www.putty.org/
2. Configuration:
   - Host Name: `10.0.0.1`
   - Port: `22`
   - Connection Type: `SSH`
3. Cliquer "Open"
4. Login: `drone`
5. Password: `drone2026`

## Méthode 3: VS Code

1. Installer l'extension "Remote - SSH"
2. `Cmd+Shift+P` → "Remote-SSH: Connect to Host"
3. Entrer: `drone@10.0.0.1`
4. Password: `drone2026`

## Trouver l'IP du Beelink

Si vous ne connaissez pas l'IP:

**Depuis le Beelink (écran/clavier)**:
```bash
ip addr show
# Chercher "inet" (pas 127.0.0.1)
```

**Depuis votre ordinateur (même réseau)**:
```bash
# Scanner le réseau
nmap -sn 10.0.0.0/24
# ou
ping 10.0.0.1
```

## Commandes utiles

```bash
# Vérifier les services
sudo systemctl status mediamtx
sudo systemctl status drone-api
sudo systemctl status drone-wifi-ap

# Voir les logs
sudo journalctl -u mediamtx -f
sudo journalctl -u drone-api -f

# Redémarrer les services
sudo systemctl restart mediamtx
sudo systemctl restart drone-api

# Espace disque
df -h /var/lib/drone/videos

# Voir les vidéos
ls -lh /var/lib/drone/videos/
```

## Dépannage

### "Connection refused"
- Vérifier que SSH tourne: `sudo systemctl status ssh`
- Redémarrer: `sudo systemctl restart ssh`

### "Permission denied"
- Vérifier le mot de passe: `drone2026`
- Vérifier l'utilisateur: `drone`

### "No route to host"
- Vérifier que vous êtes sur le même réseau WiFi
- Vérifier l'IP: `ping 10.0.0.1`
