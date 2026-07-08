#!/bin/sh
set -e

# bootstrap the .patricktree-stack subrepo, which is a dependency of this repo
cd './.patricktree-stack/'
pnpm install
pnpm run build
