$env:IMA2_PORT = "3333"
$env:IMA2_HOST = "127.0.0.1"
$env:IMA2_CONFIG_DIR = "D:\ima2-gen\.ima2"
$env:IMA2_GENERATED_DIR = "D:\ima2-gen\.ima2\generated"
$env:HTTP_PROXY = "http://127.0.0.1:7892"
$env:HTTPS_PROXY = "http://127.0.0.1:7892"
$env:http_proxy = "http://127.0.0.1:7892"
$env:https_proxy = "http://127.0.0.1:7892"
$env:NO_PROXY = "127.0.0.1,localhost,::1"
$env:no_proxy = "127.0.0.1,localhost,::1"
$env:NODE_USE_ENV_PROXY = "1"

Set-Location "D:\ima2-gen"
node bin/ima2.js serve
