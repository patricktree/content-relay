#!/bin/sh

set -eu

# Resolve paths relative to this script so it works from any current directory.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

# Tag the image with the current commit SHA so the artifact is traceable.
COMMIT_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD)
IMAGE_TAG="content-relay-backend:$COMMIT_SHA"

# Allow overriding the output tarball path, but keep a backend-local default.
OUTPUT_TARBALL=${1:-"$REPO_ROOT/apps/backend/content-relay-backend-docker-image-$COMMIT_SHA.tar"}

# Build inside a temporary pruned workspace so the Docker context stays small.
TMPDIR=$(mktemp -d)

cleanup() {
  rm -rf "$TMPDIR"
}

# Always remove the temporary directory, even if the build fails.
trap cleanup EXIT INT TERM

# Ensure the output directory exists before asking Docker to write the tarball.
mkdir -p "$(dirname "$OUTPUT_TARBALL")"

cd "$REPO_ROOT"

# Build from a pruned monorepo so the Docker context only contains the backend
# and its production workspace dependencies.
node ./tooling/create-pruned-monorepo-cli/src/cli.ts \
  --project-name '@content-relay/backend' \
  --target-dir "$TMPDIR"

# The Docker build uses the pruned directory as context, so copy the Dockerfile
# there as well.
cp ./apps/backend/Dockerfile "$TMPDIR/Dockerfile"

# Export a linux/arm64 image as a tarball so it can be loaded or distributed
# without requiring a registry push.
docker buildx build \
  --file "$TMPDIR/Dockerfile" \
  --platform linux/arm64 \
  --tag "$IMAGE_TAG" \
  --output "type=docker,dest=$OUTPUT_TARBALL" \
  "$TMPDIR"
