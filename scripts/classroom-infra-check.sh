#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
image="hashicorp/terraform:1.9.8"
work="$root/infra/classroom"
docker run --rm -v "$work:/work" -w /work "$image" init -backend=false -input=false
for action in fmt validate test; do
  case "$action" in
    fmt) args=(fmt -check -recursive) ;;
    validate) args=(validate) ;;
    test) args=(test) ;;
  esac
  docker run --rm --network none -v "$root:/repo" -w /repo/infra/classroom "$image" "${args[@]}"
done
