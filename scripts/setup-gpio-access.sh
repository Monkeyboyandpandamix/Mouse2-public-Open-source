#!/bin/bash
# Setup GPIO access without requiring sudo
# Run this script once with sudo to configure the Raspberry Pi

echo "=========================================="
echo "GPIO Access Setup for M.O.U.S.E GCS"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run this script with sudo:"
    echo "  sudo ./setup-gpio-access.sh"
    exit 1
fi

# Get the current user (the one who called sudo)
ACTUAL_USER="${SUDO_USER:-$USER}"

echo "Setting up GPIO access for user: $ACTUAL_USER"
echo ""

# Method 1: Add user to gpio group
echo "[1/4] Adding user to gpio group..."
if getent group gpio > /dev/null 2>&1; then
    usermod -aG gpio "$ACTUAL_USER"
    echo "  ✓ User added to gpio group"
else
    groupadd gpio
    usermod -aG gpio "$ACTUAL_USER"
    echo "  ✓ Created gpio group and added user"
fi

# Method 2: Install and configure pigpio daemon (recommended)
echo ""
echo "[2/4] Installing pigpio daemon..."
if command -v pigpiod &> /dev/null; then
    echo "  ✓ pigpio already installed"
else
    apt-get update -qq
    apt-get install -y pigpio python3-pigpio
    echo "  ✓ pigpio installed"
fi

# Enable pigpio daemon to start on boot
echo ""
echo "[3/4] Enabling pigpio daemon on boot..."
systemctl enable pigpiod
systemctl start pigpiod
echo "  ✓ pigpio daemon enabled and started"

# Method 3: Set up udev rules for GPIO access
echo ""
echo "[4/4] Setting up udev rules for GPIO..."
cat > /etc/udev/rules.d/99-gpio.rules << 'EOF'
# Allow GPIO access for gpio group
SUBSYSTEM=="bcm2835-gpiomem", KERNEL=="gpiomem", GROUP="gpio", MODE="0660"
SUBSYSTEM=="gpio", KERNEL=="gpiochip*", ACTION=="add", PROGRAM="/bin/sh -c 'chown root:gpio /sys/class/gpio/export /sys/class/gpio/unexport ; chmod 220 /sys/class/gpio/export /sys/class/gpio/unexport'"
SUBSYSTEM=="gpio", KERNEL=="gpio*", ACTION=="add", PROGRAM="/bin/sh -c 'chown root:gpio /sys%p/active_low /sys%p/direction /sys%p/edge /sys%p/value ; chmod 660 /sys%p/active_low /sys%p/direction /sys%p/edge /sys%p/value'"
EOF

# Reload udev rules
udevadm control --reload-rules
udevadm trigger
echo "  ✓ udev rules configured"

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Important: You must log out and log back in for"
echo "group changes to take effect."
echo ""
echo "To verify setup, run:"
echo "  python3 scripts/servo_control.py status --json"
echo ""
echo "The servo can now be controlled without sudo using:"
echo "  python3 scripts/servo_control.py open"
echo "  python3 scripts/servo_control.py close"
echo "  python3 scripts/servo_control.py angle --value 90"
echo ""
