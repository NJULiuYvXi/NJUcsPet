$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $root 'bin'
New-Item -ItemType Directory -Force $outputDirectory | Out-Null

$helpers = @('WindowTracker', 'WindowProbe')
foreach ($helper in $helpers) {
    $output = Join-Path $outputDirectory "$helper.exe"
    if (Test-Path $output) { Remove-Item -LiteralPath $output -Force }
    Add-Type -Path (Join-Path $PSScriptRoot "$helper.cs") -OutputAssembly $output -OutputType ConsoleApplication
    Write-Host "Wrote $output"
}
