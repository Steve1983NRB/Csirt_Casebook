#!/bin/sh
set -eu

DATA="${CASEBOOK_DATA:-/data}"
mkdir -p "$DATA/state" "$DATA/runtime"

# The bootstrap token creates the first administrator. Keep it stable across restarts.
TOKEN_FILE="$DATA/initial-admin-token"
if [ -z "${INITIAL_ADMIN_TOKEN:-}" ]; then
  if [ ! -s "$TOKEN_FILE" ]; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "Generated a first-administrator token, stored in $TOKEN_FILE inside the data volume."
    echo "Read it with: docker compose exec casebook cat $TOKEN_FILE"
  fi
  INITIAL_ADMIN_TOKEN="$(cat "$TOKEN_FILE")"
fi
if [ "${#INITIAL_ADMIN_TOKEN}" -lt 32 ]; then
  echo "INITIAL_ADMIN_TOKEN must be at least 32 characters." >&2
  exit 1
fi

# Optional corporate TLS-inspection roots: drop *.pem files in docker/ca/ (mounted at /certs).
if ls /certs/*.pem >/dev/null 2>&1; then
  BUNDLE="$DATA/ca-bundle.pem"
  { [ -f /etc/ssl/certs/ca-certificates.crt ] && cat /etc/ssl/certs/ca-certificates.crt; cat /certs/*.pem; } > "$BUNDLE"
  export SSL_CERT_FILE="$BUNDLE" NODE_EXTRA_CA_CERTS="$BUNDLE"
  echo "Using extra trusted certificates from /certs."
fi

VARS=/app/dist/server/.dev.vars
umask 077
{
  printf 'INITIAL_ADMIN_TOKEN=%s\n' "$INITIAL_ADMIN_TOKEN"
  for name in SOCRADAR_PREMIUM_FEEDS_API_KEY SOCRADAR_COMPANY_ID SOCRADAR_API_ROOT ABUSECH_AUTH_KEY MISP_API_ROOT MISP_API_KEY TAXII_API_ROOT TAXII_TOKEN TAXII_USERNAME TAXII_PASSWORD; do
    eval "value=\${$name:-}"
    if [ -n "$value" ]; then printf '%s=%s\n' "$name" "$value"; fi
  done
} > "$VARS"

cd /app
exec node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev \
  --config dist/server/wrangler.json --local --persist-to "$DATA/state" \
  --ip 0.0.0.0 --port 5173 --inspector-port 0
