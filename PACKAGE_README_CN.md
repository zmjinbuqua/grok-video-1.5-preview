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

## 不包含的内容

压缩包不会包含：

- `node_modules`
- `.git`
- `.ima2`
- 生成的视频/图片
- 本机日志
- 你的 Grok OAuth token

所以换电脑后需要重新运行 `login-grok.bat` 登录。
