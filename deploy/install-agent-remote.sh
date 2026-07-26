#!/usr/bin/env bash
# One-line remote installer for the VPS monitoring agent.
#
# Usage (run as root):
#   curl -fsSL https://raw.githubusercontent.com/AimoCY/cloudcone_dashboard/main/deploy/install-agent-remote.sh \
#     | sudo VPS_ID=vps-b TOKEN=xxxxxxxx DASHBOARD_URL=https://your-dashboard.example.com:9443/ingest bash
#
# Environment variables:
#   VPS_ID         (required) unique id; must match a dashboard agents[].id
#   TOKEN          (required) bearer token for this VPS
#   DASHBOARD_URL  (required) e.g. https://your-dashboard.example.com:9443/ingest
#   AGENT_URL      (default: prebuilt linux/amd64 binary from this repo)
#   LABEL          (default: this host's public IP)
#   TRAFFIC_RESET_DAY (default: 1; allowed: 1..28)
set -euo pipefail

VPS_ID="${VPS_ID:?set VPS_ID}"
TOKEN="${TOKEN:?set TOKEN}"
DASHBOARD_URL="${DASHBOARD_URL:?set DASHBOARD_URL}"
AGENT_URL="${AGENT_URL:-https://raw.githubusercontent.com/AimoCY/cloudcone_dashboard/main/bin/vps-agent-linux-amd64}"
LABEL="${LABEL:-$(curl -fsSL --max-time 10 https://api.ipify.org 2>/dev/null || hostname)}"
TRAFFIC_RESET_DAY="${TRAFFIC_RESET_DAY:-1}"

[ "$(id -u)" = "0" ] || { echo "error: run as root (sudo)"; exit 1; }
case "$TRAFFIC_RESET_DAY" in
  ''|*[!0-9]*) echo "error: TRAFFIC_RESET_DAY must be 1..28"; exit 1 ;;
esac
[ "$TRAFFIC_RESET_DAY" -ge 1 ] && [ "$TRAFFIC_RESET_DAY" -le 28 ] || {
  echo "error: TRAFFIC_RESET_DAY must be 1..28"; exit 1;
}
case "$VPS_ID$TOKEN$DASHBOARD_URL$LABEL" in
  *$'\n'*|*$'\r'*) echo "error: configuration values must be single-line"; exit 1 ;;
esac

yaml_quote() {
  local value="${1//\'/\'\'}"
  printf "'%s'" "$value"
}

echo "Installing vps-agent — id=$VPS_ID label=$LABEL dashboard=$DASHBOARD_URL"

# Dedicated unprivileged system user.
id vps-agent >/dev/null 2>&1 || \
  useradd --system --no-create-home --shell /usr/sbin/nologin vps-agent

# Binary.
curl -fsSL "$AGENT_URL" -o /usr/local/bin/vps-agent
chmod 0755 /usr/local/bin/vps-agent

# Config (0600, owned by vps-agent — contains the token).
install -d -m 0755 /etc/vps-agent
umask 077
{
  printf 'dashboard_url: '; yaml_quote "$DASHBOARD_URL"; printf '\n'
  printf 'token: '; yaml_quote "$TOKEN"; printf '\n'
  printf 'vps_id: '; yaml_quote "$VPS_ID"; printf '\n'
  printf 'label: '; yaml_quote "$LABEL"; printf '\n'
  printf 'sample_interval_sec: 5\n'
  printf 'traffic_reset_day: %s\n' "$TRAFFIC_RESET_DAY"
  printf 'state_path: /var/lib/vps-agent/state.json\n'
} > /etc/vps-agent/config.yaml
chown vps-agent:vps-agent /etc/vps-agent/config.yaml
chmod 0600 /etc/vps-agent/config.yaml

# systemd unit.
cat > /etc/systemd/system/vps-agent.service <<'UNIT'
[Unit]
Description=VPS metrics agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/vps-agent -config /etc/vps-agent/config.yaml
Restart=always
RestartSec=5
User=vps-agent
StateDirectory=vps-agent

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now vps-agent
sleep 2
if systemctl is-active --quiet vps-agent; then
  echo "vps-agent installed and running."
else
  echo "vps-agent failed to start — check: journalctl -u vps-agent -n 30"
  exit 1
fi
