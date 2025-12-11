#!/bin/bash
# AGRS ZEUS - Server Setup Script for Ubuntu 22.04
# Run as root or with sudo

set -e

echo "========================================"
echo "AGRS ZEUS Server Setup"
echo "========================================"

# Update system
echo "[1/8] Updating system packages..."
apt update && apt upgrade -y

# Install dependencies
echo "[2/8] Installing system dependencies..."
apt install -y \
    python3.12 \
    python3.12-venv \
    python3-pip \
    nodejs \
    npm \
    nginx \
    certbot \
    python3-certbot-nginx \
    git \
    curl \
    gdal-bin \
    libgdal-dev \
    supervisor

# Install Node 20.x if not already
echo "[3/8] Ensuring Node.js 20.x..."
if ! node --version | grep -q "v20"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Create app user
echo "[4/8] Creating agrs user..."
if ! id "agrs" &>/dev/null; then
    useradd -m -s /bin/bash agrs
fi

# Create directories
echo "[5/8] Creating directories..."
mkdir -p /opt/agrs
mkdir -p /opt/agrs/analytics
mkdir -p /opt/agrs/Projects
chown -R agrs:agrs /opt/agrs

echo "[6/8] Setup complete!"
echo ""
echo "========================================"
echo "NEXT STEPS (run manually):"
echo "========================================"
echo ""
echo "1. Copy your codebase to /opt/agrs/gui-v2"
echo "   scp -r /opt/agrs/gui-v2 user@server:/opt/agrs/"
echo ""
echo "2. Set up the backend:"
echo "   cd /opt/agrs/gui-v2/backend"
echo "   python3.12 -m venv venv"
echo "   source venv/bin/activate"
echo "   pip install -r requirements.txt"
echo "   cp .env.production .env"
echo "   # Edit .env with your API keys and passwords"
echo ""
echo "3. Set up the frontend:"
echo "   cd /opt/agrs/gui-v2/frontend"
echo "   npm install"
echo "   npm run build"
echo ""
echo "4. Configure Nginx:"
echo "   cp /opt/agrs/gui-v2/deploy/nginx-agrsglobal.conf /etc/nginx/sites-available/agrsglobal"
echo "   ln -s /etc/nginx/sites-available/agrsglobal /etc/nginx/sites-enabled/"
echo "   rm /etc/nginx/sites-enabled/default"
echo "   nginx -t && systemctl restart nginx"
echo ""
echo "5. Set up SSL (after DNS is configured):"
echo "   certbot --nginx -d agrsglobal.com -d www.agrsglobal.com -d api.agrsglobal.com"
echo ""
echo "6. Configure supervisor (see deploy/supervisor-agrs.conf)"
echo "   cp /opt/agrs/gui-v2/deploy/supervisor-agrs.conf /etc/supervisor/conf.d/"
echo "   supervisorctl reread && supervisorctl update"
echo ""
echo "========================================"
