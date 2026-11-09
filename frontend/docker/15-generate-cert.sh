#!/bin/sh
# Runs from the nginx image's /docker-entrypoint.d before nginx starts.
# Creates a self-signed certificate for local HTTPS if none is mounted.
set -eu
CERT_DIR=/etc/nginx/certs
if [ ! -f "$CERT_DIR/key.pem" ] || [ ! -f "$CERT_DIR/cert.pem" ]; then
  echo "[15-generate-cert] Generating self-signed certificate for localhost"
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
    -subj "/C=ZA/O=HustleHub/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
  chmod 600 "$CERT_DIR/key.pem"
fi
