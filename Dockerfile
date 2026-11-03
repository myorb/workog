# Build image for the DigitalOcean App Platform static site (.do/app.yaml).
# App Platform runs this build and serves /app/dist.
FROM oven/bun:1.4.2
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun test && bun run build
