param(
  [switch]$RemoveTemp
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-External {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Host "== $Name"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Invoke-TenantGuard {
  param([string[]]$Arguments)

  Invoke-External `
    -Name "tenantguard $($Arguments -join ' ')" `
    -FilePath "pnpm" `
    -Arguments (@("dlx", "tsx", $script:CliPath) + $Arguments)
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Example = Join-Path $Root "examples\multi-tenant-saas-basic"
$CliPath = Join-Path $Root "packages\cli\src\bin.ts"
$WorkBase = Join-Path ([System.IO.Path]::GetTempPath()) ("tenantguard-first-run-" + [guid]::NewGuid().ToString("N"))
$Repo = Join-Path $WorkBase "repo"
$Out = Join-Path $WorkBase "out"

if (-not (Test-Path -LiteralPath $Example)) {
  throw "Example fixture not found: $Example"
}

New-Item -ItemType Directory -Force -Path $Repo | Out-Null
New-Item -ItemType Directory -Force -Path $Out | Out-Null

Get-ChildItem -LiteralPath $Example -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $Repo -Recurse -Force
}

Invoke-External -Name "git init" -FilePath "git" -Arguments @("-C", $Repo, "init", "--quiet")
Invoke-External -Name "git config user.email" -FilePath "git" -Arguments @("-C", $Repo, "config", "user.email", "demo@example.test")
Invoke-External -Name "git config user.name" -FilePath "git" -Arguments @("-C", $Repo, "config", "user.name", "TenantGuard Demo")
Invoke-External -Name "git config core.autocrlf" -FilePath "git" -Arguments @("-C", $Repo, "config", "core.autocrlf", "false")
Invoke-External -Name "git config commit.gpgsign" -FilePath "git" -Arguments @("-C", $Repo, "config", "commit.gpgsign", "false")
Invoke-External -Name "git add fixture files" -FilePath "git" -Arguments @("-C", $Repo, "add", "README.md", "package.json", "apps", "migrations")
Invoke-External -Name "git commit baseline" -FilePath "git" -Arguments @("-C", $Repo, "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "baseline example")

Invoke-TenantGuard @("scan", $Repo, "--out", $Out)
Invoke-TenantGuard @("gates", $Repo, "--out", $Out)
Invoke-TenantGuard @("queue", $Repo, "--out", $Out)
Invoke-TenantGuard @("route", $Repo, "--out", $Out)
Invoke-TenantGuard @("prompt", "Q-001", "--agent", "claude", "--out", $Out)

$DiffPath = Join-Path $Repo "apps\api\src\routes\admin-preview.ts"
@'
type Handler = (_req: unknown, res: { json: (value: unknown) => void }) => void;

export const router: { get: (path: string, handler: Handler) => void } = {
  get: () => undefined,
};

router.get("/admin/preview", (_req, res) => {
  res.json({ status: "preview" });
});
'@ | Set-Content -LiteralPath $DiffPath -Encoding utf8

Invoke-TenantGuard @("review-pr", $Repo, "--local-diff", "--item", "Q-001", "--out", $Out)

$Expected = @(
  "project-map.json",
  "risks.json",
  "queue.json",
  "route.json",
  "prompt-Q-001.md",
  "review.json",
  "review.md"
)

foreach ($File in $Expected) {
  $Path = Join-Path $Out $File
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing expected output: $Path"
  }
}

$Queue = Get-Content -LiteralPath (Join-Path $Out "queue.json") -Raw | ConvertFrom-Json
if (-not $Queue.items -or $Queue.items.Count -lt 1) {
  throw "queue.json did not contain at least one queue item"
}

$Review = Get-Content -LiteralPath (Join-Path $Out "review.json") -Raw | ConvertFrom-Json
if ($Review.verdict -eq "ready") {
  throw "review.json was expected to be not_ready or needs_verification for the controlled diff"
}
if ($Review.changed_files -notcontains "apps/api/src/routes/admin-preview.ts") {
  throw "review.json did not include the controlled changed file"
}

Write-Host ""
Write-Host "TenantGuard first-run smoke passed."
Write-Host "Temp repo: $Repo"
Write-Host "Outputs:   $Out"

if ($RemoveTemp) {
  $TempRoot = [System.IO.Path]::GetTempPath()
  $ResolvedWorkBase = (Resolve-Path -LiteralPath $WorkBase).Path
  if (-not $ResolvedWorkBase.StartsWith($TempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside the system temp directory: $ResolvedWorkBase"
  }
  Remove-Item -LiteralPath $ResolvedWorkBase -Recurse -Force
  Write-Host "Removed temp directory: $ResolvedWorkBase"
}
