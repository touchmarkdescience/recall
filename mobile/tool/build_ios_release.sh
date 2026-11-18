#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
swift -module-cache-path /private/tmp/recall-swift-module-cache tool/prepare_ios_icons.swift
flutter build ipa --release --dart-define=RECALL_API_URL=https://recall.touchmarkdes.com "$@"
python3 tool/prepare_ios_archive.py
echo 'Open build/ios/archive/Runner.xcarchive in Xcode Organizer and validate before uploading.'
