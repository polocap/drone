#!/bin/bash
#
# SSH Fix Script for DRONE OPS
# Fixes common SSH connection issues
#

set -e

echo "=============================================="
echo "  SSH Troubleshooting & Fix"
echo "=============================================="
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Must run as root: sudo $0"
    exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Step 1: Check interface status
check_interface() {
    log_info "Checking network interface..."

    # Find ethernet interface
    ETHERNET_IFACE=""
    for iface in enp1s0 enp2s0 enp3s0 enp0s3 enp0s31f6 eth0 eth1; do
        if ip link show "$iface" &>/dev/null; then
            ETHERNET_IFACE="$iface"
            break
        fi
    done

    if [ -z "$ETHERNET_IFACE" ]; then
        ETHERNET_IFACE=$(ip -br link show | grep -E "^(en|eth)" | awk '{print $1}' | head -1)
    fi

    if [ -z "$ETHERNET_IFACE" ]; then
        log_error "No ethernet interface found!"
        return 1
    fi

    log_info "Interface: $ETHERNET_IFACE"

    # Check if UP
    if ip link show "$ETHERNET_IFACE" | grep -q "state UP"; then
        log_success "Interface is UP"
    else
        log_warn "Interface is DOWN, bringing it up..."
        ip link set "$ETHERNET_IFACE" up
        sleep 1
    fi

    # Check IP
    CURRENT_IP=$(ip -br addr show "$ETHERNET_IFACE" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -n "$CURRENT_IP" ]; then
        log_success "IP address: $CURRENT_IP"
        echo ""
        echo "=============================================="
        echo "  Connect with: ssh drone@$CURRENT_IP"
        echo "=============================================="
        echo ""
    else
        log_warn "No IP address assigned!"
        log_info "Run: sudo /opt/drone/scripts/fix-network.sh"
    fi
}

# Step 2: Check and install SSH
check_ssh_installed() {
    log_info "Checking SSH installation..."

    if command -v sshd &>/dev/null; then
        log_success "SSH server installed"
        return 0
    fi

    log_warn "SSH server not installed, installing..."
    apt-get update
    apt-get install -y openssh-server

    if command -v sshd &>/dev/null; then
        log_success "SSH server installed"
    else
        log_error "Failed to install SSH server"
        return 1
    fi
}

# Step 3: Check SSH service
check_ssh_service() {
    log_info "Checking SSH service..."

    # Check if running
    if systemctl is-active --quiet ssh; then
        log_success "SSH service is running"
    else
        log_warn "SSH service is not running, starting..."
        systemctl start ssh
        sleep 2

        if systemctl is-active --quiet ssh; then
            log_success "SSH service started"
        else
            log_error "Failed to start SSH service"
            log_info "Checking logs:"
            journalctl -u ssh -n 20 --no-pager
            return 1
        fi
    fi

    # Enable for boot
    if systemctl is-enabled --quiet ssh 2>/dev/null; then
        log_success "SSH enabled for boot"
    else
        log_warn "Enabling SSH for boot..."
        systemctl enable ssh
        log_success "SSH enabled"
    fi
}

# Step 4: Check SSH is listening
check_ssh_listening() {
    log_info "Checking if SSH is listening on port 22..."

    # Check what's listening on port 22
    LISTENING=$(ss -tlnp 2>/dev/null | grep :22 || netstat -tlnp 2>/dev/null | grep :22 || echo "")

    if [ -n "$LISTENING" ]; then
        log_success "SSH is listening:"
        echo "  $LISTENING"

        # Check if listening on all interfaces or specific
        if echo "$LISTENING" | grep -q "0.0.0.0:22"; then
            log_success "SSH listening on all interfaces (0.0.0.0:22)"
        elif echo "$LISTENING" | grep -q "127.0.0.1:22"; then
            log_warn "SSH only listening on localhost (127.0.0.1:22)"
            log_info "This will block external connections!"
            fix_ssh_config
        else
            log_success "SSH listening on specific IP"
        fi
    else
        log_error "SSH is not listening on port 22!"
        return 1
    fi
}

# Step 5: Fix SSH configuration
fix_ssh_config() {
    log_info "Fixing SSH configuration..."

    SSH_CONFIG="/etc/ssh/sshd_config"

    # Backup
    if [ -f "$SSH_CONFIG" ]; then
        cp "$SSH_CONFIG" "$SSH_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "Backup created: $SSH_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    # Ensure SSH listens on all interfaces
    if grep -q "^ListenAddress 127.0.0.1" "$SSH_CONFIG" 2>/dev/null; then
        log_info "Removing localhost-only restriction..."
        sed -i 's/^ListenAddress 127.0.0.1/#ListenAddress 127.0.0.1/' "$SSH_CONFIG"
    fi

    # Add ListenAddress 0.0.0.0 if not present
    if ! grep -q "ListenAddress 0.0.0.0" "$SSH_CONFIG" 2>/dev/null; then
        log_info "Adding ListenAddress 0.0.0.0..."
        echo "ListenAddress 0.0.0.0" >> "$SSH_CONFIG"
    fi

    # Ensure Port 22
    if grep -q "^#Port" "$SSH_CONFIG" 2>/dev/null; then
        sed -i 's/^#Port 22/Port 22/' "$SSH_CONFIG"
    fi

    # Ensure PasswordAuthentication is allowed (for initial setup)
    if grep -q "^PasswordAuthentication no" "$SSH_CONFIG" 2>/dev/null; then
        log_warn "Password authentication was disabled, enabling..."
        sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' "$SSH_CONFIG"
    fi

    # Ensure PermitRootLogin is configured
    if ! grep -q "PermitRootLogin" "$SSH_CONFIG" 2>/dev/null; then
        echo "PermitRootLogin prohibit-password" >> "$SSH_CONFIG"
    fi

    # Restart SSH
    log_info "Restarting SSH service..."
    systemctl restart ssh
    sleep 2

    if systemctl is-active --quiet ssh; then
        log_success "SSH restarted successfully"
    else
        log_error "Failed to restart SSH"
        return 1
    fi
}

# Step 6: Check firewall
check_firewall() {
    log_info "Checking firewall..."

    # Check UFW
    if command -v ufw &>/dev/null; then
        if ufw status | grep -q "Status: active"; then
            log_info "UFW is active"

            if ufw status | grep -q "22/tcp"; then
                log_success "Port 22 allowed in UFW"
            else
                log_warn "Port 22 not allowed, adding rule..."
                ufw allow 22/tcp
                log_success "Port 22 allowed"
            fi
        else
            log_info "UFW is not active (OK)"
        fi
    fi

    # Check iptables
    IPTABLES_RULES=$(iptables -L INPUT -n 2>/dev/null | grep :22 || echo "")
    if [ -z "$IPTABLES_RULES" ]; then
        log_warn "No specific iptables rule for port 22, adding..."
        iptables -A INPUT -p tcp --dport 22 -j ACCEPT
        log_success "Added iptables rule for port 22"
    else
        log_success "Iptables allows port 22"
    fi
}

# Step 7: Check user exists
check_user() {
    log_info "Checking drone user..."

    if id "drone" &>/dev/null; then
        log_success "User 'drone' exists"
    else
        log_warn "Creating user 'drone'..."
        useradd -m -s /bin/bash drone
        echo "drone:drone2026" | chpasswd
        usermod -aG sudo drone

        # Create .ssh directory
        mkdir -p /home/drone/.ssh
        chmod 700 /home/drone/.ssh
        chown -R drone:drone /home/drone/.ssh

        log_success "User 'drone' created with password 'drone2026'"
    fi

    # Ensure .ssh directory exists with correct permissions
    if [ ! -d "/home/drone/.ssh" ]; then
        mkdir -p /home/drone/.ssh
        chmod 700 /home/drone/.ssh
        chown -R drone:drone /home/drone/.ssh
        log_success "Created /home/drone/.ssh"
    fi
}

# Step 8: Test SSH locally
test_ssh_local() {
    log_info "Testing SSH locally..."

    if nc -zv localhost 22 &>/dev/null || timeout 2 bash -c "exec 3<>/dev/tcp/localhost/22" 2>/dev/null; then
        log_success "SSH is responding on localhost:22"
    else
        log_error "SSH is not responding on localhost:22"
        return 1
    fi
}

# Main execution
main() {
    check_interface
    check_ssh_installed
    check_ssh_service
    check_ssh_listening
    check_firewall
    check_user
    test_ssh_local

    echo ""
    echo "=============================================="
    echo "  ✅ SSH Configuration Complete"
    echo "=============================================="
    echo ""

    CURRENT_IP=$(ip -br addr show | grep -v "127.0.0.1" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -n "$CURRENT_IP" ]; then
        echo "You can now connect with:"
        echo "  ssh drone@$CURRENT_IP"
        echo "  Password: drone2026"
        echo ""
        echo "Or with your SSH key:"
        echo "  ssh -i ~/.ssh/drone-beelink drone@$CURRENT_IP"
    fi

    echo ""
}

main "$@"
