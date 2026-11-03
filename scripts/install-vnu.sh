#!/usr/bin/env bash
# Download the Nu Html Checker jar this repository trusts.
# The upstream "latest" tag moves, so the checksum below is the pin.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
jar="$root/.cache/vnu.jar"
url="https://github.com/validator/validator/releases/download/latest/vnu.jar"
# Nu Html Checker "latest" as published on 2026-11-03.
sha="f1a68ef7831c61721caa1894d83a7dc21e6ef798fb8901f1feac769d5c609b9d"

if [[ -f "$jar" ]]; then
  got="$(sha256sum "$jar" | awk '{print $1}')"
  if [[ "$got" == "$sha" ]]; then
    exit 0
  fi
  rm -f "$jar"
fi

mkdir -p "$root/.cache"
curl -fsSL -o "$jar" "$url"
got="$(sha256sum "$jar" | awk '{print $1}')"
if [[ "$got" != "$sha" ]]; then
  rm -f "$jar"
  echo "vnu.jar checksum does not match the pin in scripts/install-vnu.sh." >&2
  echo "expected $sha" >&2
  echo "got      $got" >&2
  echo "Review the new Nu Html Checker release, then update the checksum." >&2
  exit 1
fi
