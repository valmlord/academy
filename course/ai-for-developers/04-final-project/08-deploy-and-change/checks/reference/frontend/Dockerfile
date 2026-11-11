# syntax=docker/dockerfile:1
# The page image: install and build with Node, run the built Nitro server on distroless Node as a non-root user.
FROM node:22.22.3-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The /api proxy target is fixed at build time (nuxt.config.ts), so the API address is a build argument.
ARG CALENDAR_API_URL=http://api:8080
RUN CALENDAR_API_URL="$CALENDAR_API_URL" node node_modules/nuxt/bin/nuxt.mjs build

FROM gcr.io/distroless/nodejs22-debian13:nonroot
COPY --from=build /app/.output /app/.output
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER nonroot:nonroot
CMD ["/app/.output/server/index.mjs"]
