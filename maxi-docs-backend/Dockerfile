FROM node:20-slim

# Solo las libs del sistema — dejamos que Puppeteer instale su propio Chromium
# porque el 'chromium' del apt de Debian slim es ~v128, incompatible con
# Puppeteer 24 que necesita Chrome 131+ (mismatch de protocolo CDP causa
# "Failed to launch: Code: null" al conectarse).
RUN apt-get update && apt-get install -y \
  fonts-liberation \
  fonts-noto-cjk \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  wget \
  ca-certificates \
  xdg-utils \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# NO usamos PUPPETEER_SKIP_CHROMIUM_DOWNLOAD → npm ci descarga el Chromium
# que corresponde a la versión de Puppeteer instalada. Guardamos en /app/.cache
# para que persista con el layer de node_modules.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

WORKDIR /app

COPY package*.json ./
# npm ci ejecuta el postinstall de Puppeteer que descarga Chromium 131 (o el
# que corresponda a puppeteer 24.9). Se guarda en PUPPETEER_CACHE_DIR.
RUN npm ci --omit=dev

COPY . .

# Bust cache cuando el schema cambia — incrementar este número para forzar rebuild
ARG CACHE_BUST=3
RUN mkdir -p uploads/documents uploads/thumbnails

EXPOSE 3001
CMD ["sh", "-c", "node src/db/migrate.js; node server.js"]
