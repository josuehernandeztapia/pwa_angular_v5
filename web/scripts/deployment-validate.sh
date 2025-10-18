#!/usr/bin/env bash
# Deployment validation helper
# Usage: ./scripts/deployment-validate.sh [--skip-tests]

set -euo pipefail

SKIP_TESTS=false
for arg in "$@"; do
  case "$arg" in
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

RUNTIME_ENV=${RUNTIME_ENV:-${NODE_ENV:-qa}}
export RUNTIME_ENV

echo "[deploy] Validating runtime configuration for $RUNTIME_ENV"
npm run validate:runtime-config

echo "[deploy] Running lint"
npm run lint

if [ "$SKIP_TESTS" = false ]; then
  echo "[deploy] Running unit tests"
  KARMA_PORT=${KARMA_PORT:-0} npm run test:unit || {
    echo "[deploy] Unit tests failed" >&2
    exit 1
  }
else
  echo "[deploy] Skipping unit tests"
fi

echo "[deploy] Building production bundle"
npm run build:prod

echo "[deploy] Running PWA smoke"
npm run smoke:pwa

echo "[deploy] Validation complete"
