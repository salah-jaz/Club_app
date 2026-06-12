#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
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
  sed -i 's|^FRONTEND_URL=.*|FRONTEND_URL=https://clubapp.jazinfotech.com|' .env || echo 'FRONTEND_URL=https://clubapp.jazinfotech.com' >> .env
  php artisan key:generate --force
fi

composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan db:seed --force || true
php artisan config:cache
php artisan route:cache
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
