# ==============================================================================
# STAGE 1: Build Stage
#
# This stage installs dependencies, builds the Next.js application, and
# generates the standalone production output.
# ==============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests
COPY package.json package-lock.json* ./

# Set build-time environment variables
ARG NODE_ENV=production
# We move the ENV setting to *after* npm ci

# Install all dependencies (including dev dependencies) needed for the build
# Using 'npm ci' is faster and more reproducible than 'npm install'
# We run this *before* setting NODE_ENV=production to ensure
# devDependencies (like the 'next' CLI) are installed.
RUN npm ci

# Copy the rest of the source code
COPY . .

# Now, set the environment variables for the build step
ENV NODE_ENV=${NODE_ENV}
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js application
# This will generate the .next directory with build output
RUN npm run build

# ==============================================================================
# STAGE 2: Production/Runner Stage
#
# This stage takes the build artifacts from the 'builder' stage and sets
# up a minimal, secure environment to run the application.
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

# Set runtime environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user and group for security
# Running as 'root' in a container is a major security risk.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets from the builder stage
COPY --from=builder /app/public ./public

# Create the .next directory and set its ownership *before* copying files into it.
# This is crucial so the 'nextjs' user can write to cache folders (e.g., for ISR)
# This combines your original 'mkdir' and 'chown' into one layer.
RUN mkdir .next && chown nextjs:nodejs .next

# Copy the standalone output. This includes server.js, dependencies, etc.
# Using '--chown' is more efficient than a separate 'RUN chown' command.
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
# This helps orchestrators (like Kubernetes) know the app's status.
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# The command to start the application
CMD ["node", "server.js"]