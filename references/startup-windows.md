# Windows Startup And Connection

Use PowerShell 7 or Windows PowerShell. Keep Chrome visible because the user handles login, business navigation, and visual supervision.

## Discover Commands And Paths

Resolve `agent-browser` from `PATH`:

```powershell
$agentBrowser = Get-Command agent-browser -ErrorAction SilentlyContinue
if (-not $agentBrowser) {
    throw "agent-browser is not installed or is not available on PATH."
}
```

If it is missing, report that installation is required. Do not install it unless the user asks:

```powershell
npm install -g agent-browser
agent-browser --version
agent-browser doctor
```

Find Chrome without assuming one installation scope:

```powershell
$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromePath = $chromeCandidates |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

if (-not $chromePath) {
    throw "Google Chrome was not found in the standard Windows locations."
}

$profilePath = Join-Path $env:USERPROFILE ".chrome-agent-debug"
```

## Reuse A Listening Browser

Check the port before running any page command:

```powershell
$listener = Get-NetTCPConnection `
    -LocalPort 9222 `
    -State Listen `
    -ErrorAction SilentlyContinue
```

If the port is listening, inspect its owner:

```powershell
$ownerPid = $listener.OwningProcess
$owner = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid"
$owner | Select-Object ProcessId, Name, ExecutablePath, CommandLine
```

Proceed only when the owner is Chrome and its command line includes both `--remote-debugging-port=9222` and the intended `.chrome-agent-debug` profile. If the owner is wrong or ambiguous, report it and do not terminate it.

```powershell
agent-browser --cdp 9222 get url
```

Use `--cdp 9222` explicitly on every subsequent `agent-browser` command. Do not rely on a previous `agent-browser connect 9222` call persisting across Windows processes.

## Start The Dedicated Browser

When the port is not listening, first check whether a dedicated-profile Chrome already exists:

```powershell
$dedicatedChrome = Get-CimInstance Win32_Process `
    -Filter "Name = 'chrome.exe'" |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine.Contains(".chrome-agent-debug")
    }
```

If it exists without a listener, report the process details and diagnose it before starting another Chrome. Do not delete profile lock files while a matching Chrome process exists.

Otherwise, create the profile directory and launch one visible, detached Chrome process. Use `ProcessStartInfo.ArgumentList` so paths containing spaces are passed safely:

```powershell
New-Item -ItemType Directory -Path $profilePath -Force | Out-Null

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $chromePath
$startInfo.UseShellExecute = $true

@(
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=9222",
    "--user-data-dir=$profilePath",
    "--no-first-run",
    "--new-window",
    "about:blank"
) | ForEach-Object {
    [void]$startInfo.ArgumentList.Add($_)
}

[void][System.Diagnostics.Process]::Start($startInfo)
```

Poll for at most 10 seconds:

```powershell
$listener = $null

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $listener = Get-NetTCPConnection `
        -LocalPort 9222 `
        -State Listen `
        -ErrorAction SilentlyContinue

    if ($listener) {
        break
    }

    Start-Sleep -Milliseconds 500
}

if (-not $listener) {
    throw "Chrome started but port 9222 did not become available."
}
```

Re-check the owning process and command line before verifying the connection:

```powershell
$ownerPid = $listener.OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" |
    Select-Object ProcessId, Name, ExecutablePath, CommandLine

agent-browser --cdp 9222 get url
```

## Diagnose Profile Conflicts

Prefer process inspection over deleting files:

- If a matching Chrome process exists, reuse or diagnose it.
- If ordinary Chrome is holding a profile needed by `agent-browser`, ask the user to close the conflicting Chrome instance.
- Do not kill Chrome or remove profile data without explicit user approval.
- Do not use `agent-browser doctor --fix` unless the user approves its repair actions.
