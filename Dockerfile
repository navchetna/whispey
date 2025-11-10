# ==============================================================================
# STAGE 1: Dependencies Stage
#
# Install dependencies in a separate stage for better caching
# ==============================================================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package manifests
COPY package.json package-lock.json* ./

# Copy config files needed for postinstall script (fumadocs-mdx)
COPY source.config.ts ./
COPY tsconfig.json ./
COPY next.config.mjs ./

# Create content directory structure for fumadocs
RUN mkdir -p content/docs

# Install dependencies with frozen lockfile
# Install all dependencies including devDependencies needed for build
RUN npm ci

# Install Alpine-specific (musl) native modules
RUN npm install --no-save \
    @tailwindcss/oxide-linux-x64-musl \
    lightningcss-linux-x64-musl || echo "Optional Alpine dependencies not available, continuing..."

# ==============================================================================
# STAGE 2: Build Stage
#
# This stage builds the Next.js application with all required files
# ==============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy package files
COPY package.json package-lock.json* ./

# Copy source code and configuration files
COPY src ./src
COPY public ./public
COPY content ./content
COPY next.config.mjs ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.mjs ./
COPY components.json ./
COPY source.config.ts ./
COPY theme.config.tsx ./
COPY mdx-components.tsx ./
COPY instrumentation-client.ts ./

# Set build environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Disable static page generation during build
ENV NEXT_PRIVATE_STANDALONE=true

# Install Alpine-specific (musl) native modules in builder as well
RUN npm install --no-cache \
    @tailwindcss/oxide-linux-x64-musl \
    lightningcss-linux-x64-musl || echo "Optional Alpine dependencies not available, continuing..."

# Build the Next.js application with experimental worker disabled
RUN __NEXT_PRIVATE_PREBUNDLED_REACT=next npm run build

# ==============================================================================
# STAGE 3: Production/Runner Stage
#
# Minimal runtime environment with only production dependencies
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache libc6-compat

# Set runtime environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user and group for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets from the builder stage
COPY --from=builder /app/public ./public

# Create the .next directory and set ownership
RUN mkdir .next && chown nextjs:nodejs .next

# Copy the standalone output (includes minimal runtime and dependencies)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy the static assets (CSS, JS, images)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to the non-root user
USER nextjs

# Expose the port the application will run on
EXPOSE 3000

# Set default port and hostname for the server
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check to ensure the container is running and healthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# The command to start the application
CMD ["node", "server.js"]
