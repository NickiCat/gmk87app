#!/usr/bin/env bash
# Builds packages in Docker: ./build-docker.sh [deb|arch|fedora ...]  (no arguments: all three in parallel)
set -euo pipefail
cd "$(dirname "$0")"

export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
compose=(docker compose -f docker-compose.build.yml)

services=()
for t in "$@"; do services+=("build-$t"); done
[[ ${#services[@]} -eq 0 ]] && services=(build-deb build-arch build-fedora)

mkdir -p dist
"${compose[@]}" up --build "${services[@]}"

failed=0
for s in "${services[@]}"; do
  id="$("${compose[@]}" ps -a -q "$s")"
  code="$(docker inspect -f '{{.State.ExitCode}}' "$id")"
  if [[ "$code" != 0 ]]; then
    echo "$s failed with code $code" >&2
    failed=1
  fi
done
"${compose[@]}" rm -f "${services[@]}" >/dev/null

echo
echo "Packages:"
ls -lh dist/*.deb dist/*.pkg.tar.zst dist/*.rpm 2>/dev/null || echo "  (none)"
(cd dist && sha256sum ./*.deb ./*.pkg.tar.zst ./*.rpm 2>/dev/null | sed 's# \./# #' > SHA256SUMS) || true
exit "$failed"
