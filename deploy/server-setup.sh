#!/usr/bin/env bash
# One-time setup of a fresh Amazon Linux 2023 instance. Run as root:
#   sudo bash server-setup.sh
set -euo pipefail

dnf install -y docker
systemctl enable --now docker

# Docker Compose v2 plugin (not packaged for AL2023)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version

# SQLite lives here; uid 1000 is the `node` user inside the image
mkdir -p /data/booklist
chown 1000:1000 /data/booklist

mkdir -p /opt/booklist
chmod 700 /opt/booklist
echo "Done. Now create /opt/booklist/app.env and /opt/booklist/.env (see docs/deploy-aws.md)."
