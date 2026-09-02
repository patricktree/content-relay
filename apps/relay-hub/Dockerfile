FROM node:24.15.0-alpine@sha256:693101c77e947e45e001910202dcb37a659c0b1a4c27619848f1b8b7eaee0def AS builder
WORKDIR /app

# install the pnpm version pinned in package.json#packageManager (https://pnpm.io/installation#using-npm)
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
RUN npm install --global pnpm@12.2.1

# set some env vars to enable caching of pnpm fetch/install (https://pnpm.io/docker#example-1-build-a-bundle-in-a-docker-container)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"

# install packages to enable building native dependencies
RUN apk add --no-cache \
	# core packages needed for node-gyp and others
	build-base=0.5-r3 \
	g++=15.2.0-r2 \
	python3=3.12.14-r0

# copy everything from Docker context into the container
COPY ./ ./

# install dependencies
RUN CI=true pnpm install --prod --frozen-lockfile

# start a new stage for the runtime image
FROM node:24.15.0-alpine@sha256:693101c77e947e45e001910202dcb37a659c0b1a4c27619848f1b8b7eaee0def AS runtime
WORKDIR /app

# copy everything from "builder" stage
COPY --from=builder --chown=node:node /app/ ./

# run as non-root user "node" (https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#non-root-user)
USER node

# run the application
WORKDIR /app/apps/relay-hub
ENTRYPOINT ["node", "./src/bin.ts"]
CMD []
