FROM fedora:42
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN dnf install -y nodejs npm rpm-build git python3 @development-tools && dnf clean all
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm test && npm run build
# rpmbuild directly: electron-builder's bundled fpm fails with the rpm 4.20 that Fedora 42 ships.
CMD ["bash", "docker/package.sh", "rpm"]
