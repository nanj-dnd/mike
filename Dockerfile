FROM oven/bun:latest as builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
WORKDIR /app/backend
RUN bun run build

FROM oven/bun:latest
WORKDIR /app
COPY --from=builder /app .
EXPOSE 4000
CMD ["bun", "run", "start", "--prefix", "backend"]
