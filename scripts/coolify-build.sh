#!/bin/sh
# Coolify build script - generates docker-compose.override.yaml with Traefik labels
# and pulls prebuilt images from Gitea registry (no building needed)
# Called by Coolify's custom build command with CUSTOM_DOMAIN and APP_UUID env vars

set -e

if [ -z "$CUSTOM_DOMAIN" ] || [ -z "$APP_UUID" ]; then
  echo "Error: CUSTOM_DOMAIN and APP_UUID must be set"
  exit 1
fi

# Get the project name from the current directory (used by docker-compose for network naming)
PROJECT_NAME=$(basename "$(pwd)")
NETWORK_NAME="${PROJECT_NAME}_app-network"

echo "Generating Traefik labels for domain: $CUSTOM_DOMAIN"
echo "Project: $PROJECT_NAME, Network: $NETWORK_NAME"

cat > docker-compose.override.yaml << EOF
services:
  frontend:
    labels:
      - traefik.enable=true
      - "traefik.http.routers.frontend-${APP_UUID}.rule=Host(\`${CUSTOM_DOMAIN}\`)"
      - traefik.http.routers.frontend-${APP_UUID}.entryPoints=http
      - traefik.http.services.frontend-${APP_UUID}.loadbalancer.server.port=80
      - traefik.docker.network=${NETWORK_NAME}
EOF

echo "Generated docker-compose.override.yaml:"
cat docker-compose.override.yaml

echo "Pulling prebuilt images from Gitea registry..."
docker compose --env-file /artifacts/build-time.env -f docker-compose.prebuilt.yaml pull

echo "Images pulled successfully"
