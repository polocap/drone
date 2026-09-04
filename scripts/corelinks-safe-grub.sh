#!/bin/sh
# coreLinks — entrée GRUB de secours : image boot générique éprouvée.
# Visible via le menu GRUB (affiché automatiquement après un boot raté,
# recordfail). Généré pour le Beelink (root LVM Ubuntu).
cat <<'EOF'
menuentry 'coreLinks (safe boot image)' {
	load_video
	insmod gzio
	insmod part_gpt
	insmod lvm
	linux /vmlinuz-7.0.0-14-generic root=/dev/mapper/ubuntu--vg-ubuntu--lv ro quiet splash
	initrd /boot/initrd-272mb-backup
}
EOF
