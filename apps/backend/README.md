# @content-relay/backend

## Build a Docker image tarball

Use `scripts/build-backend-docker-image.sh` to build a Docker image for the backend and export it as a tarball.

```sh
./apps/backend/scripts/build-backend-docker-image.sh
```

What the script does:

- resolves paths relative to the script, so it can run from anywhere in the repo
- creates a pruned monorepo that contains `@content-relay/backend` and its production dependencies
- copies `apps/backend/Dockerfile` into that pruned workspace
- builds a `linux/arm64` Docker image with `docker buildx`
- exports the image as a Docker tarball instead of pushing it to a registry
- tags the image as `content-relay-backend:<git-sha>`

Default output path:

```text
apps/backend/content-relay-backend-docker-image-<git-sha>.tar
```

You can override the output tarball path by passing it as the first argument:

```sh
./apps/backend/scripts/build-backend-docker-image.sh /tmp/content-relay-backend.tar
```

To load the exported image into Docker later:

```sh
docker load --input ./apps/backend/content-relay-backend-docker-image-<git-sha>.tar
```
