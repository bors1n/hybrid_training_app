# Деплой на VPS (Ubuntu 24.04, reg.ru)

Схема: Caddy раздаёт статику и сам получает HTTPS-сертификаты, `/api` проксирует на Node-сервер (`127.0.0.1:8787`), база — файл SQLite.

| Адрес | Что | Откуда |
|---|---|---|
| `hybridtraining.ru` | сайт Hybrid Training Russia | `/srv/hybridlog/site` |
| `www.hybridtraining.ru` | редирект на сайт | — |
| `app.hybridtraining.ru` | приложение HybridLog и `/api` | `/srv/hybridlog/client`, сервер на :8787 |

Файлы на сервере: код — `/srv/hybridlog/app`, база — `/var/lib/hybridlog/hybridlog.db`, копии — `/var/backups/hybridlog`, настройки — `/etc/hybridlog.env`.

Команды `ssh` выполняются на сервере, `локально` — на твоём компьютере. Конфиги и скрипты не проверялись на реальном сервере: если шаг падает, пришли вывод.

## 0. До начала

В DNS (reg.ru → домен → управление зоной) A-записи `@`, `www` и `app` указывают на `194.58.120.127`, лишних A и AAAA-записей нет. Проверка: `dig +short hybridtraining.ru app.hybridtraining.ru @ns1.reg.ru` — везде один адрес.

## 1. Вход по ключу (локально)

```bash
ssh-keygen -t ed25519 -C "hybridlog-deploy"      # если ключа ещё нет
ssh-copy-id root@194.58.120.127
ssh root@194.58.120.127                           # должен пускать без пароля
```

Когда вход по ключу работает, отключи вход по паролю: в `/etc/ssh/sshd_config.d/50-cloud-init.conf` и `/etc/ssh/sshd_config` должно быть `PasswordAuthentication no`, затем `systemctl restart ssh`. Не закрывай текущую сессию, пока не проверишь вход во второй.

## 2. Базовая настройка (ssh)

```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban sqlite3 rsync curl build-essential python3 debian-keyring debian-archive-keyring apt-transport-https gpg

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban
```

## 3. Node 24 и Caddy (ssh)

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node -v        # v24.x

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

## 4. Пользователь и каталоги (ssh)

```bash
useradd --system --home /srv/hybridlog --shell /usr/sbin/nologin hybridlog
mkdir -p /srv/hybridlog/{app,client,site} /var/lib/hybridlog /var/backups/hybridlog
chown -R hybridlog:hybridlog /srv/hybridlog /var/lib/hybridlog
chmod 700 /var/backups/hybridlog
```

## 5. Настройки (ssh)

Скопируй `deploy/hybridlog.env.example` в `/etc/hybridlog.env` (через `nano` или `scp`), заполни `AUTH_SECRET` значением из `openssl rand -hex 32`, остальное пока оставь.

```bash
chown root:root /etc/hybridlog.env && chmod 600 /etc/hybridlog.env
```

## 6. Первая выкладка (локально)

```bash
./deploy/deploy.sh
```

Перед первой выкладкой на этом компьютере один раз выполни `npm run seed:media` и `npm run seed:wods`: каталог RepDB и комплексы не лежат в git, без них приложение будет пустым (скрипт откажется выкладывать). Скрипт собирает проект, выкладывает клиент, сайт и сервер и перезапускает сервис. На первом запуске перезапуск упадёт, потому что сервиса ещё нет: это нормально, перейди к шагу 7 и повтори `./deploy/deploy.sh`.

## 7. Сервис, Caddy и копии (ssh)

```bash
cd /srv/hybridlog/app/deploy
cp hybridlog.service hybridlog-backup.service hybridlog-backup.timer /etc/systemd/system/
cp Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now hybridlog
systemctl enable --now hybridlog-backup.timer
systemctl reload caddy
```

После этого повтори `./deploy/deploy.sh` на своём компьютере: последняя строка вывода должна быть `{"ok":true,"service":"hybridlog"}`.

## 8. Проверка

- `https://hybridtraining.ru` открывает сайт, `https://www.hybridtraining.ru` перенаправляет на него.
- `https://app.hybridtraining.ru/api/health` отвечает `{"ok":true,"service":"hybridlog"}`.
- `https://app.hybridtraining.ru` открывает приложение. Вход по коду: пока `SMTP_URL` пуст, код печатается в журнал сервера: `journalctl -u hybridlog -n 20`. Для настоящей почты задай `SMTP_URL` в `/etc/hybridlog.env` и выполни `systemctl restart hybridlog`.
- Копия базы: `systemctl start hybridlog-backup.service`, затем `ls /var/backups/hybridlog`.

Если сертификат не выпускается: `journalctl -u caddy -n 50`. Чаще всего дело в DNS (запись ещё не обновилась) или закрытых портах 80 и 443.

## Обновление

На своём компьютере: `./deploy/deploy.sh`. База не затрагивается, миграции применяются при старте сервиса.

## Что остаётся открытым

- Копия базы вне сервера: задай `BACKUP_REMOTE` (rsync на другой сервер или хранилище). Пока пусто, копии лежат только на этом VPS.
- Почта: инструкция в `deploy/MAIL.md`. Данные оператора в `site/src/config.ts` (`OPERATOR`) и уведомление в Роскомнадзор (`docs/legal/rkn-notification.md`): до открытия приложения людям; `deploy.sh` не выложит сайт, пока в политике остались `[[…]]`.
