# TradeVerse database = Firebase Firestore (step by step)

**Pehle kya tha:** sessions, wallet, balance, orders, pending payments sab server ki memory mein the. Server restart = sab data gayab.
**Ab:** server boot pe Firestore se data load karta hai aur har ~3 second mein badla hua data wapas save karta hai (`artifacts/api-server/src/lib/store.ts`). Payment credit hote hi turant save hota hai.
Phone app Firestore se seedha baat **nahi** karta, sirf tumhare API server se. Isliye Firebase keys APK mein nahi jaati.

## Step 1: Firebase project
1. https://console.firebase.google.com -> **Add project** -> naam `tradeverse` -> Analytics off ya on (jo marzi) -> Create.

## Step 2: Firestore database
1. Left menu **Build -> Firestore Database -> Create database**.
2. **Location: `asia-south1` (Mumbai)** (baad mein badal nahi sakte).
3. Mode: **Production mode** -> Enable.
4. **Rules** tab mein ye daalo aur **Publish** karo (koi bhi client seedha access na kare; server Admin key se chalta hai aur rules bypass karta hai):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

## Step 3: Server ki key (service account)
1. Project settings (gear) -> **Service accounts** -> **Generate new private key** -> JSON download hoga.
2. Isko base64 karo:
   - Linux/Mac: `base64 -w0 serviceAccountKey.json`
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("serviceAccountKey.json"))`
3. Server ke environment mein daalo: `FIREBASE_SERVICE_ACCOUNT_B64=<wo lambi string>`
4. **JSON file ya base64 kabhi GitHub pe mat daalo.**

## Step 4: Server chalao
```
pnpm install
pnpm --filter @workspace/api-server run build
PORT=8080 FIREBASE_SERVICE_ACCOUNT_B64=... pnpm --filter @workspace/api-server run start
```
Log mein `store loaded` dikhega har collection ke saath. Pehli baar `docs: 0` normal hai.
Agar Firebase key galat hai to server **start hi nahi hoga** (jaan-boojhkar, taaki khali data se purana data overwrite na ho).

## Step 5: Check
Login karo -> Add money (demo) -> server restart karo -> dobara login ke bina balance wahi dikhna chahiye.
Firebase Console -> Firestore -> collections: `tv_sessions`, `tv_accounts`, `tv_wallet`, `tv_payments`.

## Step 6: Phone se server tak (HTTPS URL)
APK ko ek public **HTTPS** URL chahiye. Ghar/rack server ke liye sabse aasan free tareeka **Cloudflare Tunnel** (cloudflared) hai: `cloudflared tunnel --url http://localhost:8080` temporary URL deta hai; permanent ke liye apna domain tunnel se jodo. Phir wo URL `config.js` mein `API_URL` mein daalo.

## Limits / dhyan rakhne wali baatein
- **Sirf ek server instance** chalao (data memory mein hai, Firestore se sync hota hai). Do instance = ek doosre ka data overwrite karenge.
- Ye abhi paper-trading/demo data ke liye theek hai. Real paisa handle karne se pehle proper transactions chahiye (alag kaam).
- Firestore free (Spark) quota: ~20k writes/din, 50k reads/din. Chhote user base ke liye kaafi; users badhein to Blaze plan.
- Market data (Binance/Angel) save nahi hota, wo live aata hai.
