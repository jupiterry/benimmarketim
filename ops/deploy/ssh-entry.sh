#!/bin/bash
# Installed root-owned outside the checkout. Do not evaluate the SSH command.
set -euo pipefail
if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})\ (/var/www/benimmarketim)$ ]]; then
  exec sudo -n /usr/local/sbin/benimmarketim-deploy deploy "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
fi
echo 'Only the deployment command is allowed.' >&2
exit 1
