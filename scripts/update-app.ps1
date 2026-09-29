$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pidFile = Join-Path $projectRoot '.runtime\server.pid'
$health = try { Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3 } catch { $null }
if (!$health) { & (Join-Path $PSScriptRoot 'share-online.ps1'); exit $LASTEXITCODE }

if ($health.PSObject.Properties.Name -contains 'restartSafe') {
    if ($health.restartSafe -ne $true) { throw 'A hand or player connection is still active. Finish the game and close player tabs before updating.' }
    & (Join-Path $PSScriptRoot 'share-online.ps1')
    exit $LASTEXITCODE
}

# The pre-upgrade server cannot report whether an unfinished hand is active.
if (!(Test-Path -LiteralPath $pidFile)) { throw 'Cannot identify the old local App process. No process was stopped.' }
$serverId = [int](Get-Content -LiteralPath $pidFile)
$server = Get-Process -Id $serverId -ErrorAction SilentlyContinue
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
if (!$server -or $server.Path -ne $nodeExe) { throw 'The recorded server process is not the Poker App Node process. No process was stopped.' }
Write-Host 'The old App cannot confirm whether players are still connected.' -ForegroundColor Yellow
Write-Host 'Only continue after the current game is finished and everyone has closed the table.'
$answer = Read-Host 'Type UPDATE to replace the old App now'
if ($answer -ne 'UPDATE') { Write-Host 'Update cancelled. The old App remains running.'; exit 0 }
Stop-Process -Id $serverId
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 200
    try { $stillRunning = (Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 1).ok } catch { $stillRunning = $false }
    if (!$stillRunning) { break }
}
if ($stillRunning) { throw 'The old App did not stop. No second server was started.' }
& (Join-Path $PSScriptRoot 'share-online.ps1')
exit $LASTEXITCODE
