#!/usr/bin/env bash
# Generates a self-signed SSL certificate for local HTTPS development.
# NOT for production use - browsers/clients will show a trust warning,
# which is expected and fine for local testing / Postman.

set -e

CERT_DIR="$(dirname "$0")/../certs"
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/key.pem" ] && [ -f "$CERT_DIR/cert.pem" ]; then
  echo "Certificate already exists at $CERT_DIR. Delete key.pem/cert.pem first to regenerate."
  exit 0
fi

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -days 365 \
  -subj "/C=ZA/ST=Gauteng/L=Local/O=HustleHub/OU=Dev/CN=localhost"

echo "Self-signed certificate generated in $CERT_DIR"
echo "Remember: in Postman, disable 'SSL certificate verification' under Settings for local testing."
