# TradeVerse → Android APK (link se install)

> Naye docs: **ANDROID-STUDIO.md** (seedha Studio se build) aur **FIREBASE-SETUP.md** (database). Neeche wala GitHub Actions tareeka optional hai.


APK yahan sandbox mein build nahi ho sakta (Gradle/Android SDK blocked), isliye GitHub Actions free mein build karke ek direct download link bana dega.

## One-time setup (5 min)
1. GitHub pe **public** repo banao aur is poore folder ko push/upload karo (branch `main`).
2. Repo → **Settings → Secrets and variables → Actions → Variables → New variable**
   - Name: `API_URL`  Value: `https://tumhara-api-domain.com` (tumhara Express API server, **HTTPS** best hai)
3. Repo → **Actions → Build Android APK → Run workflow**. ~8-10 min baad done.

## Share link
```
https://github.com/<username>/<repo>/releases/latest/download/TradeVerse.apk
```
Jisko bhejoge wo Android pe tap kare → download → **Install**. (Pehli baar Android "is source se install allow karo" poochega — ye Android ka rule hai, hata nahi sakte.)
Har nayi push pe APK khud update ho jata hai, link wahi rahta hai.

## Permanent signing key (recommended, warna update se pehle uninstall karna padega)
```
keytool -genkeypair -keystore tradeverse.jks -alias tradeverse -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 tradeverse.jks
```
Repo Secrets mein daalo: `ANDROID_KEYSTORE_BASE64` (upar wala output), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (= tradeverse). `.jks` file kahin safe rakho, repo mein commit mat karo.

## iPhone
Direct-link se installable iOS app sirf Apple Developer account ($99/yr, TestFlight) se possible hai. Free option: web version ka link Safari mein kholo → Share → **Add to Home Screen**. Icon, full-screen, safe-area sab set hai.

## Backend note
APK sirf UI hai. Login/market/wallet ke liye API server internet pe chalta hona chahiye (`API_URL`). `http://` URL bhi chalega (auto-allow), par HTTPS better hai.

## App icon
Official icon: https://res.cloudinary.com/dfjegeiip/image/upload/v1790924917/no-bg-TradeVerse_Crypto_Trading_Icon_cqlqzt.png
`mobile/fetch-icon.mjs` isko download karke khud ye sab banata hai: Android launcher icon (adaptive + round), splash screen, PWA icons, iPhone home-screen icon, browser favicon. App ke andar bhi header/login pe yahi logo dikhta hai, aur `/download.html` page pe bhi.
- Android Studio route: step 1 se pehle `cd mobile && npm install && node fetch-icon.mjs` chalao.
- Icon pe agar logo dark/black ho aur dark background mein na dikhe: `ICON_BG="#FFFFFF" node fetch-icon.mjs` (ya koi bhi colour).
- Icon badalna ho to `ICON_URL=<naya link> node fetch-icon.mjs`.
- Download page: `https://<site>/download.html` (Netlify/GitHub Pages pe web build host karo to ye link bhi share kar sakte ho).
