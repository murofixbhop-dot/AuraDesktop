# Aura Messenger Desktop

Desktop-клиент Aura для Windows. Приложение открывает Render-версию мессенджера в Electron-оболочке и синхронизируется с тем же сервером, что браузер.

## Быстрый запуск

```powershell
npm install
npm run assets:icon
npm run start:render
```

Для локального сервера из папки `1`:

```powershell
npm run dev
```

`dev` открывает `http://localhost:3001/app.html?desktop=1`.

## Сборка Windows

```powershell
npm run build:win
```

Результат будет в `dist/`: обычный NSIS-инсталлер и portable `.exe`.

## Автообновления через GitHub Releases

В репозитории `AuraDesktop` уже подготовлен workflow `.github/workflows/release.yml`.
Чтобы выпустить релиз и включить автообновления, создайте тег:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions соберет Windows-инсталлер, portable `.exe`, `latest.yml` и загрузит их в GitHub Releases.

Для ручной локальной публикации укажите владельца нового репозитория:

```powershell
$env:AURA_UPDATE_OWNER="your-github-user-or-org"
$env:AURA_UPDATE_REPO="AuraDesktop"
$env:GH_TOKEN="github_token_with_repo_access"
npm run publish:win
```

Первый стабильный тег: `v1.0.0`. Следующий релиз, например `v1.0.1`, будет найден установленным приложением автоматически.

## Конфиг

- `AURA_SERVER_URL` - базовый URL сервера, по умолчанию `https://chat-9l7f.onrender.com`
- `AURA_UPDATE_OWNER` - владелец GitHub repo для автообновлений
- `AURA_UPDATE_REPO` - repo автообновлений, по умолчанию `AuraDesktop`

## Desktop API

На странице доступно:

```js
window.auraDesktop.isDesktop
window.auraDesktop.platform
window.auraDesktop.version
window.auraDesktop.reload()
window.auraDesktop.openExternal(url)
```
