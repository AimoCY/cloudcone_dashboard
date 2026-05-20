#!/usr/bin/env bash
# Installs the vps-agent binary + systemd unit on the current host.
# Usage: sudo ./install-agent.sh /path/to/vps-agent /path/to/config.yaml
set -euo pipefail

BIN="${1:?usage: install-agent.sh <binary> <config.yaml>}"
CFG="${2:?usage: install-agent.sh <binary> <config.yaml>}"

# Dedicated unprivileged system user that owns the config and runs the service.
if ! id vps-agent >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin vps-agent
fi

install -m 0755 "$BIN" /usr/local/bin/vps-agent
install -d -m 0755 /etc/vps-agent
install -m 0600 -o vps-agent -g vps-agent "$CFG" /etc/vps-agent/config.yaml
install -m 0644 "$(dirname "$0")/vps-agent.service" /etc/systemd/system/vps-agent.service

systemctl daemon-reload
systemctl enable --now vps-agent
systemctl status vps-agent --no-pager
echo "vps-agent installed and started."
