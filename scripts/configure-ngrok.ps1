$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$ngrokExe = Join-Path $projectRoot 'tools\ngrok.exe'
if (!(Test-Path -LiteralPath $ngrokExe)) { throw 'tools\ngrok.exe is missing.' }
Write-Host 'Create a free account: https://dashboard.ngrok.com/signup'
Write-Host 'Copy YOUR authtoken: https://dashboard.ngrok.com/get-started/your-authtoken'
Write-Host 'Paste it here. Input is hidden. Do not send it in chat.'
$secret = Read-Host 'Authtoken' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $tokenValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrWhiteSpace($tokenValue) -or $tokenValue -match '\s') { throw 'Enter a valid authtoken without spaces.' }
    & $ngrokExe config add-authtoken $tokenValue
    if ($LASTEXITCODE -ne 0) { throw 'ngrok could not save the token.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $tokenValue = $null
    $secret.Dispose()
}
Write-Host 'Configured. Now double-click Start Public Access.cmd.' -ForegroundColor Green
