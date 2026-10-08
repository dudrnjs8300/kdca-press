FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force
COPY src ./src
COPY web ./web
COPY packages ./packages
COPY scripts/build-packages.py ./scripts/build-packages.py
RUN python3 scripts/build-packages.py && mkdir -p web/downloads && cp dist/kdca-press-skill.zip dist/kdca-press-gemini.zip dist/kdca-press-plugin.zip web/downloads/ && chown -R node:node /app
USER node
ENV PORT=10000 PYTHONDONTWRITEBYTECODE=1
EXPOSE 10000
CMD ["node","src/remote.js"]
