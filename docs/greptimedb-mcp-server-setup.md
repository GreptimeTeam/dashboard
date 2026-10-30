# GreptimeDB MCP Server 安装配置指南

[greptimedb-mcp-server](https://github.com/GreptimeTeam/greptimedb-mcp-server) 是 GreptimeDB 官方的 Model Context Protocol (MCP) 服务器，让 AI Agent（Claude Desktop / Claude Code / Cursor / OpenCode 等）直接查询和分析 GreptimeDB。

核心能力：

- **查询**：`execute_sql`（SQL）、`execute_tql`（PromQL 兼容）、`query_range`（时间窗聚合）、`explain_query`（执行计划）
- **元信息**：`describe_table`、`health_check`、语义目录查询（需 GreptimeDB 1.3）
- **管理**：Pipeline 增删查/试跑、Perses 仪表盘管理
- **安全**：默认只读（SQL 安全门拦截 DDL/DML）、敏感列自动脱敏、审计日志

包名：`greptimedb-mcp-server`（[PyPI](https://pypi.org/project/greptimedb-mcp-server/)，MIT 协议）

---

## 1. 前置要求

| 项 | 要求 |
|---|---|
| Python | **>= 3.11** |
| GreptimeDB | 一个可连接的实例（本地或远程） |
| 网络 | MySQL 协议端口（默认 **4002**）；Pipeline / 仪表盘工具另需 HTTP 端口（默认 **4000**；托管实例常与 Dashboard 同域，即 443 + HTTPS） |

> 注意：MCP 的 `--port` 是 **MySQL 协议端口 4002**，不是 HTTP 端口 4000。两者混淆是最常见的连接错误。

## 2. 安装

三种方式任选其一。

### 方式 A：专用 venv（推荐，隔离干净）

```bash
# 创建独立虚拟环境（路径可自定义）
python3 -m venv ~/.mcp-env

# 安装（之后无需激活，直接用全路径）
~/.mcp-env/bin/pip install greptimedb-mcp-server
```

安装后二进制位于 `~/.mcp-env/bin/greptimedb-mcp-server`。

### 方式 B：uvx（免安装，按需拉取）

已安装 [uv](https://docs.astral.sh/uv/) 的话，无需预先安装任何东西，配置里直接用 `uvx` 拉起（首次运行自动从 PyPI 下载）：

```bash
uvx greptimedb-mcp-server --host localhost --database public
```

### 方式 C：全局 pip（最简单，适合个人机）

```bash
pip install greptimedb-mcp-server
```

### 升级

```bash
# 方式 A / C
pip install -U greptimedb-mcp-server        # venv 方式用 ~/.mcp-env/bin/pip
# 方式 B
uvx greptimedb-mcp-server@latest --help
```

## 3. 连接参数

CLI 参数与环境变量一一对应，**CLI 优先**。常用配置：

| CLI 参数 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `--host` | `GREPTIMEDB_HOST` | `localhost` | 数据库地址 |
| `--port` | `GREPTIMEDB_PORT` | `4002` | MySQL 协议端口 |
| `--database` | `GREPTIMEDB_DATABASE` | `public` | 默认数据库 |
| `--user` | `GREPTIMEDB_USER` | `root` | 用户名 |
| `--password` | `GREPTIMEDB_PASSWORD` | `""` | 密码 |
| `--timezone` | `GREPTIMEDB_TIMEZONE` | `UTC` | 会话时区 |
| `--http-port` | `GREPTIMEDB_HTTP_PORT` | `4000` | HTTP API 端口（Pipeline/仪表盘工具用） |
| `--http-protocol` | `GREPTIMEDB_HTTP_PROTOCOL` | `http` | HTTP API 协议（`http` / `https`） |
| `--mask-enabled` | `GREPTIMEDB_MASK_ENABLED` | `true` | 敏感数据脱敏 |
| `--audit-enabled` | `GREPTIMEDB_AUDIT_ENABLED` | `true` | 审计日志 |
| `--allow-write` | `GREPTIMEDB_ALLOW_WRITE` | `false` | **危险**：允许写操作，见 §7 |
| `--transport` | `GREPTIMEDB_TRANSPORT` | `stdio` | 本机 Agent 用默认 stdio 即可 |

> **托管 / 反向代理实例**：HTTP API 通常与 Dashboard 同域（`https://<host>` 的 443），而 4000 不对外开放。这种情况要同时给 `--http-port 443 --http-protocol https`，否则 Pipeline / 仪表盘工具会报连接失败——查询类工具不受影响，它们走 MySQL 4002。
>
> Dashboard 里的「GreptimeDB MCP」弹窗会按当前连接自动生成 args：HTTPS 部署自动带 `--http-port` / `--http-protocol`，MySQL 端口为默认 4002 时省略 `--port`；prompt 末尾还会附一段连接说明，随复制一起带走。

验证安装：

```bash
greptimedb-mcp-server --host localhost --database public
# 正常会挂起等待 stdio 输入（无报错即连接成功），Ctrl+C 退出
```

## 4. 在 Agent 中配置

MCP 客户端的通用形态都是「command + args」：**agent 启动时自动拉起该进程（stdio 传输），会话结束自动回收，不需要手动运行服务器命令**。以下按客户端给出配置，路径按你的安装方式替换。

### 4.1 Claude Desktop

配置文件路径：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "greptimedb": {
      "command": "greptimedb-mcp-server",
      "args": ["--host", "localhost", "--database", "public"]
    }
  }
}
```

venv 安装（方式 A）时 `command` 用全路径：

```json
{
  "mcpServers": {
    "greptimedb": {
      "command": "/Users/<you>/.mcp-env/bin/greptimedb-mcp-server",
      "args": ["--host", "localhost", "--port", "4002", "--database", "public", "--user", "mcp_readonly", "--password", "<your_password>"]
    }
  }
}
```

也可以把连接信息放到 `env`，命令行保持干净：

```json
{
  "mcpServers": {
    "greptimedb": {
      "command": "/Users/<you>/.mcp-env/bin/greptimedb-mcp-server",
      "args": ["--host", "localhost", "--database", "public"],
      "env": {
        "GREPTIMEDB_USER": "mcp_readonly",
        "GREPTIMEDB_PASSWORD": "<your_password>"
      }
    }
  }
}
```

### 4.2 Claude Code

```bash
# 全局安装（方式 C）
claude mcp add greptimedb -- greptimedb-mcp-server --host localhost --database public

# venv 安装（方式 A）
claude mcp add greptimedb -- ~/.mcp-env/bin/greptimedb-mcp-server --host localhost --database public

# uvx（方式 B）
claude mcp add greptimedb -- uvx greptimedb-mcp-server --host localhost --database public

# 带认证
claude mcp add greptimedb \
  --env GREPTIMEDB_USER=mcp_readonly \
  --env GREPTIMEDB_PASSWORD=<your_password> \
  -- greptimedb-mcp-server --host localhost --database public
```

### 4.3 Cursor

配置文件：`~/.cursor/mcp.json`（全局）或项目根 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "greptimedb": {
      "command": "/Users/<you>/.mcp-env/bin/greptimedb-mcp-server",
      "args": ["--host", "localhost", "--database", "public"]
    }
  }
}
```

### 4.4 OpenCode

配置文件：`~/.config/opencode/opencode.json`（或 `opencode.jsonc`），结构与上面略有不同：

```jsonc
{
  "mcp": {
    "greptimedb": {
      "type": "local",
      "command": [
        "/Users/<you>/.mcp-env/bin/greptimedb-mcp-server",
        "--host", "localhost",
        "--port", "4002",
        "--database", "public",
        "--user", "mcp_readonly",
        "--password", "<your_password>"
      ],
      "enabled": true
    }
  }
}
```

> 修改配置后需重启 agent 会话才会重新拉起 MCP 进程。

### 4.5 其他 MCP 客户端 / 远程部署

所有支持 stdio MCP 的客户端，填法同 4.1。对于容器 / Kubernetes 场景，可以让服务器以 HTTP 模式运行、多个客户端共享：

```bash
# 服务端（Streamable HTTP，生产推荐）
greptimedb-mcp-server --transport streamable-http --listen-port 8080

# 旧版 SSE
greptimedb-mcp-server --transport sse --listen-port 3000
```

客户端侧改为连接 URL（各客户端的 remote/HTTP MCP 配置格式不同，按其文档填写）。

## 5. 验证

1. **命令行自检**：

   ```bash
   greptimedb-mcp-server --help
   ```

2. **MCP Inspector 交互调试**（官方工具，可浏览工具列表、手动调用）：

   ```bash
   npx @modelcontextprotocol/inspector uvx greptimedb-mcp-server --host localhost --database public
   ```

3. **在 Agent 内验证**：让 agent 调用 `health_check` 工具，正常返回 `status: healthy`、GreptimeDB 版本和响应时间。

## 6. 安全建议

### 只读数据库账号（推荐）

给 MCP 单独建一个只读账号，而不是复用 `root`。GreptimeDB 静态用户配置（`user_provider` 文件）按 `username:password=permission` 一行一个：

```text
mcp_readonly:readonly=<your_secure_password>
```

权限模式说明见 [GreptimeDB 文档](https://docs.greptime.com/user-guide/deployments-administration/authentication/static/#permission-modes)。

### 应用层安全门

即使账号有写权限，服务器默认也只放行 `SELECT / SHOW / DESCRIBE / TQL / EXPLAIN`，`DROP / DELETE / INSERT / ALTER / CREATE` 等一律拦截（含 hex/UNHEX/CHAR 编码绕过检测）。

### 写模式（默认关闭）

```bash
GREPTIMEDB_ALLOW_WRITE=true greptimedb-mcp-server   # 或 --allow-write true
```

> ⚠️ 开启后 AI 可以对数据库执行 DDL/DML 及 Pipeline/仪表盘增删。**切勿对生产库开启**；只需读时务必配合只读账号。

### 其他内建防护

- **脱敏**：`password`、`secret`、`token`、`api_key`、`credit_card`、`ssn` 等列名模式自动打码，可用 `--mask-patterns phone,email` 追加
- **审计**：每次工具调用记录到日志（`--audit-enabled false` 关闭）
- **结果上限**：单个工具结果默认 1 MiB（`GREPTIMEDB_MAX_RESULT_BYTES`）

## 7. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 连接超时 / 拒绝 | `--port` 误用了 HTTP 端口 4000；MySQL 协议端口是 **4002** |
| Pipeline / 仪表盘工具报错 | 检查 HTTP 端口可达（默认 4000，`--http-port` 可改）；托管实例多为 `--http-port 443 --http-protocol https` |
| 复制的 Dashboard SQL 报 `INTERVAL requires a unit` 或 `Error parsing timestamp from 'timestamp'` | MCP 走 MySQL 方言：标识符用反引号（`` `timestamp` ``），时间窗用 `INTERVAL 15 MINUTE` 或 `'15 minutes'::interval`；双引号会被当作字符串字面量。引导里的示例 SQL 已按这种写法给出 |
| 写操作被拒 | 安全门拦截，属预期行为；确需写入见 §6 写模式 |
| Agent 中看不到工具 | 配置文件路径/JSON 格式错误；改配置后未重启 agent；`command` 未用全路径（venv 方式） |
| `421 Invalid Host Header` | HTTP 模式下 DNS rebinding 防护拦截，用 `--allowed-hosts` 加入你的主机名 |
| 语义类工具（`search_table_semantics` 等）无结果 | 需要 GreptimeDB **1.3+** 的 `information_schema.table_semantics`，且表需带 `greptime.semantic.*` 选项 |
| 结果被截断 | 触达 1 MiB 上限，属预期的防炸保护；可在客户端允许范围内调大 `GREPTIMEDB_MAX_RESULT_BYTES` |

## 8. 参考

- 仓库与 README：<https://github.com/GreptimeTeam/greptimedb-mcp-server>
- PyPI：<https://pypi.org/project/greptimedb-mcp-server/>
- MCP Registry：`io.github.GreptimeTeam/greptimedb-mcp-server`
- LLM 使用说明（prompt 模板等）：<https://github.com/GreptimeTeam/greptimedb-mcp-server/blob/main/docs/llm-instructions.md>
- GreptimeDB 技能索引（部署/写入/建模等进阶指引）： <https://docs.greptime.com/SKILL.md>
