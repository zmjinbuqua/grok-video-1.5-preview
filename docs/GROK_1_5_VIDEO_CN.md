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
- 如果你的网络需要代理，默认脚本使用本机代理：

```text
http://127.0.0.1:7892
```

如果你的代理端口不是 `7892`，请编辑这些文件里的代理地址：

- `D:\ima2-gen\start-ima2.bat`
- `D:\ima2-gen\login-grok.bat`
- `D:\ima2-gen\login-grok-browser.bat`

把里面的：

```bat
http://127.0.0.1:7892
```

改成你自己的代理地址。

注意：脚本里已经加入：

```bat
NO_PROXY=127.0.0.1,localhost,::1
```

这个很重要。它可以避免 ima2 后端访问本机 Grok 代理 `127.0.0.1:18645` 时又被转发到外部代理，导致 Grok 状态误判为离线。

## 2. 登录 Grok OAuth

第一次使用前，先运行：

```text
D:\ima2-gen\login-grok.bat
```

登录流程：

1. 双击 `login-grok.bat`
2. 终端会显示一个设备码登录流程
3. 浏览器会打开 Grok/xAI 的授权页面，或者终端会提示你打开指定网址
4. 登录你的 Grok 账号
5. 如果页面显示“无法建立连接”，并提示复制一段代码到 Grok Build：
   - 复制页面中的代码
   - 回到登录终端
   - 按提示粘贴代码
6. 看到 `Status: Logged in` 或登录成功提示后即可关闭窗口

如果设备码方式不顺，可以尝试：

```text
D:\ima2-gen\login-grok-browser.bat
```

登录成功后，OAuth 信息保存在当前 Windows 用户目录下：

```text
C:\Users\<你的用户名>\.progrok\auth.json
```

不要把这个文件发给别人，它相当于你的 Grok 登录凭据。

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
- 代理软件端口不是 `7892`
- Grok OAuth 过期，需要重新运行 `login-grok.bat`

### `fetch failed`

通常是网络或代理问题。确认：

- 代理软件正在运行
- `start-ima2.bat` 里的代理端口正确
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

重新运行：

```text
D:\ima2-gen\login-grok.bat
```

如果要彻底换账号，可以先删除：

```text
C:\Users\<你的用户名>\.progrok\auth.json
```

然后重新运行登录脚本。

## 9. Grok 轮询账号池

当前版本增加了一个本地 Grok 轮询账号池。它会在服务启动时为账号池里的每个账号启动一个独立 `progrok` 代理端口，然后按“生成任务”轮询分配账号。

注意：视频任务从提交到轮询完成会固定使用同一个账号，避免 A 账号提交、B 账号查询导致失败。

账号池目录：

```text
D:\ima2-gen\.grok-accounts
```

这个目录已经加入 `.gitignore`，不要上传到 GitHub，也不要发给别人。

### 在页面里导入账号

先运行：

```text
login-grok.bat
```

登录一个 Grok 账号后：

1. 打开 `http://127.0.0.1:3333`
2. 进入 `设置`
3. 打开 `账号`
4. 找到 `Grok 账号池`
5. 输入账号名，例如 `account-a`
6. 点击 `导入当前登录`

账号名只能使用英文字母、数字、点、下划线和短横线。

### 添加第二个账号

再次运行：

```text
login-grok.bat
```

登录另一个 Grok 账号，然后回到页面的 `Grok 账号池` 区域，输入另一个账号名，例如 `account-b`，再次点击 `导入当前登录`。

导入或删除账号后，需要重启 `start-ima2.bat`。重启后页面会显示“当前运行中的代理”数量。

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
