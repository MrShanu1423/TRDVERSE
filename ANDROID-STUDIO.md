# Android Studio se seedha build (koi command nahi)

**Chahiye:** Android Studio *Narwhal (2025.1.1) ya naya* (JDK 21 saath aata hai). Internet (Gradle + SDK 36 pehli baar download).

1. Is zip ko unzip karo. **Android Studio -> Open -> `mobile/android` folder** chuno (poora project nahi, sirf `android` folder).
2. Neeche "Gradle sync" khatam hone do. SDK Platform 36 maange to **Install** dabao.
3. **API server ka URL daalo:** `app/src/main/assets/public/config.js` kholo:
   `window.TV_CONFIG = { API_URL: "https://tumhara-api.com" };`
4. Phone USB se lagao (USB debugging on) ya emulator chalao -> **Run (hara triangle)**. App phone mein install ho jayegi.

## Link se share karne wali APK
1. Ek baar keystore banao: **Build -> Generate Signed Bundle / APK -> APK -> Create new...** (file `tradeverse.jks`, password yaad rakho, **jks ko safe rakho, GitHub pe mat daalo**).
2. `mobile/android/keystore.properties` file banao:
```
storeFile=../tradeverse.jks
storePassword=TUMHARA_PASSWORD
keyAlias=tradeverse
keyPassword=TUMHARA_PASSWORD
```
3. Terminal (Studio ke andar) mein `mobile/android` se: `./gradlew assembleRelease` (Windows: `gradlew assembleRelease`)
   APK milegi: `app/build/outputs/apk/release/app-release.apk`
4. Isko GitHub Release / Google Drive / apne server pe upload karo -> wo link share karo.

## Jab web UI (React) badlo
```
cd ../..   (project root)
pnpm install
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/tradeverse run build
cd mobile && npm install && npx cap sync android
```
Phir Studio mein dobara Run/Build. (Git se clone kiya ho to pehli baar `cd mobile && npm install` zaroori hai.)
