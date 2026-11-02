#!/usr/bin/env bash
# Builds the Fedora (42+) .rpm with rpmbuild directly.
# electron-builder's bundled fpm 1.9.3 breaks on rpm >= 4.20 (Fedora 41+): it passes a buildroot the
# new rpmbuild ignores. So electron-builder only produces dist/linux-unpacked and this script packages it.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=gmk87-control
PRODUCT="GMK87 Control"
VERSION=$(node -p "require('./package.json').version")
DIST="${DIST_DIR:-$PWD/dist}"
UNPACKED="$DIST/linux-unpacked"

if [[ "${SKIP_UNPACK:-0}" != 1 ]]; then
  npx electron-builder --linux dir --x64 --publish never -c.directories.output="$DIST"
fi
[[ -x "$UNPACKED/$NAME" ]] || { echo "missing $UNPACKED/$NAME" >&2; exit 1; }

TOP=$(mktemp -d)
trap 'rm -rf "$TOP"' EXIT
mkdir -p "$TOP"/{SPECS,RPMS,SOURCES}

# electron-builder's after-install/remove templates, with its placeholders filled in.
fill() { sed -e "s/\${executable}/$NAME/g" -e "s/\${sanitizedProductName}/$PRODUCT/g" "$1"; }

cat > "$TOP/SOURCES/$NAME.desktop" <<EOF
[Desktop Entry]
Name=$PRODUCT
Comment=Configure the Zuoya GMK87 keyboard
Exec="/opt/$PRODUCT/$NAME" %U
Terminal=false
Type=Application
Icon=$NAME
StartupWMClass=$PRODUCT
Categories=Utility;Settings;HardwareSettings;
EOF

cat > "$TOP/SPECS/$NAME.spec" <<EOF
%global debug_package %{nil}
%global _build_id_links none
%global __os_install_post %{nil}
%global __strip /bin/true

Name:           $NAME
Version:        $VERSION
Release:        1
Summary:        Configurator for the Zuoya GMK87 keyboard
License:        MIT
URL:            https://github.com/NickiCat/gmk87app
AutoReqProv:    no
Requires:       gtk3, libnotify, nss, libXScrnSaver, libXtst, xdg-utils, at-spi2-core, libuuid, libsecret, systemd-libs

%description
Keymap remapping, RGB lighting, display images and clock sync for the Zuoya GMK87.

%install
mkdir -p "%{buildroot}/opt/$PRODUCT"
cp -a "$UNPACKED/." "%{buildroot}/opt/$PRODUCT/"
install -Dm644 "$PWD/build/icon.png" "%{buildroot}/usr/share/icons/hicolor/512x512/apps/$NAME.png"
install -Dm644 "$TOP/SOURCES/$NAME.desktop" "%{buildroot}/usr/share/applications/$NAME.desktop"

%post
$(fill build/linux/after-install.sh | grep -v '^#!')

%postun
# \$1 is 0 on erase, 1 on upgrade: keep the symlink and udev rule while upgrading.
if [ "\$1" -eq 0 ]; then
$(fill build/linux/after-remove.sh | grep -v '^#!')
fi

%files
"/opt/$PRODUCT"
/usr/share/applications/$NAME.desktop
/usr/share/icons/hicolor/512x512/apps/$NAME.png
EOF

rpmbuild -bb --target x86_64 \
  --define "_topdir $TOP" \
  --define "_rpmfilename %%{NAME}-%%{VERSION}.%%{ARCH}.rpm" \
  "$TOP/SPECS/$NAME.spec"

mkdir -p "$DIST"
cp "$TOP/RPMS/$NAME-$VERSION.x86_64.rpm" "$DIST/"
ls -lh "$DIST/$NAME-$VERSION.x86_64.rpm"
