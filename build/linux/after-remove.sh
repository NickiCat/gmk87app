#!/bin/bash
if type update-alternatives >/dev/null 2>&1; then
  update-alternatives --remove '${executable}' '/usr/bin/${executable}' || true
fi
if [ -L '/usr/bin/${executable}' ] && [ ! -e '/opt/${sanitizedProductName}/${executable}' ]; then
  rm -f '/usr/bin/${executable}'
fi
if [ ! -e '/opt/${sanitizedProductName}/${executable}' ]; then
  rm -f /usr/lib/udev/rules.d/50-gmk87.rules
  if hash udevadm 2>/dev/null; then udevadm control --reload-rules || true; fi
fi
