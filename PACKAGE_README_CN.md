# grok-video-1.5-preview 打包版说明

## 一键安装

1. 把压缩包解压到目标电脑，例如：

```text
D:\grok-video-1.5-preview
```

2. 双击运行：

```text
install-ima2.bat
```

安装脚本会自动处理：

- 检测 Node.js 20+
- 没有 Node 时优先用 winget 自动安装
- winget 不可用或失败时，自动下载 Node.js MSI 静默安装
- MSI 仍不可用时，自动下载 portable Node 到项目内 `.ima2\tools`
- 自动检测本机代理，下载 Node 和后续 Grok/CDN 请求都会尽量走代理
- 安装主项目 npm 依赖
- 安装 UI 依赖
- 构建服务端和前端
- 创建本机运行目录 `.ima2`
- 生成适配当前解压路径的 `start-ima2.bat`

正常情况下不需要手动安装 Node、Git、pnpm、yarn。

## 启动

安装完成后双击：

```text
start-ima2.bat
```

然后打开：

```text
http://127.0.0.1:3333
```

如果 `3333` 被占用，服务会自动换到可用端口，启动窗口会显示实际地址。

## 登录 Grok 账号池

在网页里操作：

```text
设置 -> 账号 -> Grok 账号池 -> 登录 Grok 账号并加入池
```

授权成功后账号会自动加入账号池，并自动重新加载 Grok 代理，不需要重启服务。

如果要添加第二个账号，继续点击同一个登录按钮。登录链接会要求重新登录/选择账号，避免浏览器直接复用上一个 xAI 账号。

## 代理

默认自动检测本机代理，顺序包括：

- 当前环境变量 `HTTP_PROXY` / `HTTPS_PROXY`
- Windows 系统代理
- 常见本地代理端口：`7890`、`7892`、`10809`、`10808`、`20171`、`20170`、`8080`、`8118`

检测到后启动窗口会显示：

```text
Detected proxy: http://127.0.0.1:xxxx
```

视频生成接口和最终 `vidgen.x.ai` 视频下载都会使用代理。

## 不包含的内容

压缩包不会包含：

- `node_modules`
- `.git`
- `.ima2`
- `.grok-accounts`
- 生成过的视频/图片
- 本机日志
- Grok OAuth token

换电脑后需要在网页里重新登录 Grok 账号。

## 详细文档

Grok 1.5 视频使用说明：

```text
docs\GROK_1_5_VIDEO_CN.md
```
