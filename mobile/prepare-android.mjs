// Run twice by the CI workflow:
//   node prepare-android.mjs config   (before `cap add android`)  -> tweaks capacitor.config.json
//   node prepare-android.mjs patch    (after  `cap add android`)  -> tweaks the generated Android project
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const mode = process.argv[2];
const apiUrl = (process.env.API_URL || '').trim();
const isHttp = apiUrl.startsWith('http://');
const runNumber = Number(process.env.RUN_NUMBER || 1);

if (mode === 'config') {
  const f = 'capacitor.config.json';
  const cfg = JSON.parse(readFileSync(f, 'utf8'));
  // A plain-http API (e.g. a home server without TLS) is blocked as "mixed content" unless allowed.
  cfg.android = { ...(cfg.android || {}), allowMixedContent: isHttp };
  writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`config: allowMixedContent=${isHttp}`);
} else if (mode === 'patch') {
  const mf = 'android/app/src/main/AndroidManifest.xml';
  let m = readFileSync(mf, 'utf8');
  m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"'); // trading app: no cloud/adb backup of local session
  if (isHttp && !m.includes('usesCleartextTraffic')) m = m.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
  writeFileSync(mf, m);

  const gf = existsSync('android/app/build.gradle') ? 'android/app/build.gradle' : null;
  if (gf) {
    let g = readFileSync(gf, 'utf8');
    g = g.replace(/versionCode\s+\d+/, `versionCode ${runNumber}`).replace(/versionName\s+"[^"]*"/, `versionName "1.0.${runNumber}"`);
    // Release signing from android/keystore.properties (optional). Without that file, `Run`/debug builds still work.
    if (!g.includes('keystore.properties')) {
      g = g.replace('android {\n    namespace', `def keystoreProps = new Properties()
def keystoreFile = rootProject.file('keystore.properties')
if (keystoreFile.exists()) { keystoreFile.withInputStream { keystoreProps.load(it) } }

android {
    namespace`);
      g = g.replace('    buildTypes {', `    signingConfigs {
        release {
            if (keystoreFile.exists()) {
                storeFile rootProject.file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
    buildTypes {`);
      g = g.replace("            minifyEnabled false\n", "            minifyEnabled false\n            if (keystoreFile.exists()) { signingConfig signingConfigs.release }\n");
    }
    writeFileSync(gf, g);
  }
  console.log(`patch: manifest + version 1.0.${runNumber} (cleartext=${isHttp})`);
} else {
  console.error('usage: node prepare-android.mjs config|patch'); process.exit(1);
}
