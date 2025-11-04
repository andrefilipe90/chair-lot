#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] DATABASE_URL não definido." >&2
  exit 1
fi

# Garantir que o Prisma esteja atualizado com o schema antes de iniciar.
echo "[entrypoint] Executando prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] Executando prisma generate..."
npx prisma generate

echo "[entrypoint] Iniciando aplicação..."
exec "$@"
