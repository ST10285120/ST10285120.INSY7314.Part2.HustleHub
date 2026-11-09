#!/bin/sh
set -eu

: "${SSL_KEY_PATH:=/app/certs/key.pem}"
: "${SSL_CERT_PATH:=/app/certs/cert.pem}"
export SSL_KEY_PATH SSL_CERT_PATH

# Use a mounted certificate if there is one; otherwise create a self-signed
# one for local use. The private key is generated inside the running
# container (stored in a volume), never baked into the image.
if [ ! -f "$SSL_KEY_PATH" ] || [ ! -f "$SSL_CERT_PATH" ]; then
  echo "[entrypoint] No TLS certificate found - generating a self-signed one for local use."
  mkdir -p "$(dirname "$SSL_KEY_PATH")"
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout "$SSL_KEY_PATH" -out "$SSL_CERT_PATH" \
    -subj "/C=ZA/O=HustleHub/CN=api" \
    -addext "subjectAltName=DNS:api,DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
  chmod 600 "$SSL_KEY_PATH"
fi

exec "$@"
