#!/bin/bash
# electron-builder's default steps (symlink, chrome-sandbox, desktop database), plus the udev rule.

if type update-alternatives >/dev/null 2>&1; then
  if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
    rm -f '/usr/bin/${executable}'
  fi
  update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 \
    || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
  ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then update-mime-database /usr/share/mime || true; fi
if hash update-desktop-database 2>/dev/null; then update-desktop-database /usr/share/applications || true; fi

install -Dm644 '/opt/${sanitizedProductName}/resources/50-gmk87.rules' /usr/lib/udev/rules.d/50-gmk87.rules
if hash udevadm 2>/dev/null; then
  udevadm control --reload-rules || true
  udevadm trigger --subsystem-match=hidraw --action=change || true
fi
