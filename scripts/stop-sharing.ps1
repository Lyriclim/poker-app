$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.runtime'
$pidFile = Join-Path $runtimeDir 'tunnel.pid'
$tunnelExes = @((Join-Path $projectRoot 'tools\cloudflared.exe'), (Join-Path $projectRoot 'tools\ngrok.exe'))
if (Test-Path -LiteralPath $pidFile) {
    $tunnel = Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue
    if ($tunnel -and $tunnel.Path -in $tunnelExes) { Stop-Process -Id $tunnel.Id }
    Remove-Item -LiteralPath $pidFile
}
Remove-Item -LiteralPath (Join-Path $runtimeDir 'public-url.txt') -ErrorAction SilentlyContinue
Write-Host 'Public access stopped. The local App is still available.'
