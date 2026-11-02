#!/usr/bin/env bash
# Runs inside a container: packages one target and puts the package into /app/dist (bind mount on the host).
set -euo pipefail

target="${1:?usage: package.sh deb|pacman|rpm}"
out=/tmp/release

mkdir -p /app/dist
if [[ "$target" == rpm ]]; then
  # rpmbuild directly: electron-builder's bundled fpm fails with the rpm 4.20 that Fedora 42 ships.
  DIST_DIR="$out" ./scripts/build-rpm.sh
else
  npx electron-builder --linux "$target" --x64 --publish never -c.directories.output="$out"
fi
find "$out" -maxdepth 1 -type f \( -name '*.deb' -o -name '*.pkg.tar.zst' -o -name '*.rpm' \) -exec cp -v {} /app/dist/ \;

# Files made by root in the container go to the host's user.
if [[ -n "${HOST_UID:-}" ]]; then
  chown "${HOST_UID}:${HOST_GID:-$HOST_UID}" /app/dist /app/dist/*
fi
