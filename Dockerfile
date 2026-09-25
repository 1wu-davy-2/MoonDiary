# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 月笺 —— 多阶段构建。产物是 Nitro node-server preset 的 .output/。
#
# 迁移**不在**构建期跑：docker build 的时候数据库还不存在。
# 它由 docker/entrypoint.sh 在容器启动时执行。
# ---------------------------------------------------------------------------

# ---- 依赖（全部，含 devDependencies —— 构建需要 vite/typescript）-----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 构建 -------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 生产依赖 ---------------------------------------------------------------
# entrypoint 里的 scripts/migrate.mjs 是普通 node 进程（不经打包），
# 需要能从项目根解析 mysql2，所以运行阶段必须留一份 node_modules。
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- 运行 -------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    # 不绑 0.0.0.0 的话容器外部访问不到（srvx 会退回 loopback）。
    HOST=0.0.0.0

WORKDIR /app

# tini 作为 PID 1：没有它，node 收不到转发信号，docker stop 每次都要等超时。
RUN apk add --no-cache tini \
 && addgroup -S -g 1001 nodejs \
 && adduser  -S -u 1001 -G nodejs appuser

COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=build     --chown=appuser:nodejs /app/.output      ./.output
COPY --chown=appuser:nodejs package.json                ./
COPY --chown=appuser:nodejs migrations                  ./migrations
COPY --chown=appuser:nodejs scripts/migrate.mjs         ./scripts/migrate.mjs
COPY --chown=appuser:nodejs scripts/migration-plan.mjs  ./scripts/migration-plan.mjs
COPY --chown=appuser:nodejs docker/entrypoint.sh        /usr/local/bin/entrypoint.sh
# 去掉可能的 CR：在 Windows 上编辑过的 shell 脚本会变成 CRLF，
# 而 Alpine 的 sh 遇到 CRLF 只会报 "not found"，排查起来很费劲。
RUN chmod +x /usr/local/bin/entrypoint.sh \
 && sed -i 's/\r$//' /usr/local/bin/entrypoint.sh

USER appuser
EXPOSE 3000

# 只探进程是否在服务，不碰数据库 —— 数据库抖动不该让 Docker 重启一个健康的容器。
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
