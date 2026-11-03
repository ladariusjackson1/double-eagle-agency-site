#!/usr/bin/env bash
# Same checks the GitHub Actions job runs.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

bash scripts/install-vnu.sh
node scripts/apply-site-url.mjs --check
node scripts/apply-site-url.mjs --self-test
node scripts/check-links.mjs --self-test
java -jar "$root/.cache/vnu.jar" --errors-only index.html privacy.html terms.html
node scripts/check-links.mjs

leftovers="$(grep -nE 'yourdomain\.com' index.html privacy.html terms.html robots.txt sitemap.xml | grep -v 'email@yourdomain.com' || true)"
if [[ -n "$leftovers" ]]; then
  echo "A yourdomain.com URL is still outside the email placeholder:" >&2
  echo "$leftovers" >&2
  exit 1
fi
