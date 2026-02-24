#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME=${CLUSTER_NAME:-vibe-kanban}
IMAGE_NAME=${IMAGE_NAME:-vibe-kanban:kind}

if ! command -v kind >/dev/null 2>&1; then
  echo "[erro] kind não encontrado no PATH" >&2
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "[erro] kubectl não encontrado no PATH" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[erro] docker não encontrado no PATH" >&2
  exit 1
fi

if ! kind get clusters | grep -Fx "$CLUSTER_NAME" >/dev/null 2>&1; then
  echo "[info] criando cluster kind: $CLUSTER_NAME"
  kind create cluster --name "$CLUSTER_NAME"
else
  echo "[info] cluster kind já existe: $CLUSTER_NAME"
fi

echo "[info] construindo imagem: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" .

echo "[info] carregando imagem no kind"
kind load docker-image "$IMAGE_NAME" --name "$CLUSTER_NAME"

echo "[info] aplicando manifests"
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

echo "[info] aguardando rollout"
kubectl -n vibe-kanban rollout status deployment/vibe-kanban --timeout=120s

echo "[ok] pronto. para acessar localmente rode:"
echo "kubectl -n vibe-kanban port-forward svc/vibe-kanban 5174:5174"
