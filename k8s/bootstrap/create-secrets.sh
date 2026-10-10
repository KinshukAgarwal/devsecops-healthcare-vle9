#!/usr/bin/env bash
# Generates random credentials into ~/lab-secrets (mode 600) and loads them as Kubernetes Secrets.
# Values never appear in Git, in logs or on screen.
set -euo pipefail
S=~/lab-secrets; mkdir -p "$S"; chmod 700 "$S"
gen(){ [ -s "$S/$1" ] || (umask 077; openssl rand -base64 24 | tr -d '/+=\n' > "$S/$1"); }
gen db-password; gen app-auth-password; gen app-session-secret; gen grafana-admin-password
kubectl -n healthcare create secret generic db-secret \
  --from-file=password="$S/db-password" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n healthcare create secret generic app-secret \
  --from-file=auth-password="$S/app-auth-password" --from-file=session-secret="$S/app-session-secret" \
  --dry-run=client -o yaml | kubectl apply -f -
