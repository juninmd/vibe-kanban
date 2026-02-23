#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME=${CLUSTER_NAME:-vibe-kanban}

if ! command -v kind >/dev/null 2>&1; then
  echo "[erro] kind não encontrado no PATH" >&2
  exit 1
fi

echo "[info] removendo cluster kind: $CLUSTER_NAME"
kind delete cluster --name "$CLUSTER_NAME"
