# Grok 1.5 视频生成使用说明

本文档适用于本机安装目录：

```text
D:\ima2-gen
```

当前项目已经配置为通过内置 `progrok` 代理使用 xAI/Grok OAuth，并支持 `grok-imagine-video-1.5-preview`。

## 1. 启动前准备

需要具备：

- Windows 电脑
- Node.js 20 或更高版本
- 可访问 xAI/Grok 的网络环境
- 一个可正常使用 Grok 的账号
- 如果你的网络需要代理，默认会自动检测本机代理，不需要手动改端口

自动检测顺序包括：当前命令行里的 `HTTP_PROXY` / `HTTPS_PROXY`、Windows 系统代理，以及常见本地代理端口 `7890`、`7892`、`10809`、`10808`、`20171`、`8080` 等。

启动时如果检测到代理，窗口会显示 `Detected proxy: http://127.0.0.1:xxxx`。如果没有检测到代理，则会直连。

需要强制指定代理时，可以在启动前设置 `HTTP_PROXY` 和 `HTTPS_PROXY`；需要关闭自动检测时，设置 `IMA2_AUTO_PROXY=0`。

注意：脚本里已经加入：

```bat
NO_PROXY=127.0.0.1,localhost,::1
```

这个很重要。它可以避免 ima2 后端访问本机 Grok 代理 `127.0.0.1:18645` 时又被转发到外部代理，导致 Grok 状态误判为离线。

## 2. 登录 Grok OAuth

推荐直接在网页里登录，不再需要手动运行 `login-grok.bat`：

1. 先启动 ima2，打开 `http://127.0.0.1:3333`
2. 进入 `设置 -> 账号 -> Grok 账号池`
3. 点击 `登录 Grok 账号并加入池`
4. 页面会显示 xAI 设备码登录网址和验证码
5. 打开页面提示的网址，登录你的 Grok 账号并输入验证码
6. 授权成功后，ima2 会自动把这个账号加入下方账号池

账号池里的账号会保存在：

```text
D:\ima2-gen\.grok-accounts
```

这个目录已经加入 `.gitignore`。不要把里面的文件发给别人，它们相当于你的 Grok 登录凭据。

`login-grok.bat` 和 `login-grok-browser.bat` 仍保留为备用入口，但日常使用优先走页面按钮。

## 3. 启动 ima2

运行：

```text
D:\ima2-gen\start-ima2.bat
```

正常启动时会看到类似：

```text
Image Gen running at http://127.0.0.1:3333
Grok proxy running
Listening: http://127.0.0.1:18645/v1
```

然后在浏览器打开：

```text
http://127.0.0.1:3333
```

如果 `3333` 端口被占用，服务可能会自动切到 `3334`，终端里会显示实际地址。

## 4. 确认 Grok 1.5 可用

启动后，可以在浏览器或 PowerShell 访问：

```text
http://127.0.0.1:3333/api/grok/status
```

正常结果应该包含：

```json
{
  "status": "ready",
  "models": [
    "grok-imagine-video-1.5-preview"
  ]
}
```

只要 `models` 里出现 `grok-imagine-video-1.5-preview`，说明本机代理已经能看到 1.5 视频模型。

也可以在 PowerShell 里执行：

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3333/api/grok/status" | Select-Object -ExpandProperty Content
```

## 5. 在界面中生成 Grok 1.5 视频

打开 `http://127.0.0.1:3333` 后：

1. 右侧提供方选择 `Grok`
2. 切到 `视频`
3. 模型选择 `Grok V1.5 Preview`
4. 选择视频模式：
   - 有参考图：使用图生视频
   - 没有参考图：系统会自动用白底图走 1.5 的图生视频路径
5. 选择时长，例如 `5s`
6. 选择分辨率，例如 `480p`
7. 输入提示词
8. 点击左侧 `生成`

当前这套修改已加入兜底逻辑：

- 原项目会先强制用 `grok-4.3` 做搜索/规划
- 如果搜索或规划返回 502，旧逻辑会直接失败
- 现在改为搜索/规划失败时继续使用你的原始提示词请求 `grok-imagine-video-1.5-preview`

所以如果看到日志里有 `video:search-fallback` 或 `video:planner-fallback`，不一定是失败，表示它跳过了前置规划，继续尝试真正的视频生成。

## 6. 常见状态和报错

### Grok 右侧红点 / off

先检查：

```text
http://127.0.0.1:3333/api/grok/status
```

如果返回 `ready`，网页可能只是没刷新，刷新页面即可。

如果返回 `offline`，常见原因：

- `start-ima2.bat` 不是最新版，没有 `NO_PROXY`
- Grok 代理 `18645` 没启动
- 启动窗口没有检测到代理，且当前网络不能直连 xAI
- Grok OAuth 过期，需要在 `设置 -> 账号 -> Grok 账号池` 重新点击 `登录 Grok 账号并加入池`

### `fetch failed`

通常是网络或代理问题。确认：

- 代理软件正在运行
- 启动窗口显示了 `Detected proxy: ...`，或者你的网络可以直连 xAI
- 能访问 xAI/Grok

### `GROK_UPSTREAM_ERROR`

如果日志里显示：

```text
search upstream error
```

说明失败点在 `grok-4.3` 搜索/规划阶段，不是 1.5 视频模型本身。

当前版本已经对这个错误做了兜底。如果仍然最终失败，再看后面是否出现：

```text
GROK_VIDEO_REQUEST_FAILED
GROK_VIDEO_POLL_FAILED
GROK_VIDEO_FAILED
```

这些才更接近真正的视频接口错误。

### `image-to-video requires a source image`

说明当前模式需要参考图，但请求里没有图。使用 1.5 时推荐上传一张参考图；如果是纯文生视频，当前项目会自动生成白底图作为起始图再调用 1.5。

### 页面显示 3334 而不是 3333

说明 `3333` 被占用了。看启动窗口里的实际地址，例如：

```text
Image Gen running at http://127.0.0.1:3334
```

用实际地址打开即可。

## 7. 查看日志

服务日志：

```text
D:\ima2-gen\ima2-server.log
```

错误日志：

```text
D:\ima2-gen\ima2-server.err.log
```

如果生成失败，重点搜索这些关键词：

```text
video.request
grok.search:start
video:search-fallback
video:planner:start
video:planner-fallback
video:submitted
GROK_VIDEO_REQUEST_FAILED
GROK_VIDEO_POLL_FAILED
```

如果出现 `video:submitted`，说明已经成功提交到 xAI 视频生成接口。

## 8. 重新登录或换账号

打开：

```text
设置 -> 账号 -> Grok 账号池
```

然后点击 `登录 Grok 账号并加入池`。登录成功后会自动新增到账号池。

如果要移除旧账号，在账号池列表里点击对应账号的 `删除`，然后重启 `start-ima2.bat`。

## 9. Grok 轮询账号池

当前版本增加了一个本地 Grok 轮询账号池。它会在服务启动时为账号池里的每个账号启动一个独立 `progrok` 代理端口，然后按“生成任务”轮询分配账号。

注意：视频任务从提交到轮询完成会固定使用同一个账号，避免 A 账号提交、B 账号查询导致失败。

账号池目录：

```text
D:\ima2-gen\.grok-accounts
```

这个目录已经加入 `.gitignore`，不要上传到 GitHub，也不要发给别人。

### 在页面里添加账号

页面路径：

```text
设置 -> 账号 -> Grok 账号池
```

点击 `登录 Grok 账号并加入池`，按照页面显示的设备码流程完成授权。ima2 会自动读取登录成功后的 OAuth 凭据，并按邮箱自动生成账号名，例如 `user`、`user-2` 或 `grok-2`。

不需要粘贴 OAuth JSON，也不要导入 `邮箱----密码----sessionToken----日期` 这种网页登录资料。`progrok` 使用的是 xAI OAuth 的 `accessToken + refreshToken`，页面按钮会自动处理。

### 添加第二个账号

在页面继续点击 `登录 Grok 账号并加入池`，换另一个 Grok 账号完成授权即可。添加或删除账号后，需要重启 `start-ima2.bat`。重启后页面会显示“当前运行中的代理”数量。

### 检测、停用和启用账号

账号池列表里每个账号都有三个操作：

1. `检测`：临时启动一个检测代理，访问 xAI 模型列表，判断这个 OAuth 是否还能使用。
2. `停用`：保留账号文件，但下次重启后不再为它启动代理，也不参与轮询。
3. `启用`：恢复账号，下次重启后重新参与轮询。

检测不会改变账号状态。停用或启用后需要重启 `start-ima2.bat` 才会影响实际轮询代理。

如果检测结果是 `HTTP 401`，通常表示这个账号的 OAuth 已过期或被拒，需要重新点击 `登录 Grok 账号并加入池` 完成登录。

### 删除账号

在页面的 `Grok 账号池` 列表里点击对应账号的 `删除`。删除后同样需要重启服务才会影响实际轮询代理。

### 批处理备用入口

页面管理是推荐方式。项目里仍保留备用脚本：

```text
save-grok-account.bat account-a
list-grok-accounts.bat
remove-grok-account.bat account-a
```

## 10. 当前已修改过的关键点

本机版本相对原项目做过这些适配：

- 增加中文界面资源
- 默认切换为中文界面
- 修复 Grok 状态检测超时太短的问题
- 启动脚本加入 `NO_PROXY`
- 让 1.5 视频生成在搜索/规划失败时继续走真实视频生成接口
- 保留内置 `progrok` OAuth 代理方式，不需要手动填 xAI API Key
- 增加页面版 Grok 轮询账号池
