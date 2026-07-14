# Deploy FreeLLMAPI — سرور s40 (karavi-local)

راهنمای گام‌به‌گام برای آپلود image و deploy روی سرور.  
این مراحل در مسیر `/var/docker-compose/freellmapi-public-dev-docker` تست و تأیید شده‌اند.

---

## مسیرهای ثابت

| محل | مسیر |
|-----|------|
| سورس (ویندوز) | `D:\SourceKaravi\Idia\freellmapi` |
| فایل tar بعد از build (ویندوز) | `D:\Downloads\freellmapi-server-deploy\freellmapi-karavi-local.tar` |
| tar روی سرور | `/opt/karavi.freellmapi/freellmapi-karavi-local.tar` |
| docker-compose روی سرور | `/var/docker-compose/freellmapi-public-dev-docker` |
| image tag | `freellmapi:karavi-local` |
| پورت publish شده | `3003` → `3001` (طبق compose فعلی) |

---

## بخش ۱ — Build و export (ویندوز)

**پیش‌نیاز:** Docker Desktop روشن باشد.

```powershell
New-Item -ItemType Directory -Force -Path "D:\Downloads\freellmapi-server-deploy"

cd D:\SourceKaravi\Idia\freellmapi
docker compose build
docker tag ghcr.io/tashfeenahmed/freellmapi:latest freellmapi:karavi-local
docker save freellmapi:karavi-local -o "D:\Downloads\freellmapi-server-deploy\freellmapi-karavi-local.tar"
```

**تأیید سریع روی ویندوز (اختیاری):**

```powershell
docker run --rm -e FREEAPI_UNIFIED_KEY_PREFIX=ntk freellmapi:karavi-local node --input-type=module -e "import { getUnifiedKeyPrefix } from '/app/server/dist/lib/unified-key-prefix.js'; console.log(getUnifiedKeyPrefix());"
```

خروجی باید `ntk` باشد.

---

## بخش ۲ — آپلود tar به سرور

```powershell
scp "D:\Downloads\freellmapi-server-deploy\freellmapi-karavi-local.tar" root@s40:/opt/karavi.freellmapi/
```

---

## بخش ۳ — Deploy روی سرور

```bash
cd /var/docker-compose/freellmapi-public-dev-docker

# تأیید فایل tar
ls -lh /opt/karavi.freellmapi/freellmapi-karavi-local.tar

# توقف container فعلی (volume دیتا حفظ می‌شود — بدون -v)
docker compose down

# حذف image قدیمی (اگر خطای conflict داد، مرحلهٔ اختیاری پایین را بزن)
docker rmi freellmapi:karavi-local

# load image جدید
docker load -i /opt/karavi.freellmapi/freellmapi-karavi-local.tar

# بالا آوردن با image تازه
docker compose up -d --force-recreate
```

### اگر `docker rmi` خطای conflict داد

```bash
docker ps -a | grep freellm
# container متوقف‌شدهٔ قدیمی را حذف کن (ID را از خروجی بگیر)
docker rm -f <CONTAINER_ID>
docker rmi freellmapi:karavi-local
docker load -i /opt/karavi.freellmapi/freellmapi-karavi-local.tar
docker compose up -d --force-recreate
```

> حتی اگر `docker rmi` خطا بدهد، `docker load` معمولاً image جدید را load می‌کند و tag قدیمی را جابه‌جا می‌کند. **حتماً** `--force-recreate` را بزن.

---

## بخش ۴ — تأیید بعد از deploy

```bash
cd /var/docker-compose/freellmapi-public-dev-docker

# env prefix
docker compose exec freellmapi printenv FREEAPI_UNIFIED_KEY_PREFIX

# کد جدید داخل container (OLD IMAGE نباید باشد)
docker compose exec freellmapi grep getUnifiedKeyPrefix /app/server/dist/services/unified-keys.js

# prefix در runtime
docker compose exec freellmapi node --input-type=module -e "import { getUnifiedKeyPrefix } from '/app/server/dist/lib/unified-key-prefix.js'; console.log(getUnifiedKeyPrefix());"

# وضعیت container
docker compose ps
```

| انتظار | معنی |
|--------|------|
| `FREEAPI_UNIFIED_KEY_PREFIX` → `ntk` | env درست |
| خط `getUnifiedKeyPrefix` در grep | image جدید ✓ |
| خروجی `ntk` از node | prefix فعال ✓ |
| `OLD IMAGE` یا grep خالی | tar قدیمی load شده یا recreate نشده — بخش ۳ را تکرار کن |

**تست UI:** Keys → Add unified key یا Regenerate → کلید جدید باید با `ntk-` شروع شود.

---

## prefix کلید یکپارچه (`FREEAPI_UNIFIED_KEY_PREFIX`)

در `docker-compose.yml` سرور:

```yaml
environment:
  FREEAPI_UNIFIED_KEY_PREFIX: ntk
```

- فقط روی **کلیدهای جدید** (Add / Regenerate) اعمال می‌شود.
- کلیدهای قبلی با prefix قدیمی (`freellmapi-`) در DB می‌مانند تا Regenerate شوند.
- env به‌تنهایی کافی نیست؛ **image باید شامل کد `unified-key-prefix`** باشد.

---

## چک‌لیست هر deploy

- [ ] `docker compose build` روی ویندوز بدون خطا
- [ ] tar جدید در `/opt/karavi.freellmapi/` آپلود شد
- [ ] `docker compose down` + `docker load` + `up -d --force-recreate`
- [ ] `grep getUnifiedKeyPrefix` داخل container موفق
- [ ] کلید جدید در UI با `ntk-` ساخته شد

---

## نکات

- **`docker compose down` بدون `-v`:** SQLite و تنظیمات در volume حفظ می‌شود.
- **چند instance:** اگر چند پوشه compose داری (`dev-docker` / `dev2-docker`)، مطمئن شو nginx به همان instance که deploy کردی اشاره می‌کند.
- **HTTP_PROXY WARN:** اگر proxy نمی‌زنی، در `.env` می‌توانی `HTTP_PROXY=` و `HTTPS_PROXY=` خالی بگذاری.

---

*آخرین به‌روزرسانی: ۱۴۰۵/۰۴/۱۴ — deploy موفق با tar در `/opt/karavi.freellmapi/` و compose در `/var/docker-compose/freellmapi-public-dev-docker`.*
