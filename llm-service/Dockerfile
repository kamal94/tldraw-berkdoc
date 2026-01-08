# Use Bun's official image
FROM oven/bun:1 as base

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN bun install --frozen-lockfile

# Copy source code and scripts
COPY scripts ./scripts
COPY src ./src

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Start the service
CMD ["bun", "run", "start"]

