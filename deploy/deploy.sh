#!/usr/bin/env bash
# Запускается на твоём компьютере: собирает проект и выкладывает на сервер.
# Нужен вход на сервер по SSH-ключу и выполненная первичная настройка (deploy/README.md).
set -euo pipefail

HOST="${DEPLOY_HOST:-root@194.58.120.127}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Каталог RepDB и комплексы не лежат в git: без них приложение уйдёт на сервер пустым.
for f in client/src/seed/generated/catalog.json client/src/seed/generated/wods.json; do
  [ -f "$f" ] || { echo "Нет $f: выполни npm run seed:media и npm run seed:wods" >&2; exit 1; }
done

npm run build

# Данные оператора в политике и согласии должны быть заполнены (site/src/config.ts, OPERATOR).
if grep -rlF '[[' site/dist --include='*.html' >/dev/null; then
  echo "В сайте остались незаполненные данные [[…]]:" >&2
  grep -rlF '[[' site/dist --include='*.html' >&2
  exit 1
fi

rsync -az --delete client/dist/ "$HOST:/srv/hybridlog/client/"
rsync -az --delete site/dist/ "$HOST:/srv/hybridlog/site/"

# Исходники сервера и общих пакетов. node_modules и база на сервере остаются как есть.
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude '.data' \
  --exclude 'client/dist' --exclude 'site/dist' --exclude 'site/.astro' \
  --exclude 'client/public/media' --exclude 'client/src/seed/generated' \
  ./ "$HOST:/srv/hybridlog/app/"

ssh "$HOST" 'set -e
  cd /srv/hybridlog/app
  # Заголовки Node берём с самого сервера: nodejs.org оттуда может не открываться (таймаут node-gyp).
  test -f /usr/include/node/node.h || { echo "Нет /usr/include/node/node.h: переустанови nodejs из NodeSource" >&2; exit 1; }
  npm_config_nodedir=/usr npm ci --workspace server --workspace shared --include-workspace-root
  # Новый npm не запускает скрипты установки без разрешения: собираем нативный модуль явно.
  [ -f node_modules/better-sqlite3/build/Release/better_sqlite3.node ] || npm_config_nodedir=/usr npm rebuild better-sqlite3
  chown -R hybridlog:hybridlog /srv/hybridlog/app
  chmod +x deploy/backup.sh
  systemctl restart hybridlog
  sleep 2
  curl -fsS http://127.0.0.1:8787/api/health && echo'
echo "Готово."
