#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
PHP_BIN="${PHP_BIN:-/opt/alt/php84/usr/bin/php}"
COMPOSER_BIN="${COMPOSER_BIN:-/usr/local/bin/composer}"
cd "$APP_DIR"

echo "==> Pull latest code"
git fetch origin master
git reset --hard origin/master

echo "==> Backend setup"
cd backend
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i 's|^APP_ENV=.*|APP_ENV=production|' .env
  sed -i 's|^APP_DEBUG=.*|APP_DEBUG=false|' .env
  sed -i 's|^APP_URL=.*|APP_URL=https://clubapp.jazinfotech.com|' .env
  sed -i 's|^DB_HOST=.*|DB_HOST=localhost|' .env
  sed -i 's|^DB_DATABASE=.*|DB_DATABASE=u695058213_clubapp|' .env
  sed -i 's|^DB_USERNAME=.*|DB_USERNAME=u695058213_clubapp|' .env
  sed -i 's|^DB_PASSWORD=.*|DB_PASSWORD=U695058213_clubapp|' .env
  grep -q '^FRONTEND_URL=' .env && sed -i 's|^FRONTEND_URL=.*|FRONTEND_URL=https://clubapp.jazinfotech.com|' .env || echo 'FRONTEND_URL=https://clubapp.jazinfotech.com' >> .env
  $PHP_BIN artisan key:generate --force
fi

$PHP_BIN $COMPOSER_BIN install --no-dev --optimize-autoloader --no-interaction
$PHP_BIN artisan migrate --force || echo "WARNING: migrate failed — create MySQL database in hPanel first"
$PHP_BIN artisan db:seed --force || true
$PHP_BIN artisan config:cache
$PHP_BIN artisan route:cache
cd ..

echo "==> Frontend build"
export VITE_API_URL="https://clubapp.jazinfotech.com/api"
npm ci --no-audit --no-fund
npm run build

echo "==> Publish static assets"
cp -r dist/client/* .
chmod 644 .htaccess 2>/dev/null || true

echo "==> Fix permissions"
chmod -R u+rwX backend/storage backend/bootstrap/cache

echo "==> Deploy complete"
