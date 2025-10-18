#!/bin/bash
set -euo pipefail

# 🎯 Staging Deployment Script
# Conductores PWA - Production-ready deployment

echo "🚀 Iniciando deployment de staging..."

# 1. Frontend build check
echo "📦 Verificando build del frontend..."
if [ ! -d "dist/conductores-pwa" ]; then
    echo "❌ Build del frontend no encontrado. Ejecutando build..."
    npm run build:prod
fi

# 2. Create staging environment template
echo "🔧 Configurando ambiente de staging..."
cat > staging.env << 'ENV'
NODE_ENV=staging
PORT=3001
BFF_BASE_URL=http://localhost:3001/api
CACHE_TTL=300
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=200
ENV

# 3. Start frontend (serve production build)
echo "🌐 Iniciando frontend en modo staging..."
npx http-server dist/conductores-pwa -p 4200 -c-1 &
FRONTEND_PID=$!

echo "✅ Staging deployment completado!"
echo "📍 Frontend: http://localhost:4200"
echo "💾 PID: $FRONTEND_PID"
echo "Para detener staging: kill $FRONTEND_PID"

wait $FRONTEND_PID
