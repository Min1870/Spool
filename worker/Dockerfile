# The Spool worker image: Node.js + FFmpeg.
#
# Built by docker-compose with the REPO ROOT as the "build context" (the folder Docker
# can copy files from), because the worker also needs web/shared/video.ts.
#   docker compose build worker

# Debian-based Node image ("slim" = without extra tools we don't need).
FROM node:22-bookworm-slim

# FFmpeg (includes ffprobe and the libx264 H.264 encoder) from Debian's package list.
# Cleaning the apt cache afterwards keeps the image smaller.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/worker

# Install dependencies first, in their own layer. Docker caches each step, so as long as
# package.json / package-lock.json don't change, rebuilding after a code edit skips this.
COPY worker/package.json worker/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Then the code: the worker itself and the shared types, in the same relative layout as
# the repo, so the import "../../web/shared/video" works unchanged.
COPY worker/src ./src
COPY worker/tsconfig.json ./
COPY web/shared /app/web/shared

ENV NODE_ENV=production

# Don't run as root: the official Node image has an unprivileged "node" user.
USER node

# tsx runs the TypeScript directly (no build step).
CMD ["node_modules/.bin/tsx", "src/index.ts"]
