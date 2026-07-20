#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo deploy/ec2/refresh-cloudflare-ips.sh"
  exit 1
fi

target=/etc/nginx/conf.d/cloudflare-realip.conf
temporary="$(mktemp)"
trap 'rm -f "${temporary}"' EXIT

{
  echo '# Generated from Cloudflare official IP range endpoints.'
  for endpoint in https://www.cloudflare.com/ips-v4/ https://www.cloudflare.com/ips-v6/; do
    curl -fsSL "${endpoint}" | awk 'NF { print "set_real_ip_from " $1 ";" }'
  done
  echo 'real_ip_header CF-Connecting-IP;'
  echo 'real_ip_recursive on;'
} > "${temporary}"

install -m 644 "${temporary}" "${target}"
nginx -t
if systemctl is-active --quiet nginx; then
  systemctl reload nginx
fi
