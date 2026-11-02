FROM archlinux:base-devel
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    GEM_HOME=/opt/gems \
    PATH=/opt/gems/bin:$PATH \
    USE_SYSTEM_FPM=true
# The system fpm: the one bundled with electron-builder needs libcrypt.so.1 and can't write zstd.
RUN pacman -Syu --noconfirm --needed nodejs npm git python ruby rubygems libarchive zstd && pacman -Scc --noconfirm \
 && gem install --no-document --no-user-install fpm erb
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm test && npm run build
CMD ["bash", "docker/package.sh", "pacman"]
