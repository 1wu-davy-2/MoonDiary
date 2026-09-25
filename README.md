# 月笺 · 中秋贺卡

写一封只给一个人看的月亮，生成一条分享链接发给对方。

- 选语气、挑模板、写正文、署名
- 一键生成分享链接 `/l/<短码>`，发到微信/QQ 里能正常预览（服务端渲染 + OG 标签）
- 也能存成海报图（1080×1920）或复制成文字
- 服务端用 MariaDB 记录每封月笺的内容、创建者 IP，以及每次被打开的 IP 和时间
- `/admin` 管理后台可以看全部记录和访问明细
- **不需要注册登录**：收件人打开链接就能看，创建者的草稿和"我创建过的月笺"存在自己浏览器里

---

## 快速开始

服务器上装好 Docker 和 Docker Compose，然后：

```bash
cp .env.example .env
vim .env                 # 至少改掉 ADMIN_PASSWORD 和两个数据库密码
docker compose up -d --build
```

起来之后应用监听 `127.0.0.1:3000`（只绑回环，不直接对外）。用你自己的 nginx 反代过去。

第一次启动会等 MariaDB 就绪并自动建表，看日志确认：

```bash
docker compose logs -f app
# [migrate] applied 0001_letters.sql
```

---

## nginx 反代配置

```nginx
# 应用本身已经预压缩了静态资源（brotli + gzip），但 SSR 出来的 HTML
# 是动态生成的，要靠 nginx 压。放在 http {} 或 server {} 里都行。
gzip              on;
gzip_vary         on;
gzip_min_length   1024;
gzip_comp_level   5;
gzip_types        text/plain text/css application/javascript application/json
                  image/svg+xml application/manifest+json;

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # 这三行不是可选的：
        #   X-Forwarded-For   —— 不传的话所有访问记录都是容器内网 IP
        #   X-Forwarded-Proto —— 不传的话生成的分享链接会是 http://
        #   X-Forwarded-Host  —— 不传的话分享链接会变成 http://<容器名>:3000
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
```

> **关于 `X-Forwarded-For`**：`$proxy_add_x_forwarded_for` 是**追加**在客户端自带值后面的，
> 所以这个头的**第一段是访客可以随便伪造的**，最后一段才是真实 IP。
> 应用默认按"从右往左数第 1 段"取值（`TRUSTED_PROXY_HOPS=1`），正好取到真实 IP。
> 如果你前面还套了 Cloudflare 之类的 CDN，把它改成 `2`。

宝塔面板用户：在「网站 → 设置 → 反向代理」里加代理到 `http://127.0.0.1:3000`，
并在「配置文件」里补上上面那几行 `proxy_set_header`。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `yuejian` / `yuejian` | 应用连库用，同时用于 MariaDB 初始化 |
| `DB_ROOT_PASSWORD` | — | **必填**，MariaDB root 密码，仅供维护 |
| `DB_POOL_SIZE` | `10` | 连接池大小 |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / `admin@123` | **务必改掉**，后台登录用 |
| `ADMIN_SESSION_SECRET` | 空 | 留空则由 `ADMIN_PASSWORD` 派生；填了就填 32 位以上随机串 |
| `PUBLIC_BASE_URL` | 空 | 生成分享链接用的域名。留空则从请求头推断，反代正常时够用 |
| `APP_PORT` / `APP_BIND` | `3000` / `127.0.0.1` | 对外暴露的端口和网卡 |
| `TRUST_PROXY` | `true` | 前面有反代就保持 true；**端口直接暴露到公网时必须改 false** |
| `TRUSTED_PROXY_HOPS` | `1` | 应用前面有几层可信代理 |
| `COOKIE_SECURE` | `false` | 站点上了 HTTPS 后建议改成 `true` |

---

## 管理后台

访问 `/admin`，用 `.env` 里的 `ADMIN_USER` / `ADMIN_PASSWORD` 登录。

- 概览：月笺总数、打开次数、今日新建、独立访客
- 列表：按分享码或"写给谁"搜索，分页
- 详情：完整正文、创建者 IP 与 User-Agent、每次访问的 IP / 时间 / 来源

几点安全设计：

- 登录失败 15 分钟内超过 10 次会被临时挡住
- 会话是 httpOnly + SameSite=Lax 的加密 Cookie，前端 JS 读不到
- 所有后台接口都会**独立校验会话**，不是靠前端路由挡
- 页面带 `noindex`，不会被搜索引擎收录

> 仍在用默认密码时，后台顶部会一直显示警告条。

---

## 本地开发

```bash
npm install
npx playwright install chromium   # 只有跑测试和生成图标需要

cp .env.example .env
# 把 DB_HOST 改成 127.0.0.1、DB_PORT 改成你本地 MariaDB 的端口

npm run db:migrate
npm run dev                       # http://localhost:8080
```

`vite.config.ts` 会把 `.env` 注入 `process.env`，所以本地和容器里的配置方式一致。

常用命令：

```bash
npm run dev         # 开发服务器，8080
npm run build       # 生产构建，产物在 .output/
npm start           # 跑生产构建（需要先 build）
npm run typecheck   # 类型检查
npm run db:migrate  # 应用 migrations/ 下的迁移
npm test            # 单元测试
npm run smoke       # 端到端冒烟测试（需先起服务，Playwright 驱动真实浏览器）

# 静态资源（产物已提交，只在换图/换字体时才需要重跑）
npm run fonts       # 重新抓取并自托管 Noto Serif SC
npm run images      # 从 assets/source/ 生成页面尺寸的图片
npm run icons       # 从 moon.jpg 生成 PWA 图标
```

---

## 体积与性能

主要受众是手机，所以这几项是刻意处理过的：

**中文字体自托管。** 站点观感依赖衬线中文，而 `fonts.googleapis.com` 在国内手机上打不开 ——
降级后 iOS 有「宋体」还撑得住，国内安卓普遍没有衬线中文字体，会掉到无衬线。
所以字体下载到 `public/fonts/`（`npm run fonts`），Google 的 CSS 按 `unicode-range`
切成 202 个小片，浏览器只下载页面真正用到的那几片。

实测首次访问的字体传输量：

| 页面 | 400 字重 | 500 字重 | 合计 |
|---|---|---|---|
| 分享页 | 10 片 / 680 KB | 7 片 / 466 KB | **1146 KB** |
| 首页 | 16 片 / 1152 KB | 9 片 / 653 KB | **1804 KB** |

字体文件带内容哈希，配了 `immutable` 一年缓存 —— **只有第一次访问要下**。
觉得大可以只保留 400 字重（把 `scripts/fetch-fonts.mjs` 里的 `WEIGHTS` 改成 `[400]`，
并把样式里的 `font-medium` 去掉），能省约 40%。

**静态资源预压缩。** nitro 默认不压缩，`public/` 下的文件会原样传输。
已在 `vite.config.ts` 打开 `compressPublicAssets`：字体 CSS 从 205 KB 压到 **18.7 KB**（brotli）。

**图片按显示尺寸生成。** 原图是印刷尺寸（moon.jpg 是 1408×1408 / 457 KB），
但页面上最大只画到 288 CSS px、海报里 472 px。`npm run images` 会按两倍屏生成
640px / 400px 的成品（457+244 KB → **69+21 KB**）。
原图保留在 `assets/source/`，不进镜像。

一次冷访问的完整体积（手机视口）：

| 页面 | 字体 | CSS | JS | 图片 | 合计 |
|---|---|---|---|---|---|
| 分享页 | 1146 KB | 24 KB | 121 KB | 90 KB | **约 1.4 MB** |
| 首页 | 1804 KB | 24 KB | 122 KB | 90 KB | **约 2.0 MB** |

字体是大头，且只在首次访问产生。文本用 `font-display: swap`，
字体没到之前先用系统字体渲染，不会白屏。

---

## 部署形态

```
浏览器 ──HTTPS──> 你的 nginx ──HTTP──> app 容器 (node, :3000) ──> mariadb 容器 (:3306)
                       │                      │
                  TLS / 静态资源          迁移在启动时跑
```

- **MariaDB 不对宿主机暴露端口**，只有 app 容器能连
- **迁移在容器启动时执行**（`docker/entrypoint.sh`），不是构建期 —— 构建时数据库还不存在
- 迁移文件必须写成可重复执行的（`CREATE TABLE IF NOT EXISTS` 等），因为中途失败的文件不会被记录，下次启动会重跑
- 时间戳统一按 UTC 存储，展示时转成北京时间

---

## 数据表

**`letters`** —— 一封月笺一行

| 字段 | 说明 |
|---|---|
| `id` | 8 位分享码，字符集剔除了 `0/O/1/l/I` 等易混字符 |
| `to_name` / `from_name` | 写给谁 / 署名 |
| `tone` | 语气：`heart` / `easy` / `poem` / `play` |
| `message` | 正文，最多 80 字 |
| `created_ip` / `created_ua` | 创建者 IP 与 User-Agent |
| `views` | 去重后的打开次数 |

**`letter_views`** —— 一次打开一行，记录 IP、User-Agent、来源和时间

同一 IP 对同一封月笺 30 分钟内只记一次，避免刷新刷量。访问是在页面加载后由浏览器上报的，
所以微信/QQ 抓取链接做预览时不会计入。

---

## 常见问题

**分享链接里的域名不对 / 变成 `http://xxx:3000`**
nginx 没传 `X-Forwarded-Host` 和 `X-Forwarded-Proto`。补上，或者直接设 `PUBLIC_BASE_URL`。

**访问记录里全是内网 IP**
同样，nginx 没传 `X-Forwarded-For`。

**时间显示差了几个小时**
容器时区没固定。`docker-compose.yml` 里已经设了 `TZ: UTC` 和 `--default-time-zone=+00:00`，
如果你改过这些，改回去。

**中文变成问号或乱码**
检查三处字符集：数据库、表、连接。本项目建表和连接都写死了 `utf8mb4`，
所以更可能是你自己手动建的库用了别的字符集 —— 删掉卷重建即可：
`docker compose down -v && docker compose up -d --build`（**会清空数据**）。

**后台登录提示"尝试次数过多"**
15 分钟内失败超过 10 次触发的保护。等一会儿，或重启 app 容器（限流状态在内存里）。

**改了 `ADMIN_PASSWORD` 之后所有人都被登出了**
这是预期行为：会话密钥默认从密码派生，改密码即让旧会话全部失效。
