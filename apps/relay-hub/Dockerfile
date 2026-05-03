FROM node:24.15.0-alpine@sha256:693101c77e947e45e001910202dcb37a659c0b1a4c27619848f1b8b7eaee0def AS builder
WORKDIR /app

# Install corepack@0.31.0 to fix https://github.com/nodejs/corepack/issues/616 and enable corepack so pnpm is available later.
RUN npm install -g corepack@0.31.0 && corepack enable

# set some env vars to enable caching of pnpm fetch/install (see https://pnpm.io/docker#example-1-build-a-bundle-in-a-docker-container)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# install packages to enable building native dependencies
RUN apk add --no-cache \
	# core packages needed for node-gyp and others
	build-base \
	g++ \
	python3

# copy everything
COPY ./ ./

# install dependencies
RUN CI=true pnpm install --prod --frozen-lockfile

FROM node:24.15.0-alpine@sha256:693101c77e947e45e001910202dcb37a659c0b1a4c27619848f1b8b7eaee0def AS runtime
WORKDIR /app

# copy everything from "builder" stage
COPY --from=builder --chown=node:node /app/ ./

# https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#non-root-user
USER node

WORKDIR /app/apps/relay-hub
ENTRYPOINT ["node", "./src/bin.ts"]
CMD []
