#!/usr/bin/env bash
# Runs on the server. Usage: deploy.sh <registry>/<repo>:<tag>
# Rollback = run it again with an older tag.
set -euo pipefail
IMAGE="$1"
REGISTRY="${IMAGE%%/*}"
REGION="$(echo "$REGISTRY" | cut -d. -f4)"
cd /opt/booklist

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

touch .env
sed -i '/^IMAGE=/d' .env
echo "IMAGE=$IMAGE" >> .env

docker compose pull app
docker compose up -d --remove-orphans
docker image prune -af --filter "until=168h"
echo "Deployed $IMAGE"
