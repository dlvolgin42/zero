# Runs the Next.js standalone server that was built on the developer machine.
# The image only copies files, so building it on the shared server is cheap.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --chown=node:node build/standalone/ ./
COPY --chown=node:node build/static/ ./.next/static/
COPY --chown=node:node build/public/ ./public/
USER node
EXPOSE 3000
CMD ["node", "server.js"]
