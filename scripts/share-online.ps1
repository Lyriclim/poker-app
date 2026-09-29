$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.runtime'
$tunnelExe = Join-Path $projectRoot 'tools\ngrok.exe'
New-Item -ItemType Directory -Force $runtimeDir | Out-Null
$launchMutex = New-Object System.Threading.Mutex($false, 'Local\PokerAppPublicAccessLauncher')
try { $ownsLaunch = $launchMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsLaunch = $true }
if (!$ownsLaunch) { Write-Host 'Public access is already starting in another window.'; $launchMutex.Dispose(); exit 0 }
function Test-App {
    try { return (Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3).ok -eq $true } catch { return $false }
}
function Test-PublicApp([string]$Url) {
    if ($Url -notmatch '^https://[a-z0-9-]+\.ngrok(?:-free)?\.(?:app|dev|io)$') { return $false }
    try { return (Invoke-RestMethod ($Url + '/api/health') -Headers @{ 'ngrok-skip-browser-warning' = 'poker-health' } -TimeoutSec 10).ok -eq $true } catch { return $false }
}
if (!(Test-Path -LiteralPath $tunnelExe)) { throw 'Missing tools\ngrok.exe. Download the Windows agent from https://ngrok.com/download/windows' }
Write-Host '[1/3] Checking local App...' -ForegroundColor Cyan
$distIndex = Join-Path $projectRoot 'apps\web\dist\index.html'
$webInputs = @(Join-Path $projectRoot 'apps\web\src'; Join-Path $projectRoot 'packages\shared\src'; Join-Path $projectRoot 'apps\web\index.html'; Join-Path $projectRoot 'apps\web\vite.config.ts'; Join-Path $projectRoot 'package-lock.json')
$latestWebChange = Get-ChildItem -LiteralPath $webInputs -Recurse -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (!(Test-Path -LiteralPath $distIndex) -or $latestWebChange.LastWriteTimeUtc -gt (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc) {
    Push-Location $projectRoot
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'App build failed.' } } finally { Pop-Location }
}
$appRunning = Test-App
if ($appRunning) {
    $serverPidFile = Join-Path $runtimeDir 'server.pid'
    $serverPid = if (Test-Path -LiteralPath $serverPidFile) { Get-Process -Id ([int](Get-Content -LiteralPath $serverPidFile)) -ErrorAction SilentlyContinue } else { $null }
    $serverInputs = @(Join-Path $projectRoot 'apps\server\src'; Join-Path $projectRoot 'apps\server\prisma\schema.prisma'; Join-Path $projectRoot 'packages\shared\src')
    $latestServerChange = Get-ChildItem -LiteralPath $serverInputs -Recurse -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    $health = try { Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3 } catch { $null }
    $ownedServer = $serverPid -and $serverPid.Path -eq (Get-Command node.exe -ErrorAction Stop).Source -and $health.pid -eq $serverPid.Id
    $started = if ($health.startedAt) { [DateTimeOffset]::FromUnixTimeMilliseconds([long]$health.startedAt).UtcDateTime } elseif ($serverPid) { $serverPid.StartTime.ToUniversalTime() } else { [DateTime]::MinValue }
    if ($latestServerChange.LastWriteTimeUtc -gt $started) {
        if ($ownedServer -and $health.restartSafe -eq $true) {
            Write-Host 'Updating the idle local App...' -ForegroundColor Cyan
            Stop-Process -Id $serverPid.Id
            for ($i = 0; $i -lt 30 -and (Test-App); $i++) { Start-Sleep -Milliseconds 200 }
            if (Test-App) { throw 'The old local App did not stop. No second server was started.' }
            $appRunning = $false
        } else {
            Write-Warning 'Update pending: the running App could not be confirmed idle. Finish the current game, close player tabs, then start public access again.'
        }
    } else {
        Write-Host 'Local App version is current.' -ForegroundColor Green
    }
}
if (!$appRunning) {
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $server = Start-Process $nodeExe -ArgumentList '--import tsx src/index.ts' -WorkingDirectory (Join-Path $projectRoot 'apps\server') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server-out.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log')
    $server.Id | Set-Content (Join-Path $runtimeDir 'server.pid')
    for ($i = 0; $i -lt 30 -and !(Test-App); $i++) { Start-Sleep -Seconds 1 }
    if (!(Test-App)) { throw 'App did not start. Check .runtime\server-error.log.' }
}
$tunnelPidFile = Join-Path $runtimeDir 'tunnel.pid'
$urlFile = Join-Path $runtimeDir 'public-url.txt'
if (Test-Path -LiteralPath $tunnelPidFile) {
    $previous = Get-Process -Id ([int](Get-Content $tunnelPidFile)) -ErrorAction SilentlyContinue
    if ($previous -and $previous.Path -eq $tunnelExe) {
        $savedUrl = if (Test-Path -LiteralPath $urlFile) { ([string](Get-Content $urlFile)).Trim() } else { '' }
        if (!$savedUrl) {
            $previousLog = if (Test-Path -LiteralPath (Join-Path $runtimeDir 'tunnel-log-path.txt')) { ([string](Get-Content (Join-Path $runtimeDir 'tunnel-log-path.txt'))).Trim() } else { '' }
            $previousContent = if ($previousLog -and (Test-Path -LiteralPath $previousLog)) { [string](Get-Content -LiteralPath $previousLog -Raw) } else { '' }
            $previousMatch = [regex]::Match($previousContent, 'https://[a-z0-9-]+\.ngrok(?:-free)?\.(?:app|dev|io)')
            if ($previousMatch.Success) { $savedUrl = $previousMatch.Value }
        }
        if (Test-PublicApp $savedUrl) { $savedUrl | Set-Content $urlFile; Write-Host ('Share this link: ' + $savedUrl) -ForegroundColor Green; exit 0 }
        # A slow route alone is not a reason to drop every player's socket.
        Write-Warning 'ngrok is running, but the public route is not responding yet. It is still reconnecting; do not restart sharing.'
        if ($savedUrl) { Write-Host ('Current link (not verified now): ' + $savedUrl) }
        Write-Host 'Wait a moment and open Start Public Access.cmd again to check this same tunnel.'
        exit 0
    }
    $legacyExe = Join-Path $projectRoot 'tools\cloudflared.exe'
    if ($previous -and $previous.Path -eq $legacyExe) { Stop-Process -Id $previous.Id }
    Remove-Item -LiteralPath $tunnelPidFile -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $urlFile -ErrorAction SilentlyContinue
$logFile = Join-Path $runtimeDir ('ngrok-' + [Guid]::NewGuid().ToString('N') + '.log')
$logFile | Set-Content (Join-Path $runtimeDir 'tunnel-log-path.txt')
Write-Host '[2/3] Connecting ngrok...'
$tunnel = Start-Process $tunnelExe -ArgumentList 'http http://127.0.0.1:3001 --inspect=false --log=stdout --log-format=json' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError ($logFile + '.error')
$tunnel.Id | Set-Content $tunnelPidFile
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $tunnel.Refresh()
    if ($tunnel.HasExited) {
        Remove-Item -LiteralPath $tunnelPidFile -ErrorAction SilentlyContinue
        $errors = [string](Get-Content -LiteralPath ($logFile + '.error') -Raw -ErrorAction SilentlyContinue)
        if ($errors -match 'ERR_NGROK_4018|ERR_NGROK_105') {
            Write-Host 'One-time setup needed: create your own free ngrok account.' -ForegroundColor Yellow
            Write-Host 'Sign up: https://dashboard.ngrok.com/signup'
            Write-Host 'Then double-click Configure ngrok.cmd and enter your authtoken locally.'
            Write-Host 'No public link was published. The local App is still running.'
            exit 1
        }
        throw ('ngrok stopped. Check ' + $logFile + '.error for the error code. The local App is still running.')
    }
    $content = [string](Get-Content -LiteralPath $logFile -Raw -ErrorAction SilentlyContinue)
    $match = [regex]::Match($content, 'https://[a-z0-9-]+\.ngrok(?:-free)?\.(?:app|dev|io)')
    if ($match.Success -and $i % 5 -eq 0 -and (Test-PublicApp $match.Value)) {
        $match.Value | Set-Content $urlFile
        Write-Host '[3/3] Public health check passed.' -ForegroundColor Green
        Write-Host ('Share this link: ' + $match.Value) -ForegroundColor Green
        Write-Host 'Keep this computer awake and online. Closing this window keeps sharing active.'
        Write-Host 'Stop Public Access.cmd stops only sharing, not the local App.'
        Write-Host 'A startup check does not guarantee continuous network availability.'
        exit 0
    }
    if ($i % 10 -eq 0) { Write-Host 'Waiting for a verified public connection...' }
}
$tunnel.Refresh()
if ($tunnel.HasExited) {
    Remove-Item -LiteralPath $tunnelPidFile -ErrorAction SilentlyContinue
    throw ('ngrok stopped before the public connection could be verified. Check ' + $logFile)
}
Write-Warning 'The public route could not be verified yet. ngrok remains running and will keep reconnecting.'
Write-Host 'No unverified link was published. Wait a moment and open Start Public Access.cmd again to check this same tunnel.'
Write-Host ('Tunnel log: ' + $logFile)
