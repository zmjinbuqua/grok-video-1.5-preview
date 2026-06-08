# ima2-gen Grok 1.5 打包版安装说明

## 使用方法

1. 把压缩包解压到目标电脑，例如：

```text
D:\ima2-gen
```

2. 双击运行：

```text
install-ima2.bat
```

安装脚本会自动：

- 检查 Node.js 20+
- 如果系统有 `winget`，会尝试自动安装 Node.js LTS
- 安装 npm 依赖
- 构建服务器和前端
- 创建 `.ima2` 运行目录
- 按当前解压路径生成 `start-ima2.bat`
- 按当前解压路径生成 `login-grok.bat`
- 按当前解压路径生成 `login-grok-browser.bat`

3. 登录 Grok：

```text
login-grok.bat
```

4. 启动服务：

```text
start-ima2.bat
```

5. 打开：

```text
http://127.0.0.1:3333
```

## 代理设置

默认脚本使用：

```text
http://127.0.0.1:7892
```

如果目标电脑代理端口不同，请安装后编辑：

- `start-ima2.bat`
- `login-grok.bat`
- `login-grok-browser.bat`

把 `http://127.0.0.1:7892` 改成目标电脑实际代理地址。

## Grok 1.5 详细文档

请看：

```text
docs\GROK_1_5_VIDEO_CN.md
```

## Grok 轮询账号池

安装后可以在网页设置里导入多个 Grok OAuth 账号：

1. 运行 `login-grok.bat` 登录一个账号
2. 打开网页 `设置` -> `账号` -> `Grok 账号池`
3. 输入账号名，点击 `导入当前登录`
4. 重复登录和导入即可加入多个账号
5. 重启 `start-ima2.bat` 后，多账号会按生成任务轮询使用

也保留备用脚本：

```text
save-grok-account.bat account-a
list-grok-accounts.bat
remove-grok-account.bat account-a
```

账号池保存在：

```text
.grok-accounts
```

该目录已经被 `.gitignore` 忽略，不会上传到 GitHub。

## 不包含的内容

压缩包不会包含：

- `node_modules`
- `.git`
- `.ima2`
- `.grok-accounts`
- 生成的视频/图片
- 本机日志
- 你的 Grok OAuth token

所以换电脑后需要重新运行 `login-grok.bat` 登录。
