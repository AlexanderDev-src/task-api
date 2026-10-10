# Build from the repo root, not from backend/:
#   docker build -f backend/Dockerfile .
# The server reads the SQL files in migrations/ at startup, and that directory
# sits next to backend/, so both have to be inside the build context.
FROM oven/bun:1.4-alpine
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY migrations /app/migrations
USER bun
EXPOSE 8080
CMD ["bun", "src/main.ts"]
