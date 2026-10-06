<#
Start, stop or check the local ArchiAI stack (Windows PowerShell 5.1).

  powershell -ExecutionPolicy Bypass -File scripts/dev.ps1                 # start (restarts if running)
  powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Action status
  powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Action stop

start stops any previous backend/frontend first (a leftover uvicorn reload
worker otherwise keeps serving old code), runs migrations, then opens the
backend and frontend in their own minimized windows so they outlive the
terminal that started them.

The backend reads backend/.env. Shell variables of the same name would
override it, so the backend window clears them first: backend/.env is the
single source of settings.

Optional Postgres management (otherwise use the database in backend/.env):
  ARCHIAI_PGDATA  data directory to start with pg_ctl if it is not running
  ARCHIAI_PGPORT  port to pass to pg_ctl (-o "-p <port>")
  ARCHIAI_PGBIN   folder holding pg_ctl.exe when it is not on PATH
#>
param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'start'
)

$BackendPort = 8000
$FrontendPort = 5173
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Py = Join-Path $Backend '.venv\Scripts\python.exe'
# 127.0.0.1, not localhost: PowerShell 5.1 tries IPv6 first and stalls.
$BackendUrl = "http://127.0.0.1:$BackendPort/docs"
$FrontendUrl = "http://127.0.0.1:$FrontendPort"

function Test-Url([string]$Url) {
  try {
    Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    # Any HTTP answer (even an error status) means the server is up.
    return ($null -ne $_.Exception.Response)
  }
}

function Get-PgCtl {
  if ($env:ARCHIAI_PGBIN) { return (Join-Path $env:ARCHIAI_PGBIN 'pg_ctl.exe') }
  $cmd = Get-Command pg_ctl -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Get-PgState {
  if (-not $env:ARCHIAI_PGDATA) { return 'unmanaged (backend/.env)' }
  $pgCtl = Get-PgCtl
  if (-not $pgCtl) { return 'unknown (pg_ctl not found; set ARCHIAI_PGBIN)' }
  & $pgCtl status -D $env:ARCHIAI_PGDATA *> $null
  if ($LASTEXITCODE -eq 0) { return 'running' }
  return 'stopped'
}

function Start-Postgres {
  $state = Get-PgState
  if ($state -ne 'stopped') {
    if ($state -like 'unmanaged*') {
      Write-Host 'Using the database in backend/.env (start it yourself, or: docker compose up db)'
    } else {
      Write-Host "Postgres: $state"
    }
    return
  }
  $pgArgs = @('-D', $env:ARCHIAI_PGDATA, '-l', (Join-Path $env:ARCHIAI_PGDATA 'server.log'))
  if ($env:ARCHIAI_PGPORT) { $pgArgs += @('-o', "`"-p $($env:ARCHIAI_PGPORT)`"") }
  $pgArgs += 'start'
  Start-Process -FilePath (Get-PgCtl) -ArgumentList $pgArgs -WindowStyle Hidden
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    if ((Get-PgState) -eq 'running') { Write-Host 'Postgres: started'; return }
  }
  Write-Host 'Postgres: did not start, see server.log in the data directory'
  exit 1
}

function Stop-Port([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

function Stop-Stack {
  $all = Get-CimInstance Win32_Process -Filter "Name='python.exe'"
  $servers = @($all | Where-Object { $_.CommandLine -like '*uvicorn app.main*' })
  $ids = @($servers | ForEach-Object { $_.ProcessId })
  # Reload workers are children of the uvicorn reloader.
  $workers = @($all | Where-Object { $ids -contains $_.ParentProcessId })
  foreach ($p in ($workers + $servers)) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  # Anything still holding the ports (e.g. an orphaned worker).
  Stop-Port $BackendPort
  Stop-Port $FrontendPort
}

function Write-Status {
  $be = 'DOWN'; if (Test-Url $BackendUrl) { $be = 'OK' }
  $fe = 'DOWN'; if (Test-Url $FrontendUrl) { $fe = 'OK' }
  Write-Host ("Backend  http://localhost:{0}  {1}" -f $BackendPort, $be)
  Write-Host ("Frontend http://localhost:{0}  {1}" -f $FrontendPort, $fe)
  Write-Host ("Postgres {0}" -f (Get-PgState))
  return ($be -eq 'OK' -and $fe -eq 'OK')
}

if ($Action -eq 'status') {
  Write-Status | Out-Null
  exit 0
}

Stop-Stack
if ($Action -eq 'stop') {
  Write-Host 'Stopped backend and frontend.'
  exit 0
}

if (-not (Test-Path $Py)) {
  Write-Host "No backend virtualenv at $Py. Create it: cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt"
  exit 1
}

Start-Postgres

$clear = "foreach (`$n in 'DATABASE_URL','SECRET_KEY','LLM_API_KEY','LLM_BASE_URL','LLM_MODEL','LLM_TIMEOUT_S','LLM_REASONING_EFFORT') { [Environment]::SetEnvironmentVariable(`$n, `$null, 'Process') }"

Write-Host 'Running migrations...'
$migrate = "Set-Location '$Backend'; $clear; & '$Py' -m alembic upgrade head; exit `$LASTEXITCODE"
powershell -NoProfile -Command $migrate
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Migrations failed (see above). Is the database running?'
  exit 1
}

$backendCmd = "Set-Location '$Backend'; $clear; & '$Py' -m uvicorn app.main:app --port $BackendPort --reload --reload-dir app"
$frontendCmd = "Set-Location '$Frontend'; `$env:VITE_API_URL = 'http://localhost:$BackendPort'; npx vite --port $FrontendPort --strictPort"
Start-Process powershell -WindowStyle Minimized -ArgumentList '-NoExit', '-Command', $backendCmd
Start-Process powershell -WindowStyle Minimized -ArgumentList '-NoExit', '-Command', $frontendCmd

for ($i = 0; $i -lt 30; $i++) {
  if ((Test-Url $BackendUrl) -and (Test-Url $FrontendUrl)) { break }
  Start-Sleep -Seconds 2
}
if (Write-Status) { exit 0 }
exit 1
