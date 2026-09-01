#!/bin/bash
#
# Install DRONE OPS Plymouth Boot Theme
# Run this script on the Beelink server as root
#

set -e

THEME_NAME="drone-ops"
THEME_DIR="/usr/share/plymouth/themes/${THEME_NAME}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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

# Copy theme files (plymouth + script + images)
echo "🎨 Installing theme files..."
cp "${SCRIPT_DIR}/${THEME_NAME}/${THEME_NAME}.plymouth" "$THEME_DIR/"
cp "${SCRIPT_DIR}/${THEME_NAME}/${THEME_NAME}.script" "$THEME_DIR/"
# Copy logo and spinner assets if present (PNG/SVG)
for asset in "${SCRIPT_DIR}/${THEME_NAME}"/*.png "${SCRIPT_DIR}/${THEME_NAME}"/*.svg; do
    [ -f "$asset" ] && cp "$asset" "$THEME_DIR/" && echo "   → $(basename "$asset")"
done

# Set correct permissions
chmod 644 "$THEME_DIR"/*

# Update Plymouth configuration
echo "⚙️  Configuring Plymouth..."

# Set as default theme
if command -v plymouth-set-default-theme &> /dev/null; then
    plymouth-set-default-theme "$THEME_NAME" 2>/dev/null || true
else
    # Ubuntu >= 26.04 (dracut): plymouth-set-default-theme may be absent.
    # Use the alternatives system instead.
    update-alternatives --install \
        /usr/share/plymouth/themes/default.plymouth default.plymouth \
        "$THEME_DIR/${THEME_NAME}.plymouth" 200
    update-alternatives --set default.plymouth "$THEME_DIR/${THEME_NAME}.plymouth"
fi

# ── Boot splash: ensure plymouth binds i915, not simpledrm ─────────
# Symptom: logs / black screen instead of droneOps animation.
# Cause: simpledrm claims framebuffer before i915 loads (Intel iGPU).
# Fix: load i915 early in initrd + blacklist simpledrm initcall, hide logs.
echo "🔧 Configuring early KMS (i915) + hide boot logs..."

# initramfs-tools path (Ubuntu classic)
if [ -d /etc/initramfs-tools ]; then
    # Ensure i915 is loaded early in initramfs so plymouth binds i915
    if ! grep -q "^i915" /etc/initramfs-tools/modules 2>/dev/null; then
        echo "i915" >> /etc/initramfs-tools/modules
        echo "   → added i915 to /etc/initramfs-tools/modules"
    fi
    # Ensure framebuffer and most modules are included
    if [ -f /etc/initramfs-tools/initramfs.conf ]; then
        if ! grep -q "^FRAMEBUFFER=y" /etc/initramfs-tools/initramfs.conf; then
            # Ensure FRAMEBUFFER=y (remove any FRAMEBUFFER=n first)
            sed -i 's/^FRAMEBUFFER=.*/FRAMEBUFFER=y/' /etc/initramfs-tools/initramfs.conf 2>/dev/null || true
            if ! grep -q "FRAMEBUFFER=y" /etc/initramfs-tools/initramfs.conf; then
                echo "FRAMEBUFFER=y" >> /etc/initramfs-tools/initramfs.conf
            fi
        fi
        # Ensure MODULES=most so drm helpers are included
        if grep -q "^MODULES=dep" /etc/initramfs-tools/initramfs.conf 2>/dev/null; then
            sed -i 's/^MODULES=.*/MODULES=most/' /etc/initramfs-tools/initramfs.conf
            echo "   → set MODULES=most in initramfs.conf"
        fi
    fi
fi

# dracut path (Ubuntu 26.04+)
if [ -d /etc/dracut.conf.d ]; then
    cat > /etc/dracut.conf.d/50-drone-ops.conf <<'DRACUTEOF'
# DRONE OPS: ensure plymouth + i915 in initrd, avoid simpledrm flicker
add_dracutmodules+=" plymouth drm "
add_drivers+=" i915 "
install_items+=" /usr/share/plymouth/themes/drone-ops/* "
install_items+=" /usr/share/plymouth/themes/drone-ops/drone-ops-logo.png "
install_items+=" /usr/share/plymouth/themes/drone-ops/spinner-ring.png "
hostonly="no"
DRACUTEOF
    echo "   → wrote /etc/dracut.conf.d/50-drone-ops.conf"
fi

# initramfs-tools hook: ensure custom theme files are copied to initramfs
# The stock plymouth hook only handles ubuntu-text/details, so we add a dedicated hook.
if [ -d /etc/initramfs-tools/hooks ]; then
    cat > /etc/initramfs-tools/hooks/zz-drone-ops-plymouth <<'HOOK'
#!/bin/sh
set -e
PREREQ=""
prereqs() { echo "$PREREQ"; }
case "$1" in prereqs) prereqs; exit 0;; esac
. /usr/share/initramfs-tools/hook-functions
# Force-include drone-ops theme assets (script + PNGs) into initramfs
if [ -d /usr/share/plymouth/themes/drone-ops ]; then
    mkdir -p "${DESTDIR}/usr/share/plymouth/themes/drone-ops"
    cp -a /usr/share/plymouth/themes/drone-ops/* "${DESTDIR}/usr/share/plymouth/themes/drone-ops/" 2>/dev/null || true
fi
HOOK
    chmod +x /etc/initramfs-tools/hooks/zz-drone-ops-plymouth
    echo "   → installed /etc/initramfs-tools/hooks/zz-drone-ops-plymouth"
fi

# Speed up boot: offline AP never has internet, so don't wait 20s for it
echo "⚡ Optimizing boot time (mask slow online wait)..."
systemctl mask systemd-networkd-wait-online.service 2>/dev/null || true
systemctl disable NetworkManager-wait-online.service 2>/dev/null || true
systemctl disable motd-news.timer 2>/dev/null || true
systemctl disable motd-news.service 2>/dev/null || true
systemctl mask motd-news.service 2>/dev/null || true || true
echo "   → masked systemd-networkd-wait-online, motd-news"

# Update GRUB to show only splash (no logs), and blacklist simpledrm
echo "📝 Updating GRUB configuration..."
if grep -q "GRUB_CMDLINE_LINUX_DEFAULT" /etc/default/grub; then
    cp /etc/default/grub /etc/default/grub.backup.$(date +%Y%m%d)

    # Desired cmdline: quiet splash + hide cursor + hide systemd logs + blacklist simpledrm
    GRUB_SPLASH='quiet splash vt.global_cursor_default=0 loglevel=3 systemd.show_status=false udev.log_level=3 initcall_blacklist=simpledrm_platform_driver_init'

    # Replace the line (preserve existing if already contains quiet splash, just ensure blacklist present)
    sed -i "s/GRUB_CMDLINE_LINUX_DEFAULT=\".*\"/GRUB_CMDLINE_LINUX_DEFAULT=\"${GRUB_SPLASH}\"/" /etc/default/grub

    sed -i 's/#GRUB_GFXMODE/GRUB_GFXMODE/' /etc/default/grub
    sed -i 's/GRUB_GFXMODE=.*/GRUB_GFXMODE=auto/' /etc/default/grub
    # Hide GRUB menu for kiosk (timeout 0)
    if grep -q "^GRUB_TIMEOUT=" /etc/default/grub; then
        sed -i 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=0/' /etc/default/grub
    fi
    if grep -q "^GRUB_TIMEOUT_STYLE=" /etc/default/grub; then
        sed -i 's/^GRUB_TIMEOUT_STYLE=.*/GRUB_TIMEOUT_STYLE=hidden/' /etc/default/grub
    fi

    update-grub
    echo "✅ GRUB updated → $GRUB_SPLASH"
else
    echo "⚠️  Could not find GRUB_CMDLINE_LINUX_DEFAULT, manual configuration may be needed"
fi

# Update initramfs to include plymouth + theme + i915 (critical: without this,
# plymouth only starts late from the real root and boot text shows)
echo "🔄 Updating initramfs..."
if command -v dracut &> /dev/null; then
    # dracut (Ubuntu 26.04) - regenerate with new theme assets
    dracut -f --regenerate-all 2>/dev/null || dracut -f 2>/dev/null || true
fi
# Always also run update-initramfs for initramfs-tools path
update-initramfs -u -k all 2>/dev/null || true

# Verify plymouth made it into the initramfs
INITRD="/boot/initrd.img-$(uname -r)"
if command -v lsinitrd &> /dev/null && [ -f "$INITRD" ]; then
    COUNT=$(lsinitrd "$INITRD" | grep -ci plymouth || true)
    if [ "$COUNT" -eq 0 ]; then
        echo "❌ ERROR: plymouth is NOT in the initramfs - splash will not show at boot"
        echo "   Check /etc/dracut.conf.d/ contains: add_dracutmodules+=\" plymouth drm \""
        exit 1
    else
        echo "✅ plymouth found in initramfs ($COUNT files)"
    fi
    # Verify i915 also present
    if lsinitrd "$INITRD" 2>/dev/null | grep -qi "i915"; then
        echo "✅ i915 found in initramfs (early KMS enabled)"
    else
        echo "⚠️  i915 NOT in initramfs — plymouth may still bind simpledrm"
    fi
    # Verify theme PNGs are in initramfs (early splash needs them before root mount)
    if lsinitrd "$INITRD" 2>/dev/null | grep -qi "drone-ops-logo"; then
        echo "✅ drone-ops theme assets found in initramfs"
    else
        echo "⚠️  drone-ops PNGs NOT in initramfs — early boot will fallback to text"
        echo "   (If dracut, check /etc/dracut.conf.d/50-drone-ops.conf install_items)"
        lsinitrd "$INITRD" 2>/dev/null | grep -i "drone-ops" || echo "   (no drone-ops files in initramfs)"
    fi
fi
# Fallback check via lsinitramfs (initramfs-tools)
if command -v lsinitramfs &> /dev/null && [ -f "$INITRD" ]; then
    if lsinitramfs "$INITRD" 2>/dev/null | grep -qi "drone-ops-logo"; then
        echo "✅ drone-ops assets also in initramfs-tools image"
    fi
fi

# Test the theme
echo ""
echo "🎬 Testing theme (10 seconds)..."
plymouthd --debug --debug-file=/tmp/plymouth-debug.log 2>/dev/null || true
plymouth --show-splash 2>/dev/null &
sleep 10 2>/dev/null || true
plymouth --quit 2>/dev/null || true

echo ""
echo "=============================================="
echo "  ✅ Plymouth Theme Installation Complete!"
echo "=============================================="
echo ""
echo "The DRONE OPS theme will now display at boot (replaces logs/black screen)."
echo "Boot splash uses i915 early KMS (simpledrm blacklisted)."
echo ""
echo "To test:"
echo "  sudo plymouthd && sudo plymouth --show-splash"
echo "  sleep 5"
echo "  sudo plymouth --quit"
echo ""
echo "To change back to Ubuntu theme:"
echo "  sudo plymouth-set-default-theme ubuntu-logo -R"
echo ""
