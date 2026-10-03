# 个人 Desktop 验证参考

[English](README.md) | 中文

本文定义个人联网候选包及其验证边界。固定官方基线仍见[来源锁](../m0/source-lock.json)。应用使用官方 Host、Agent loop、Session writer 和模型设置；发行 overlay 负责账号、遥测和更新策略。企业现场验收已由用户暂缓，不作为本候选包的前置条件。

## 身份与配置

将 `apps/desktop/.env.windows.personal.example` 选作本地 `.env.windows` 配置。App ID 为 `io.github.nidofy.dsh.desktop`，产品名为 `Nidofy DSH Desktop`，外部协议为 `nidofy-dsh`。数据默认位于 `%APPDATA%/Nidofy DSH Desktop/{electron,harness}`。`NIDOFY_DESKTOP_DATA_ROOT` 可指定绝对测试或部署根目录；忽略环境中的 `DSH_HOME`。不会自动导入现有官方版、内网版或 Tauri 数据。

最终 `personal.patch.yml` overlay 保留可选的官方账号登录，并禁用产品及会话遥测、反馈和 API Session 日志附带。浏览器网络访问、公网工具和在线插件管理保留上游可用性。该模式不是网络沙箱。fork 不订阅官方更新源；退出应用后替换完整应用包，保留独立数据目录。

通过 设置 → 模型 → 添加模型提供商 配置目录提供商或自定义 API，分别填写协议、base URL、凭据和模型列表。OpenAI Chat Completions 在 API base 后附加 `/chat/completions`，base 通常以 `/v1` 结尾。Anthropic Messages 附加 `/v1/messages`；再填一个 `/v1` 会重复该路径段。应以实际网关的 endpoint 契约为准。API base URL 不会自动成为 HTTP 代理。

## 构建与验证

选择个人环境后使用既有 Desktop 打包入口。Windows 未签名目录产物为 `apps/desktop/.desktop-build/targets/win-x64/personal-unsigned/win-unpacked`。须保留 `Nidofy DSH Desktop.exe` 所在的完整目录，不能只复制 exe。签名产物使用同级 `personal` 目录。同一目标仍共享运行时准备目录，各发行模式不要并发构建。

打包后使用已验证的内置 Node 运行 `node migration/personal/smoke-desktop.mjs`。脚本启动隔离的真实 Electron 实例，检查官方输入框与模型页面，并调用正常认证的 Host RPC。本地 OpenAI/Anthropic 流式 fixture 严格校验协议路径，使用同名模型和独立测试凭据，并要求完整回合出现在持久化 Session 历史中。脚本还检查过期设置修订被拒绝、下一轮使用新 Key，以及重启后设置、凭据和历史保留。不会打开真实用户数据或提供真实 API 凭据。

脚本单独测量 Chromium 对 `https://example.com/` 的 HTTPS 访问，并记录实际状态。即使本地协议验证通过，公网探测失败仍保留在 `publicNetwork` 中；认定公网连通已验证前必须检查 `publicNetwork.ok`。插件管理接口可用不代表插件安装成功。上游默认可能禁用可选索引，因此持久化验证不依赖搜索，而是按官方 projection 游标读取历史。

本次记录、包哈希、脱敏运行时日志和截图见[证据](evidence/summary.json)。官方打包运行时检查覆盖内置原生模块、终端、文件搜索、pnpm 和 DOCX/XLSX/PPTX 转换。模拟模型回复证明应用集成链路，不证明付费提供商的凭据、配额、推理或工具行为。浏览器侧栏导航、真实网页搜索、第三方 MCP 和插件安装仍需各自的 endpoint 测试。

## 迁移剩余边界

本文记录初始个人候选。后续 [M2 实现](../m2/README.zh.md)增加不可变连接修订、凭据租约、重试绑定、事务恢复、目录/payload 适配、副本导入和首个原生保护切片。M2 独立证据标识当前包；本文早期包哈希保留为历史记录。M3 工程流程及完整保护/恢复仍待完成。跟随上游时，将窄范围组合改动移植到明确固定的版本，并重复连接、数据、保护及打包运行时验收。
