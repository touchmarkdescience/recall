#!/usr/bin/env python3
"""Verify the current AAB and write reproducible evidence; never print secrets."""
import argparse,base64,hashlib,json,re,shutil,struct,subprocess,zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

parser=argparse.ArgumentParser()
parser.add_argument('--version',required=True)
parser.add_argument('--code',required=True,type=int)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
mobile=root/'mobile'
aab=mobile/'build/app/outputs/bundle/release/app-release.aab'
cache=Path.home()/'.gradle/caches/modules-2/files-2.1'
def cached(group,artifact,version):
    files=list((cache/group/artifact/version).glob('*/*.jar'))
    if not files:raise SystemExit(f'Missing cached {artifact} {version}; build Android first.')
    return files[0]
classpath=':'.join(str(p) for p in [cached('com.android.tools.build','bundletool','1.18.1'),cached('com.android.tools.build','aapt2-proto','8.5.1-11315950'),cached('com.google.protobuf','protobuf-java','3.25.5')])
def run(*cmd):return subprocess.check_output(cmd,text=True,stderr=subprocess.STDOUT)
info=json.loads(run('java','--class-path',classpath,str(mobile/'tool/InspectAndroidBundle.java'),str(aab)))
assert info['package']=='com.touchmarkdes.recall', 'Wrong package'
assert info['versionName']==args.version and int(info['versionCode'])==args.code, 'Wrong version/build'
assert info['debuggable']!='true', 'Debuggable release'
assert info['allowBackup']=='false', 'Account backups unexpectedly enabled'
assert info['notificationActionReceiverExported']=='false', 'Notification action receiver missing/exposed'
assert info['bundlePageAlignment']=='PAGE_ALIGNMENT_16K', 'Bundle not configured for 16 KB packaging'
signature=run('jarsigner','-J-Duser.language=en','-J-Duser.country=US','-verify',str(aab))
assert 'jar verified.' in signature, 'AAB signature verification failed'
certificate=run('keytool','-printcert','-jarfile',str(aab),'-rfc')
def der(pem):
    found=re.search(r'-----BEGIN CERTIFICATE-----\s*(.*?)\s*-----END CERTIFICATE-----',pem,re.S)
    assert found,'Certificate missing'
    return base64.b64decode(found.group(1))
expected=der((mobile/'release/upload-certificate.pem').read_text())
assert der(certificate)==expected, 'Upload certificate does not match the existing app'
fingerprint=hashlib.sha256(expected).hexdigest().upper()
secrets=[]
env_file=root/'.env.local'
for line in (env_file.read_text().splitlines() if env_file.exists() else []):
    if '=' not in line or line.lstrip().startswith('#'):continue
    key,value=line.split('=',1);value=value.strip().strip('\"').strip("'")
    if re.search(r'API_KEY|SECRET|PRIVATE|PASSWORD|TOKEN',key) and not key.startswith('NEXT_PUBLIC_') and len(value)>12:secrets.append(value.encode())
libs=[];api=False
with zipfile.ZipFile(aab) as archive:
    for item in archive.infolist():
        if item.is_dir():continue
        data=archive.read(item)
        assert not any(secret in data for secret in secrets),'Server credential found in AAB; value withheld'
        api=api or b'https://recall.touchmarkdes.com' in data
        if item.filename.endswith('.so') and any(abi in item.filename for abi in ['arm64-v8a/','x86_64/']):
            assert data[:5]==b'\x7fELF\x02','Unexpected native library format'
            offset=struct.unpack_from('<Q',data,32)[0]
            size,count=struct.unpack_from('<HH',data,54)
            segments=[(struct.unpack_from('<Q',data,offset+i*size+8)[0],struct.unpack_from('<Q',data,offset+i*size+16)[0],struct.unpack_from('<Q',data,offset+i*size+48)[0]) for i in range(count) if struct.unpack_from('<I',data,offset+i*size)[0]==1]
            assert segments and all(align>=16384 and (address-position)%16384==0 for position,address,align in segments),'Native library fails 16 KB ELF alignment'
            libs.append({'library':item.filename,'loadSegmentAlignment':[align for _,_,align in segments]})
assert libs and api,'Missing native libraries or production API URL'
out=mobile/'build/deliverables';out.mkdir(exist_ok=True)
target=out/f'Recall-Android-{args.version}-build{args.code}.aab';shutil.copy2(aab,target)
report={'date':datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat(),**info,'debuggable':info['debuggable']=='true','versionCode':args.code,'minSdk':int(info['minSdk']),'targetSdk':int(info['targetSdk']),'aabBytes':aab.stat().st_size,'aabSha256':hashlib.sha256(aab.read_bytes()).hexdigest(),'signatureVerified':True,'uploadCertificateMatchesExisting':True,'uploadCertificateSha256':':'.join(fingerprint[i:i+2] for i in range(0,len(fingerprint),2)),'nativeLibraries':libs,'all64BitELFSegments16KBAligned':True,'localSecretValuesChecked':len(secrets),'knownLocalServerSecretsFoundInAAB':0,'productionApi':'https://recall.touchmarkdes.com','testCoverage':'Artifact audit only; Flutter test evidence is recorded separately in release notes','physicalAndroidAcceptance':'pending exact Play-installed build','runtime16KBDeviceTest':'unverified','playUpload':'not performed','artifact':str(target.relative_to(root))}
path=mobile/'release'/f'android-{args.version}-build{args.code}-verification.json'
path.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
