# M0 验收输入

[English](README.md) | 中文

本目录记录固定官方桌面版在本地 Windows 上的验收，不启用内网发行版，也不迁移用户数据。`source-lock.json` 分别记录上游标签、依赖锁和原私有补丁序列。`couplings.json` 列出集成点与当时尚待实现的工作。

## 源码重建

从 `upstream` 获取 `dsh-v0.2.0-rc.1` 与 `dsh-v0.1.7-alpha.2` 后，运行 `node migration/m0/verify-source.mjs`。校验器检查依赖锁和补丁字节，通过私有 Git 索引重建旧 fork，并比较完整目录树。它不向当前 checkout 应用补丁。补丁文件使用二进制 Git 属性保存，防止检出时的换行转换改变摘要。

归档补丁是源码恢复输入，并非可直接用于 rc.1 的补丁。其生成目录、翻译记录和事件声明需要明确移植。M0 不改变生产模型请求。

## 构建与运行时验收

使用 `npm exec --yes --package=pnpm@11.7.0 -- pnpm install --frozen-lockfile` 安装。已测试的本地命令是 `pnpm --dir apps/desktop run package:win:x64:dir --unsigned`，保留已批准的上游版本 `0.2.0-rc.1`。在被忽略的 `apps/desktop/.env.windows` 中配置私有应用 ID，以及仅回环访问的强制策略/更新来源；此验收配置不得用于正式发行。不需要签名或上传凭据。

`smoke-desktop.mjs` 使用锁文件对应的 Playwright、独立 Harness 和 Electron 数据目录，以及关闭产品分析的测试组合。它检查打包后的欢迎页 IPC、等待实际输入框、截图并关闭应用。它不发送模型请求，也不证明操作系统出口隔离。截图和结果位于 `apps/desktop/.desktop-build/qualification/m0-ui-*`。

运行时矩阵区分构建主机 Node 24.16.0、Electron 44.0.0 / Node 24.18.1 与随包工具 Node 24.21.0。SDK 缺失 Office 素材时的关闭流程在 24.16.0 下触发 libuv 断言，在两种随包 Node 版本下通过。记录中的 SDK/headless 验收使用随包工具 Node；这一观察不证明上游 engines 范围内每个 Node 版本均可用。

## 定向回归

`apps/desktop/tests/migration-m0-connection.spec.ts` 通过真实 pi-ai 适配器向回环 HTTP 服务发送合成凭据，记录可变引用的限制和版本化引用替代方案。重复 prepared dispatch 不等同于完整的 Agent 重试或连接事务实现。

`apps/cli/tests/profiles/headless/tests/session-format-guard.expected.e2e.ts` 检查保留来源的迁移和未知数据拒绝。Windows 文件预期遵循现有命名信号量实现；POSIX 仍要求持久锁文件。不改变生产 Session 格式或锁行为。

机器可读结果与制品摘要位于 `evidence/`。原构建日志和完整迁移计划保存在上层桌面工作区。本地验收不意味着远程发布、用户数据迁移、签名发行、完整内网验收或 M1–M5 已完成。
