# eGalax Touch Calibration

Calibrated 2026-08-25 on Beelink S12 / 1024x768 HDMI-A-2 with eGalax 0eef:0001.

33 taps via /calibrate (11 targets ×3 runs) gave linear fit err <5px:
- exp = 1.6705*client -374.8 (X)
- exp = 1.7434*client -290.8 (Y)
Relative (keypad 320x368 at 352,314): exp_rel = 1.6856*client_rel -0.4367 / 1.7401*client_rel +0.0285

Install:
```
sudo mkdir -p /etc/libinput
sudo cp config/egalax-calibration/local-overrides.quirks /etc/libinput/local-overrides.quirks
sudo cp config/egalax-calibration/99-egalax-calibration.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
# reboot or sudo pkill -9 cage
```

Software fallback in PinScreen.jsx keeps visual-nearest with same matrix (CAL_REL) so pin works even without hardware fix.
