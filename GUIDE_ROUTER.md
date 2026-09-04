# Guide Routeur 4G — Cudy IR02 + Beelink

Ce guide décrit le raccordement du routeur 4G **Cudy IR02** au serveur Beelink,
et la configuration des deux réseaux WiFi du système.

## Architecture réseau

```
                       ┌─────────────────────────────────────┐
  Télécommande DJI     │           BEELINK S12 MINI          │
  (flux drone)         │                                     │
  WiFi corelink-001-drone ──►│  wlp2s0 : AP "corelink-001-drone"         │
  RTMP → 10.0.0.1:1935 │  10.0.0.1  (réservé télécommande)   │
                       │                                     │
                       │  enp1s0 : Ethernet                  │
                       └──────────────┬──────────────────────┘
                                      │ câble Ethernet
                                      ▼
                       ┌─────────────────────────────────────┐
                       │          CUDY IR02 (4G)             │
                       │  LAN : 192.168.10.1                 │
                       │  Beelink : 192.168.10.10 (réservé)  │
                       │                                     │
                       │  WiFi "corelink-001-screen" (écrans)    │
                       │  SIM 4G ──► Internet                │
                       └──────────────┬──────────────────────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                 ▼                  ▼
              Écrans / PC       Mac (admin SSH)    Serveur RTMP
              tablettes         via WiFi routeur   externe (settings)
              http://192.168.10.10:8080            push ffmpeg sur la 4G
```

**Rôles des deux réseaux WiFi** — ne pas inverser :

| Réseau | SSID | Mot de passe | Qui s'y connecte | À quoi il sert |
|--------|------|--------------|------------------|----------------|
| Beelink (AP) | `corelink-001-drone` | `9fK7qP2xL8vT4wR!3kD8mN5` | Télécommande DJI uniquement | Publier le flux drone (RTMP → 10.0.0.1:1935) |
| Routeur 4G | `corelink-001-screen` | `4vR9!mQ2xK8sT7wP5nZ3` | Écrans, tablettes, Mac admin | Voir le flux, récupérer les vidéos, SSH admin, Internet 4G |

> Le Beelink ne peut pas rejoindre le WiFi de votre Mac ou d'une box : sa
> unique carte WiFi sert de point d'accès pour la télécommande. L'accès admin
> passe donc par le réseau du routeur (WiFi ou Ethernet sur un port LAN).

> **Test sans carte SIM** : le routeur diffuse son WiFi et son LAN même
> **sans SIM insérée**. Tout fonctionne sauf la sortie Internet : les écrans
> voient le flux, mais le panneau Infos affichera « 4G : Routeur OK — pas
> d'Internet » (jaune) et la retransmission RTMP externe restera en attente.
> Pour tester sans SIM, ignorez simplement les voyants 4G/Internet.

---

## 1. Raccordement physique

1. Insérer la **carte SIM** (nano) dans le Cudy IR02, emplacement indiqué sur
   la tranche. Le code PIN de la SIM doit être **désactivé**.
2. Brancher le **câble Ethernet** entre un **port LAN** du Cudy et le port
   Ethernet du Beelink (`enp1s0`).
   - Si votre modèle de Cudy n'a qu'un port « LAN/WAN », vérifier dans
     l'interface d'admin qu'il est bien en mode **LAN** (mode routeur 4G,
     pas mode "bridge"/"WAN").
3. Allumer le routeur (alimentation USB-C ou bloc secteur selon modèle) et
   attendre ~1 min (barre LED 4G fixe = signal capté).

Le Beelink obtient automatiquement une IP du routeur par DHCP
(`192.168.10.x`). Aucune configuration à faire côté Beelink : c'est le
comportement par défaut.

---

## 2. Configuration du Cudy IR02 — ✅ DÉJÀ FAITE (04/09/2026)

L'assistant de première configuration a été complété :

| Réglage | Valeur |
|---------|--------|
| **Mot de passe admin** | `Cudy!IR02-2026` (admin : `http://192.168.10.1`) |
| **WiFi 2.4G SSID** | `corelink-001-screen` |
| **WiFi mot de passe** | `4vR9!mQ2xK8sT7wP5nZ3` |
| **Réservation DHCP** | Beelink (MAC `78:55:36:0B:94:6B`) → `192.168.10.10` |
| **Mode** | Cellular Router (par défaut) |

**Reste à faire quand vous aurez une SIM** :
1. Insérer la carte SIM (nano) puis redémarrer le routeur.
2. Si la SIM exige un APN manuel : *Advanced Settings → Network → … → APN*
   (renseigner l'APN de l'opérateur). Sinon le profil "Auto" suffit.
3. La page d'accueil doit afficher le signal 4G et une IP WAN.
4. Sur l'écran du Beelink, le panneau **Infos** doit alors passer
   « 4G : Disponible » (vert).

### Code PIN de la SIM : comment ça se passe

- **Cas le plus courant (SIM data sans PIN)** : rien à faire. Le routeur
  détecte la SIM, se connecte au réseau et partage Internet tout seul. Le
  panneau **Infos** du Beelink passe « 4G : Disponible » (vert) en quelques
  dizaines de secondes — aucune configuration côté Beelink.
- **SIM avec code PIN activé** : au démarrage, le routeur bloque la 4G et
  demande le code. Sur l'interface d'admin (`http://192.168.10.1`,
  `admin` / `Cudy!IR02-2026`), une invite « SIM PIN / Enter PIN » apparaît :
  saisir le code PIN **une seule fois** — le routeur le mémorise et
  déverrouille la SIM automatiquement à chaque démarrage suivant. En cas de
  saisie erronée répétée, la SIM se bloque : utiliser alors le code PUK.
- **Recommandation** : retirer le PIN de la SIM en l'insérant dans un
  téléphone (Paramètres → Sécurité → Verrouillage SIM → désactiver), cela
  évite toute manipulation sur le terrain.
- Tant que la SIM n'est pas déverrouillée (absente, PIN demandé, pas de
  réseau), le panneau **Infos** reste sur « 4G : Routeur OK — pas
  d'Internet » (jaune) : le Beelink ne voit que le LAN du routeur.

> Le serveur RTMP externe est joignable en **sortie** (push vers Internet) :
> le NAT/CGNAT de la 4G ne pose aucun problème, aucune redirection de port
> n'est nécessaire.

---

## 3. Vérifications

Depuis le Mac connecté au WiFi `corelink-001-screen` :

```bash
# 1. Le Beelink répond sur le LAN routeur
ping 192.168.10.10

# 2. L'interface web s'ouvre
open http://192.168.10.10:8080

# 3. SSH admin
ssh drone@192.168.10.10          # mot de passe : drone2026
# ou, si avahi est actif (installé par install.sh) :
ssh drone@beelink.local          # adapter au hostname réel (commande hostname)

# 4. État réseau complet sur le Beelink
sudo /opt/drone/scripts/network-diagnostic.sh
```

Sur l'écran du Beelink, le panneau **Infos** doit montrer :
- **4G : Disponible** (vert) — routeur joignable + Internet OK
  (jaune « Routeur OK — pas d'Internet » = SIM/data absente)
- **Retransmission : Active** (vert) quand le flux drone est publié et que
  « Serveur externe » est activé dans les Réglages

---

## 4. Retransmission RTMP via la 4G

1. Sur l'app (écran tactile) : **Réglages → Serveur externe → ON**, saisir le
   lien RTMP distant (`rtmp://serveur.com/live/cle`) puis **Enregistrer**.
2. Dès qu'un flux drone est publié (télécommande connectée), le Beelink lance
   automatiquement un `ffmpeg` qui retransmet ce flux vers le lien configuré
   **en passant par le routeur 4G** (route par défaut).
3. Vérification en SSH :

```bash
# Le push ffmpeg tourne ?
ps aux | grep -v grep | grep "flv rtmp"

# Logs du push (démarrage, erreurs, reconnexions)
sudo journalctl -u drone-api | grep "RTMP push"
```

Notes :
- Le flux retransmis est celui affiché à l'écran (flux générique `live`
  prioritaire, sinon le premier flux `live/<drone_id>`).
- Prévoir une **offre 4G avec suffisamment de data** : ~1,5–4 Go/h selon la
  qualité du flux drone, uniquement quand la retransmission est active.
- Changer le lien RTMP dans les Réglages s'applique en quelques secondes,
  sans redémarrage.

---

## 5. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| « 4G : Non disponible » dans Infos | Câble Ethernet débranché / routeur éteint | Vérifier le câble, les LEDs du port LAN |
| 4G jaune « Routeur OK — pas d'Internet » | SIM absente, code PIN actif, pas de réseau | Vérifier SIM/APN, signal sur la page admin du Cudy |
| Écrans sur `corelink-001-screen` n'ouvrent pas `http://192.168.10.10:8080` | Isolation client activée sur le routeur | Désactiver l'isolation dans l'admin Cudy |
| `192.168.10.10` ne répond pas mais le Beelink est joignable ailleurs | Réservation DHCP non prise en compte | Relancer le Beelink, vérifier l'IP réelle dans la liste DHCP du routeur |
| « Retransmission : Erreur » | Lien RTMP distant invalide ou serveur externe hors ligne | Vérifier l'URL dans Réglages + `journalctl -u drone-api \| grep "RTMP push"` |
| Le WiFi routeur n'apparaît pas | SSID caché / config WiFi reset | Reconfigurer le SSID `corelink-001-screen` (section 2) |
