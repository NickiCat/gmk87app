FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg build-essential fakeroot dpkg-dev python3 git \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm test && npm run build
CMD ["bash", "docker/package.sh", "deb"]
