$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$extensionPath = Join-Path $workspacePath 'extension'
$manifestInfo = Get-Content -LiteralPath (Join-Path $extensionPath 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$distPath = Join-Path $workspacePath 'dist'
New-Item -ItemType Directory -Path $distPath -Force | Out-Null
$archivePath = Join-Path $distPath ('byljx-helper-' + $manifestInfo.version + '-chrome-edge.zip')
# 压缩根目录直接包含 manifest.json；只打包运行文件，排除审查快照、测试和上架材料。
Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $extensionPath).FullName -DestinationPath $archivePath -Force
Get-FileHash -LiteralPath $archivePath -Algorithm SHA256 | Format-List
