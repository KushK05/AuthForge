#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
image="hashicorp/terraform:1.9.8"
if [[ "${1:-}" == "--init" ]]; then
  # Only downloads provider plugins. Does not use an AWS account or create resources.
  docker run --rm -v "$root/infra:/work" -w /work "$image" init -backend=false -input=false
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--init]" >&2
  exit 2
fi
# No network and no mounted AWS credentials during configuration tests.
for action in fmt validate test; do
  case "$action" in
    fmt) args=(fmt -check -recursive) ;;
    validate) args=(validate) ;;
    test) args=(test) ;;
  esac
  docker run --rm --network none -e AWS_EC2_METADATA_DISABLED=true -v "$root/infra:/work" -w /work "$image" "${args[@]}"
done
