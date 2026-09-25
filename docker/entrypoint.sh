#!/bin/sh
# 容器启动：等数据库 → 应用迁移 → 交给服务进程。
#
# 迁移放在这里而不是镜像构建期，因为 `docker build` 的时候数据库还不可达。
set -eu

ATTEMPTS="${MIGRATE_ATTEMPTS:-30}"
DELAY="${MIGRATE_DELAY_SECONDS:-2}"

# 直接复用 migrate.mjs 当就绪探针：连不上库它非零退出，没有待应用的文件时它零退出，
# 两种情况都正好是我们要的判断。compose 里的 depends_on: service_healthy 保证
# 正常情况下这个循环只跑一次。
i=1
while :; do
  if node scripts/migrate.mjs; then
    break
  fi
  if [ "$i" -ge "$ATTEMPTS" ]; then
    echo "[entrypoint] 数据库等了 $((ATTEMPTS * DELAY)) 秒还是连不上，放弃启动。" >&2
    echo "[entrypoint] 检查 DB_HOST / DB_USER / DB_PASSWORD，以及 mariadb 容器是否健康。" >&2
    exit 1
  fi
  echo "[entrypoint] 等待数据库就绪（$i/$ATTEMPTS）..." >&2
  i=$((i + 1))
  sleep "$DELAY"
done

exec node .output/server/index.mjs
