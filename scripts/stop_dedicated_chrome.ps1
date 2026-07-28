[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$debugPort = 9222
$profilePath = [System.IO.Path]::GetFullPath(
    (Join-Path $env:USERPROFILE ".chrome-agent-debug")
).TrimEnd("\")

$knownChromePaths = @(
    @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    ) |
        Where-Object { Test-Path -LiteralPath $_ } |
        ForEach-Object { [System.IO.Path]::GetFullPath($_) }
)

function Test-Contains {
    param(
        [AllowEmptyString()]
        [string]$Text,
        [Parameter(Mandatory)]
        [string]$Value
    )

    return $Text.IndexOf(
        $Value,
        [System.StringComparison]::OrdinalIgnoreCase
    ) -ge 0
}

function Test-DedicatedBrowserProcess {
    param(
        [Parameter(Mandatory)]
        [Microsoft.Management.Infrastructure.CimInstance]$Process
    )

    if ($Process.Name -ine "chrome.exe" -or
        [string]::IsNullOrWhiteSpace($Process.ExecutablePath) -or
        [string]::IsNullOrWhiteSpace($Process.CommandLine)) {
        return $false
    }

    if ($knownChromePaths.Count -eq 0 -or
        $knownChromePaths -notcontains $Process.ExecutablePath) {
        return $false
    }

    if (Test-Contains $Process.CommandLine "--type=") {
        return $false
    }

    return (
        (Test-Contains $Process.CommandLine "--remote-debugging-port=$debugPort") -and
        (Test-Contains $Process.CommandLine "--user-data-dir") -and
        (Test-Contains $Process.CommandLine $profilePath)
    )
}

function Get-ListenerPids {
    return @(
        Get-NetTCPConnection `
            -LocalPort $debugPort `
            -State Listen `
            -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

function Get-DedicatedBrowserProcesses {
    return @(
        Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
            Where-Object { Test-DedicatedBrowserProcess $_ }
    )
}

function Test-DedicatedBrowserStopped {
    return (
        @(Get-ListenerPids).Count -eq 0 -and
        @(Get-DedicatedBrowserProcesses).Count -eq 0
    )
}

function Wait-DedicatedBrowserStopped {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (Test-DedicatedBrowserStopped) {
            return $true
        }

        Start-Sleep -Milliseconds 250
    }

    return $false
}

$listenerPids = @(Get-ListenerPids)
$targets = @(Get-DedicatedBrowserProcesses)

if ($listenerPids.Count -eq 0 -and $targets.Count -eq 0) {
    Write-Output "Dedicated Chrome is already stopped; port $debugPort is not listening."
    exit 0
}

if ($listenerPids.Count -gt 1) {
    throw "Refusing to stop Chrome: port $debugPort has multiple listener PIDs: $($listenerPids -join ', ')."
}

if ($targets.Count -ne 1) {
    $targetPids = if ($targets.Count -eq 0) {
        "<none>"
    }
    else {
        $targets.ProcessId -join ", "
    }

    throw "Refusing to stop Chrome: expected one verified dedicated browser process, found $($targets.Count): $targetPids."
}

$target = $targets[0]

if ($listenerPids.Count -eq 1 -and $listenerPids[0] -ne $target.ProcessId) {
    throw "Refusing to stop PID $($target.ProcessId): port $debugPort belongs to PID $($listenerPids[0])."
}

$agentBrowser = Get-Command agent-browser -ErrorAction SilentlyContinue
if ($listenerPids.Count -eq 1 -and $agentBrowser) {
    Write-Output "Releasing the agent-browser CDP session for dedicated Chrome PID $($target.ProcessId)."
    & $agentBrowser.Source --cdp $debugPort close
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "agent-browser exited with code $LASTEXITCODE; continuing with verified browser shutdown."
    }

    if (Wait-DedicatedBrowserStopped) {
        Write-Output "Dedicated Chrome stopped after the CDP session closed."
        exit 0
    }
}

$targets = @(Get-DedicatedBrowserProcesses)
if ($targets.Count -ne 1) {
    throw "Refusing window-close request: dedicated browser identity changed while shutdown was in progress."
}

$target = $targets[0]
$nativeProcess = [System.Diagnostics.Process]::GetProcessById($target.ProcessId)
$nativeProcess.Refresh()

if ($nativeProcess.MainWindowHandle -ne [IntPtr]::Zero) {
    Write-Output "Sending a normal window-close request to dedicated Chrome PID $($target.ProcessId)."
    [void]$nativeProcess.CloseMainWindow()

    if (Wait-DedicatedBrowserStopped) {
        Write-Output "Dedicated Chrome stopped after the normal window-close request."
        exit 0
    }
}
else {
    Write-Warning "Dedicated Chrome PID $($target.ProcessId) has no visible main window."
}

$targets = @(Get-DedicatedBrowserProcesses)
if ($targets.Count -ne 1) {
    throw "Refusing final termination: dedicated browser identity changed while shutdown was in progress."
}

$target = $targets[0]
Write-Warning "Dedicated Chrome remained alive; terminating only verified PID $($target.ProcessId)."
Stop-Process -Id $target.ProcessId

if (Wait-DedicatedBrowserStopped) {
    Write-Output "Dedicated Chrome stopped after the verified process termination."
    exit 0
}

throw "Dedicated Chrome is still running. Inspect the matching profile process and port $debugPort."
