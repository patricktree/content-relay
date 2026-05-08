# @content-relay/relay-hub

## Docker image publishing

GitHub Actions builds and publishes the Relay Hub Docker image.

Workflow:

```text
.github/workflows/build-and-publish-docker-image-content-relay-hub.yml
```

Published image tags:

```text
ghcr.io/<owner>/<repo>/relay-hub:latest
ghcr.io/<owner>/<repo>/relay-hub:<git-sha>
```
