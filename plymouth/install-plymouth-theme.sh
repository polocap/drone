#!/bin/bash
#
# Install DRONE OPS Plymouth Boot Theme
# Run this script on the Beelink server as root
#

set -e

THEME_NAME="drone-ops"
THEME_DIR="/usr/share/plymouth/themes/${THEME_NAME}"

echo "=============================================="
echo "  Installing DRONE OPS Plymouth Theme"
echo "=============================================="
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root"
    echo "   sudo bash $0"
    exit 1
fi

# Install plymouth if not present
echo "📦 Checking Plymouth installation..."
if ! command -v plymouth &> /dev/null; then
    apt-get update
    apt-get install -y plymouth plymouth-themes
    echo "✅ Plymouth installed"
else
    echo "✅ Plymouth already installed"
fi

# Create theme directory
echo "📁 Creating theme directory..."
mkdir -p "$THEME_DIR"

# Copy theme files
echo "🎨 Installing theme files..."
cp "${THEME_NAME}/${THEME_NAME}.plymouth" "$THEME_DIR/"
cp "${THEME_NAME}/${THEME_NAME}.script" "$THEME_DIR/"

# Set correct permissions
chmod 644 "$THEME_DIR"/*

# Update Plymouth configuration
echo "⚙️  Configuring Plymouth..."

# Set as default theme
plymouth-set-default-theme -R "$THEME_NAME"

# Update initramfs to include theme
echo "🔄 Updating initramfs..."
update-initramfs -u -k all

# Update grub to show boot splash
echo "📝 Updating GRUB configuration..."
if grep -q "GRUB_CMDLINE_LINUX_DEFAULT" /etc/default/grub; then
    # Backup original
    cp /etc/default/grub /etc/default/grub.backup.$(date +%Y%m%d)

    # Update grub config to show splash
    sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT=".*"/GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"/' /etc/default/grub
    sed -i 's/#GRUB_GFXMODE/GRUB_GFXMODE/' /etc/default/grub
    sed -i 's/GRUB_GFXMODE=.*/GRUB_GFXMODE=auto/' /etc/default/grub

    update-grub
    echo "✅ GRUB updated"
else
    echo "⚠️  Could not find GRUB_CMDLINE_LINUX_DEFAULT, manual configuration may be needed"
fi

# Enable Plymouth on boot
echo "🔧 Enabling Plymouth on boot..."
if [ -f /etc/initramfs-tools/initramfs.conf ]; then
    if ! grep -q "FRAMEBUFFER=y" /etc/initramfs-tools/initramfs.conf; then
        echo "FRAMEBUFFER=y" >> /etc/initramfs-tools/initramfs.conf
    fi
fi

# Test the theme
echo ""
echo "🎬 Testing theme (10 seconds)..."
plymouthd --debug --debug-file=/tmp/plymouth-debug.log
plymouth --show-splash &
sleep 10
plymouth --quit

echo ""
echo "=============================================="
echo "  ✅ Plymouth Theme Installation Complete!"
echo "=============================================="
echo ""
echo "The DRONE OPS theme will now display at boot."
echo ""
echo "To test:"
echo "  sudo plymouthd && sudo plymouth --show-splash"
echo "  sleep 5"
echo "  sudo plymouth --quit"
echo ""
echo "To change back to Ubuntu theme:"
echo "  sudo plymouth-set-default-theme ubuntu-logo -R"
echo ""
