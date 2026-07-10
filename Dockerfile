FROM oven/bun:latest as builder
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile
COPY backend/ .
RUN bun run build

FROM oven/bun:latest
WORKDIR /app/backend
COPY --from=builder /app/backend .
EXPOSE 4000
CMD ["bun", "run", "start"]
