#!/bin/sh
# 容器启动：等数据库 → 应用迁移 → 交给服务进程。
#
# 迁移放在这里而不是镜像构建期，因为 `docker build` 的时候数据库还不可达。
set -eu

ATTEMPTS="${MIGRATE_ATTEMPTS:-30}"
DELAY="${MIGRATE_DELAY_SECONDS:-2}"

# 与 scripts/migrate.mjs 顶部的退出码约定一致，改一处记得改另一处。
#   0 成功 / 1 暂时性失败（值得重试）/ 2 永久性失败（重试没用）
EXIT_PERMANENT=2

i=1
while :; do
  code=0
  # `|| code=$?` 是为了在 `set -e` 下既拿到退出码又不中断脚本。
  node scripts/migrate.mjs || code=$?

  [ "$code" -eq 0 ] && break

  # 数据库连上了但配置不对（密码错、库不存在、SQL 报错）——
  # 再等 30 次也是同样的结果，只会刷几百行日志让人看不清重点。
  if [ "$code" -eq "$EXIT_PERMANENT" ]; then
    echo "" >&2
    echo "[entrypoint] 迁移失败，而且这个错误重试也不会好 —— 直接退出。" >&2
    echo "[entrypoint] 具体原因看上面 [migrate] 的输出，最后几行有处理办法。" >&2
    exit 1
  fi

  if [ "$i" -ge "$ATTEMPTS" ]; then
    echo "[entrypoint] 等了 $((ATTEMPTS * DELAY)) 秒还是连不上数据库，放弃启动。" >&2
    echo "[entrypoint] 检查 DB_HOST / DB_USER / DB_PASSWORD，以及 mariadb 容器是否健康：" >&2
    echo "[entrypoint]     docker compose ps" >&2
    echo "[entrypoint]     docker compose logs mariadb --tail 30" >&2
    exit 1
  fi

  echo "[entrypoint] 数据库还没就绪，等待中（$i/$ATTEMPTS）..." >&2
  i=$((i + 1))
  sleep "$DELAY"
done

echo "[entrypoint] 迁移完成，启动服务。" >&2
exec node .output/server/index.mjs
