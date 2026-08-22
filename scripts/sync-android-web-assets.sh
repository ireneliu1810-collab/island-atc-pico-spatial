#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$project_dir/dist"
target_dir="$project_dir/android-apk/app/src/main/assets/web"

if [[ ! -f "$source_dir/index.html" ]]; then
  echo "Missing web build at $source_dir. Run npm run build:apk-web first." >&2
  exit 1
fi

mkdir -p "$target_dir"
find "$target_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$source_dir"/. "$target_dir"/
echo "Embedded web assets synchronized to $target_dir"
