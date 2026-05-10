#!/bin/sh
set -e

# NEXT_PUBLIC_* vars are inlined into the JS bundle at build time.
# This script rewrites the bundle at container start so that runtime
# env vars (e.g. from a Kubernetes ConfigMap) actually take effect.

find /app/.next -type f -name "*.js" | xargs sed -i \
  -e "s|__NEXT_PUBLIC_API_URL__|${NEXT_PUBLIC_API_URL:-http://localhost:8000}|g" \
  -e "s|__NEXT_PUBLIC_MODE__|${NEXT_PUBLIC_MODE:-local}|g"

exec "$@"
