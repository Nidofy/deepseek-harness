# Nidofy 内网发行版

[English](README.md) | 中文

Windows x64 内网包使用官方 Desktop Host 和 Web 应用，末尾加载打包内的策略覆盖层。运行时版本与 bundled DSH 保持一致，发行修订单独记录在包清单的 `dshDistribution` 中。策略不修改 Agent loop，也不削弱运行时描述、包集、Office 或签名验证。

## 构建与启动

将 `apps/desktop/.env.windows.intranet.example` 复制为 `apps/desktop/.env.windows`，使用锁定工具链运行 `pnpm --dir apps/desktop run package:win:x64:dir --unsigned`。构建期依赖准备需要获准的构建网络，或已填充且经过校验的缓存。生成的 `Nidofy DSH Intranet.exe` 所在目录携带 Node、Python、Office、pnpm 和 DSH，首启不安装依赖。未签名产物用于开发验证，不是签名发行包。

应用使用 App ID `io.github.nidofy.dsh.intranet`、外部协议 `nidofy-dsh-intranet` 和 `%APPDATA%/Nidofy DSH Intranet/{electron,harness}`。`NIDOFY_DESKTOP_DATA_ROOT` 可指定绝对父目录，用于隔离验证或受管部署。外部 `DSH_HOME` 不重定向内网应用。Profile 锁、本地凭据和 Session 数据位于独立 Harness home；Chromium 分区位于独立 Electron home。内部 `dsh-app` 文档协议仅在进程内使用，不注册为系统 URL 关联。Loopback 服务分配空闲端口。

## 策略

包内 `resources/intranet.patch.yml` 在 profile 和 home patch 后加载。它禁用账号 provider/controller、产品分析及 exporter、session telemetry、反馈提交、API Session 日志附带、公网工具和在线插件管理。核心本地 Session 持久化与导出仍可用。第三方 bundle 属于可执行代码：profile 不是安全沙箱，任意本地安装代码需要管理员审查。可选 bundle 必须经构建流程准备，在线安装不可用。

Main 直接进入工作区，只读取本地语言设置，不订阅账号状态；该模式忽略强制更新元数据，不启动自动更新检查。账号过期不会让用户返回欢迎页。更新操作说明采用完整离线包替换。关闭应用、保留数据、校验替换包后，按完整组合部署；不要仅替换 Host 或个别依赖。内网构建配置拒绝混入在线发布设置；签名离线包仍要求正常签名配置。

默认 Chromium session 仅访问当前已认证本地 Host 或包内/本地资源。Sidebar guest 不访问网络，壳拥有的外部链接不打开浏览器。策略不拦截任意 Node socket、模型请求、MCP、Git 或 shell/build 子进程。企业网关必须将这些进程限制在获准服务范围内。API 的 `base URL + API Key` 描述模型网关，不是通用 HTTP 代理，不能自动写入 `HTTP_PROXY`。凭据和模型连接迁移属于 M2。

## 验证

打包后运行 `node migration/m1/smoke-desktop.mjs`。脚本创建私有数据目录，不提供凭据，检查直接进入本地工作区和重启，通过本地接收端验证 Chromium 请求拒绝，构造冲突 profile 验证末尾策略优先级，并同时启动保留的 M0 官方基线包。M0 包应位于 `.desktop-build/qualification/m0-official-win-unpacked`；脚本不使用用户真实的官方 home。结果和截图写入 `.desktop-build/qualification`。

该测试不认证断网机器或企业网关。现场需检查获准的模型/MCP/制品服务、Node 与 shell/Git 子进程对不允许地址的拒绝、重定向处理，以及不向其他来源转发认证。证据中不得包含真实 API Key。记录网关策略修订和脱敏的目标/端口结果。[网络清单](network-inventory.json) 区分应用与部署责任。

部署方说明现场使用 `http://172.16.10.6:18080` 并阻断公网，构建机无法访问。现场使用包内工具 Node 运行 `node migration/m1/probe-site-network.mjs http://172.16.10.6:18080 https://example.com site-network.json`。无凭据探测仅测量 Node 和 PowerShell 子进程的 TCP 可达性。通过结果必须附企业规则/审计证据；它不证明 API 认证、HTTP 重定向策略、Git/MCP 行为或全部可能目标。

## 跟随上游

将少量 Desktop 构建/Main/Host 修改 rebase 到固定官方发行基线。在启用新包前，对照两份官方 bundle patch 审查最终策略的 row ID。重跑发行测试、官方包验证和真实桌面验证；执行上游账号/更新测试，保护默认发行模式。仅在明确升级基线时更新 `migration/m0/source-lock.json`，保留历史证据。产品功能使用官方 Host，不启动第二个 supervisor。
