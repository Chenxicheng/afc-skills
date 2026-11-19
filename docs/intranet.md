# 企业内网版

默认 GitHub 域名：`code.sdsdev.co.kr`。此构建不提供公共网络模式，外部 `GH_HOST` 不会改变企业域名。

```sh
afc-skills add 组织名/仓库名 --list
afc-skills add 组织名/仓库名 -a aipro
afc-skills add 组织名/仓库名 -a aipro -g
afc-skills add https://code.sdsdev.co.kr/组织名/仓库名/tree/main/skills/demo
afc-skills add git@code.sdsdev.co.kr:组织名/仓库名.git
afc-skills add ./本地技能目录
afc-skills check
afc-skills update
```

## 网络行为

- 使用企业 HTTPS/SSH Git 来源、本地目录和本机 `file:///` Git 仓库（拒绝 UNC/远程共享）；外网地址直接拒绝，不重写历史来源为企业同名仓库。
- 使用已有 Git credential helper 或企业 SSH 凭据。CLI 不读取或发送 `GITHUB_TOKEN` / `GH_TOKEN` 给公共 API，也不使用 `gh` 的自动账号回退。
- `check` / `update` 检查已安装 Skill，不是检查 afc-skills 软件的新版本。企业来源通过 Git 获取内容并比较哈希；旧公共来源报告失败，需要用户显式迁移/重装。
- `find` 公共搜索禁用。可用 `add 组织名/仓库名 --list` 查看指定企业仓库中的技能；没有自动部署企业搜索服务。
- 遥测、安全审计、公共仓库可见性查询、skills.sh 下载加速和 Notion 集成禁用。没有在线安全扫描，不代表安装内容安全。
- HTTP 下载仅允许企业域名 HTTPS，并拒绝重定向和含凭据信息的 URL；Git 禁止 HTTP 重定向和自动递归子模块。含子模块的 Skill 需先整理为完整仓库或本地目录。
- 保留 TLS 校验，不提供忽略证书错误选项。企业 CA 需由管理员配置。

## 本地安装与构建

全局安装后直接执行 `afc-skills`，不依赖 `npx` 在线查包。

```sh
npm install -g ./afc-skills-版本号.tgz --offline --no-audit --no-fund
afc-skills --version
```

`--offline` 仅保证 npm 不联网，并不提供缺少的依赖。现有包仍声明生产依赖，必须提前准备对应离线缓存/依赖，或使用企业 npm 镜像；不能把普通 `.tgz` 宣称为完整离线包。构建所需 Node.js、pnpm 和开发依赖同样要预先准备。`pnpm build` 本身使用本地依赖，许可证脚本不会在线下载工具。

GitHub Actions 构建流水线的 actions、Node.js、pnpm、npm 依赖和 runner 属于单独的构建环境依赖；修改运行时 GitHub 域名不会自动将它们迁移到企业 GitHub。

## 安全边界

这是应用层网络策略，不是网络防火墙。系统 Git `url.insteadOf`、代理、SSH ProxyCommand/HostName、credential helper、DNS，以及通过 `use --agent` 启动的外部 Agent，以及本机映射盘/符号链接所指向的远程挂载，均可能改变实际网络路径。企业网络出口控制、受管 Git/SSH 配置仍是无外网访问的最终保障。

本次代码测试通过 mock 和本地文件验证，不代表已连接企业 GitHub 完成真实认证、安装和升级联调。

## E2E 验证

- `pnpm test:e2e`：构建并打包实际 `.tgz`，在独立目录离线安装，再验证包文件/可执行入口、CLI 和 API 本地安装/列表/移除、本机 Git 的 check/update，以及外网来源拒绝和无 fetch 遥测请求。它不代表企业网络认证已验证。
- 默认从当前已安装的生产依赖制作本地依赖 tarball，安装始终使用 `npm --offline --ignore-scripts --no-audit --no-fund`。不执行依赖生命周期脚本；缺少依赖直接失败，不在线重试。也可用 `SKILLS_E2E_NPM_CACHE=/已备齐的缓存` 改为验证已有 npm 离线缓存。
- `SKILLS_E2E_PACKAGE` 仅允许本地 `.tgz`，不接受 registry spec 或远程 URL。
- 原公网 E2E 保存在 `e2e/legacy/` 并说明其不适用，不在内网默认测试集合中。
- `pnpm test:e2e:enterprise`：独立真实企业 GitHub 联调，必须设置 `SKILLS_E2E_ENTERPRISE_SOURCE=https://code.sdsdev.co.kr/组织/测试仓库` 和 `SKILLS_E2E_ENTERPRISE_SKILL=技能名`。需要时通过 `SKILLS_E2E_GIT_CONFIG` 指定已配置企业认证/CA 的本地 Git 配置文件，不将 token 写入 URL。缺配置会立即失败，不能当作联调成功。
- 原 GitHub Actions PR/push/每日/手动触发及多平台矩阵保留。云端构建可联网准备 actions、Node.js/pnpm 和构建依赖；之后 E2E 包安装与测试本身使用离线依赖和本地 fixture，不访问公共技能服务。企业真实联调仅通过单独命令显式运行，不混入默认云端 CI。
