# ============================================================================
# BioExtract — Clinical Biomarker Extraction Tool
# ============================================================================
# Build:  docker build -t shreshtap/bioextract .
# Run:    docker run -p 3000:3000 shreshtap/bioextract
# Pull:   docker pull shreshtap/bioextract
# ============================================================================
# No Python, no medspaCy, no API keys required.
# 100% client-side — all extraction runs in the browser.
# ============================================================================

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY . .

RUN npm run build

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:18-alpine AS runtime

RUN apk add --no-cache curl

WORKDIR /app

# Copy Next.js standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
