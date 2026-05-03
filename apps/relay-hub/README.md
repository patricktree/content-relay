# @content-relay/relay-hub

## Build a Docker image tarball

Use `scripts/build-relay-hub-docker-image.sh` to build a Docker image for the Relay Hub and export it as a tarball.

```sh
./apps/relay-hub/scripts/build-relay-hub-docker-image.sh
```

What the script does:

- resolves paths relative to the script, so it can run from anywhere in the repo
- creates a pruned monorepo that contains `@content-relay/relay-hub` and its production dependencies
- copies `apps/relay-hub/Dockerfile` into that pruned workspace
- builds a `linux/arm64` Docker image with `docker buildx`
- exports the image as a Docker tarball instead of pushing it to a registry
- tags the image as `content-relay-hub:<git-sha>`

Default output path:

```text
apps/relay-hub/content-relay-hub-docker-image-<git-sha>.tar
```

You can override the output tarball path by passing it as the first argument:

```sh
./apps/relay-hub/scripts/build-relay-hub-docker-image.sh /tmp/content-relay-hub.tar
```

To load the exported image into Docker later:

```sh
docker load --input ./apps/relay-hub/content-relay-hub-docker-image-<git-sha>.tar
```
