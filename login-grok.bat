@echo off
set "IMA2_CONFIG_DIR=D:\ima2-gen\.ima2"
set "IMA2_GENERATED_DIR=D:\ima2-gen\.ima2\generated"
set "HTTP_PROXY=http://127.0.0.1:7892"
set "HTTPS_PROXY=http://127.0.0.1:7892"
set "http_proxy=http://127.0.0.1:7892"
set "https_proxy=http://127.0.0.1:7892"
set "NO_PROXY=127.0.0.1,localhost,::1"
set "no_proxy=127.0.0.1,localhost,::1"
set "NODE_USE_ENV_PROXY=1"

cd /d "D:\ima2-gen"
node_modules\.bin\progrok.cmd login --device-code
pause
