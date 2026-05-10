FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# NEXT_PUBLIC_API_URL and NEXT_PUBLIC_MODE default to placeholders so a single
# image works in any environment — entrypoint.sh replaces them at runtime from
# the container's env vars (e.g. a Kubernetes ConfigMap).
ARG NEXT_PUBLIC_API_URL=__NEXT_PUBLIC_API_URL__
ARG NEXT_PUBLIC_MODE=__NEXT_PUBLIC_MODE__
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_MCP_URL
ARG NEXT_PUBLIC_OPENREPLAY_KEY

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MODE=$NEXT_PUBLIC_MODE \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_MCP_URL=$NEXT_PUBLIC_MCP_URL \
    NEXT_PUBLIC_OPENREPLAY_KEY=$NEXT_PUBLIC_OPENREPLAY_KEY

RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY entrypoint.sh /entrypoint.sh
# chown so the node user (UID 1000) can write temp files during sed -i substitution
RUN chown -R node:node /app && chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
