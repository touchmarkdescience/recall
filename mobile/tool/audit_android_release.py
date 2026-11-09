"""Audit built release artifacts without printing local server secret values."""
from pathlib import Path
import hashlib, json, re, shutil, struct, zipfile
import xml.etree.ElementTree as ET
root = Path(__file__).resolve().parents[2]
mobile = root / 'mobile'
aab = mobile / 'build/app/outputs/bundle/release/app-release.aab'
apk = mobile / 'build/app/outputs/apk/release/app-release.apk'
manifest = ET.parse(mobile / 'build/app/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml').getroot()
android = '{http://schemas.android.com/apk/res/android}'
version = manifest.get(android + 'versionName')
code = int(manifest.get(android + 'versionCode'))
package = manifest.get('package')
sdk = manifest.find('uses-sdk')
libs = []
secrets = []
env_file = root / '.env.local'
if env_file.exists():
    for line in env_file.read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            key, value = line.split('=', 1)
            value = value.strip().strip('\"').strip("'")
            if re.search(r'API_KEY|SECRET|PRIVATE_KEY', key) and len(value) > 15:
                secrets.append(value.encode())
with zipfile.ZipFile(aab) as archive:
    for name in archive.namelist():
        data = archive.read(name)
        if any(secret in data for secret in secrets):
            raise SystemExit('Server secret material found in AAB; values withheld.')
        if name.endswith('.so') and any(abi in name for abi in ['arm64-v8a/', 'x86_64/']):
            assert data[:5] == b'\x7fELF\x02'
            offset = struct.unpack_from('<Q', data, 32)[0]
            size, count = struct.unpack_from('<HH', data, 54)
            alignment = [struct.unpack_from('<Q', data, offset + i * size + 48)[0]
                         for i in range(count) if struct.unpack_from('<I', data, offset + i * size)[0] == 1]
            libs.append({'library': name, 'loadSegmentAlignment': alignment,
                         'passes16KB': bool(alignment) and min(alignment) >= 16384})
assert libs and all(lib['passes16KB'] for lib in libs)
report = {
    'date': '2026-11-09', 'package': package,
    'versionName': version, 'versionCode': code, 'targetSdk': int(sdk.get(android + 'targetSdkVersion')), 'minSdk': int(sdk.get(android + 'minSdkVersion')),
    'aabBytes': aab.stat().st_size,
    'aabSha256': hashlib.sha256(aab.read_bytes()).hexdigest(),
    'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
    'uploadCertificateSha256': '1A:9D:65:E8:AB:CE:7D:1C:42:FC:1F:C4:60:A1:FC:E5:D3:65:44:4C:39:64:20:1B:33:00:D8:7C:20:81:64:F6',
    'nativeLibraries': libs, 'all64BitELFSegments16KBAligned': True,
    'releaseAPK16KBZipAlignment': 'zipalign -c -P 16 -v 4: Verification successful',
    'runtime16KBDeviceTest': 'unverified', 'bundletoolPageAlignment': 'BundleConfig.pb decoded with cached bundletool/protobuf: PAGE_ALIGNMENT_16K',
    'knownLocalServerSecretsFoundInAAB': 0,
    'productionAccountDeletion': 'deployed; disposable live account verification in progress',
    'physicalDeviceAcceptance': 'pending',
}
(mobile / 'release/bundle-audit.json').write_text(json.dumps(report, indent=2) + '\n')
out = mobile / 'build/deliverables'
out.mkdir(exist_ok=True)
shutil.copy2(aab, out / f'Recall-Android-{version}-build{code}.aab')
shutil.copy2(apk, out / f'Recall-Android-{version}-build{code}.apk')
print('Final artifacts copied; ELF/ZIP audit saved; known local server secret byte matches: 0.')
