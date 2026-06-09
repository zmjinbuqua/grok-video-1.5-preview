@echo off
set "PATH=D:\tools\gh-cli\bin;%PATH%"
set "HTTP_PROXY=http://127.0.0.1:7892"
set "HTTPS_PROXY=http://127.0.0.1:7892"
set "http_proxy=http://127.0.0.1:7892"
set "https_proxy=http://127.0.0.1:7892"

gh auth login --hostname github.com --git-protocol https --web
gh auth status
pause
