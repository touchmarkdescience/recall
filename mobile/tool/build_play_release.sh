#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f android/key.properties ]]; then
  echo 'Release blocked: configure android/key.properties (see release/PLAY_STORE.md).' >&2
  exit 1
fi
candidate=false
if [[ "${1:-}" == "--candidate" ]]; then candidate=true; shift; fi
api_url="${RECALL_API_URL:-https://recall.touchmarkdes.com}"
if [[ "$api_url" != https://* || "$api_url" == *localhost* || "$api_url" == *127.0.0.1* ]]; then
  echo 'Release blocked: RECALL_API_URL must be the production HTTPS API.' >&2
  exit 1
fi
# Do not build a store artifact against an older backend lacking account deletion.
if [[ "$candidate" == false ]]; then
  curl --fail --silent --show-error --max-time 20 "$api_url/api/me" |
    python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("accountDeletionAvailable") is True, "Deploy the account-deletion backend before making a store build"'
else
  echo 'CANDIDATE ONLY: backend deployment and acceptance tests still required before upload.'
fi
export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.vfs.watch=false"
flutter build appbundle --release --target lib/main.dart --dart-define="RECALL_API_URL=$api_url" "$@"
echo 'AAB: build/app/outputs/bundle/release/app-release.aab'
echo 'Verify the upload certificate with keytool -printcert -jarfile <AAB> before upload.'
