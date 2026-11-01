# Почта для кодов входа (Unisender Go)

Код входа уходит с сервера по SMTP. Нужен сервис отправки и три записи в DNS домена, чтобы письма не попадали в спам у Mail.ru и Яндекса.

Точные адреса и названия кнопок в кабинете Unisender Go могут отличаться от описанных ниже: я не нашёл публичной документации с этими значениями. Ориентируйся на подсказки кабинета и справку go.unisender.ru.

## 1. Аккаунт и домен

1. Зарегистрируйся на go.unisender.ru, подтверди почту и телефон.
2. В разделе с доменами отправителя добавь `hybridtraining.ru`. Кабинет покажет записи, которые нужно добавить в DNS: **SPF** и **DKIM** (иногда ещё запись подтверждения домена).

## 2. Записи в DNS (reg.ru)

В reg.ru: Домены → hybridtraining.ru → «DNS-серверы и управление зоной». В поле «Имя» пиши только часть до домена (`@`, `gokey._domainkey`, `_dmarc`, `track`), без `.hybridtraining.ru`: полное имя превратится в `….hybridtraining.ru.hybridtraining.ru`.

Записи выдаёт кабинет Unisender Go, значения копируй оттуда. Примерно так (значения — пример):

| Имя | Тип | Значение |
|---|---|---|
| `@` | TXT | `v=spf1 include:spf.unisender.ru ~all`. Должна быть одна SPF-запись; если `v=spf1 …` уже есть, допиши в неё `include:` вместо второй записи |
| `@` | TXT | `unisender-go-validate-hash=…` подтверждение домена; рядом с SPF допустимо |
| `gokey._domainkey` | TXT | `v=DKIM1; k=rsa; p=…` DKIM целиком, без переносов |
| `_dmarc` | CNAME | `hybridtraining.ru.dmarc.unisender.ru.`. Политику ведёт Unisender. Свою TXT-запись `_dmarc` не добавляй: у имени не может быть и CNAME, и TXT |
| `track` | NS ×3 | `uns1.unisender.com.`, `uns2.unisender.com.`, `uns3.unisender.com.` **Обязательны**: без домена отслеживания Unisender Go отклоняет отправку (код 229, «Custom backend domain or tracking domain required for sending») |

Проверка после обновления зоны (до часа): в кабинете сервиса домен получает статус «подтверждён»; снаружи — `dig +short TXT hybridtraining.ru @ns1.reg.ru`, `dig +short TXT gokey._domainkey.hybridtraining.ru @ns1.reg.ru` и `dig +short CNAME _dmarc.hybridtraining.ru @ns1.reg.ru`.

## 3. Данные для SMTP

По документации Unisender Go ([godocs.unisender.ru/smtp-api](https://godocs.unisender.ru/smtp-api)):

- **Хост:** `smtp.go1.unisender.ru` или `smtp.go2.unisender.ru` — по тому, на каком адресе кабинета ты зарегистрирован (`go1.unisender.ru` или `go2.unisender.ru`).
- **Порт:** 465 (шифрование сразу) или 587 (STARTTLS); соединение только по TLS.
- **Логин:** ID аккаунта в Unisender Go (по сторонним инструкциям; проверь в кабинете).
- **Пароль:** смотри в разделе SMTP или API-ключей кабинета; я его в открытых источниках не подтвердил.

Адрес отправителя должен быть на подтверждённом домене, например `no-reply@hybridtraining.ru`.

На сервере в `/etc/hybridlog.env`:

```
SMTP_URL=smtps://ЛОГИН:ПАРОЛЬ@smtp.go1.unisender.ru:465
MAIL_FROM=HybridLog <no-reply@hybridtraining.ru>
```

(`go1` замени на `go2`, если кабинет на `go2`.) Если в логине или пароле есть `@ : / # ?` и подобные символы, закодируй их в URL (`@` → `%40`, `:` → `%3A`, `/` → `%2F`). Для порта 587 используй `smtp://…:587`: шифрование включится через STARTTLS.

Применить: `systemctl restart hybridlog`.

## 4. Проверка

1. В приложении запроси код на ящик Gmail, затем на Mail.ru и на Яндекс. Письмо должно прийти во «Входящие», а не в «Спам».
2. В исходном виде письма (Gmail: «Показать оригинал») должны быть `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
3. Если письма нет: `journalctl -u hybridlog -n 50` (ошибки SMTP) и журнал доставки в кабинете сервиса.

Пока `SMTP_URL` пуст, сервер печатает коды в журнал: так можно проверять приложение самому, но людям открывать нельзя.
