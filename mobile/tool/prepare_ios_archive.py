#!/usr/bin/env python3
"""Verify opaque icons and supply genuine, UUID-matched native asset symbols."""
import json
import plistlib
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
archive = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'build/ios/archive/Runner.xcarchive'
app = archive / 'Products/Applications/Runner.app'
if not app.is_dir():
    raise SystemExit(f'Archive app not found: {app}')
with (app / 'Info.plist').open('rb') as source:
    app_info = plistlib.load(source)
if app_info.get('UIDeviceFamily') != [1]:
    raise SystemExit('Archive must target iPhone only (UIDeviceFamily [1]); check all Runner configurations and rebuild.')
print(f'PASS: iPhone-only {app_info.get("CFBundleShortVersionString")} ({app_info.get("CFBundleVersion")})')

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout

catalog = root / 'ios/Runner/Assets.xcassets/AppIcon.appiconset'
names = {entry['filename'] for entry in json.loads((catalog / 'Contents.json').read_text())['images']}
for name in sorted(names):
    info = run('sips', '-g', 'hasAlpha', str(catalog / name))
    if 'hasAlpha: no' not in info:
        raise SystemExit(f'Icon still has alpha: {name}; run tool/prepare_ios_icons.swift and rebuild.')
print(f'PASS: {len(names)} source icons have no alpha channel')
if max((catalog / name).stat().st_mtime for name in names) > (archive / 'Info.plist').stat().st_mtime:
    raise SystemExit('Icons are newer than this archive. Rebuild before validating or uploading.')
assets = json.loads(run('xcrun', 'assetutil', '--info', str(app / 'Assets.car')))
icons = [a for a in assets if a.get('AssetType') == 'Icon Image' and a.get('Name') == 'AppIcon']
if not any(a.get('PixelWidth') == 1024 and a.get('Opaque') is True for a in icons):
    raise SystemExit('Archive is missing an opaque 1024px App Store icon.')
if any(a.get('Opaque') is not True for a in icons):
    raise SystemExit('An archived app icon is not opaque.')
print(f'PASS: {len(icons)} packaged icon renditions are opaque, including the 1024px icon')

def uuids(path):
    return set(re.findall(r'UUID: ([0-9A-F-]+) \(([^)]+)\)', run('xcrun', 'dwarfdump', '--uuid', str(path))))

framework = app / 'Frameworks/objective_c.framework/objective_c'
if framework.is_file():
    symbols = archive / 'dSYMs/objective_c.framework.dSYM'
    dwarf = symbols / 'Contents/Resources/DWARF/objective_c'
    if not dwarf.is_file():
        result = subprocess.run(['xcrun', 'dsymutil', str(framework), '-o', str(symbols)],
                                check=True, capture_output=True, text=True)
        if result.stderr:
            print(result.stderr.strip())
    binary_ids = uuids(framework)
    if not binary_ids or binary_ids != uuids(dwarf):
        raise SystemExit('Native asset dSYM UUID mismatch; rebuild the archive.')
    debug_info = run('xcrun', 'dwarfdump', '--debug-info', str(dwarf))
    units = debug_info.count('DW_TAG_compile_unit')
    if not units:
        raise SystemExit('Native asset dSYM has no compilation units; rebuild with debug information.')
    print(f'PASS: objective_c symbols match {sorted(binary_ids)}; {units} compilation units')

print(f'Archive ready for Xcode validation: {archive}')
