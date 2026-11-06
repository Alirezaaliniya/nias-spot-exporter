# Builds the Chrome Web Store upload: dist/nias-spot-exporter-<version>.zip
# Uses forward-slash entry names (Compress-Archive on PowerShell 5.1 writes
# backslashes, which the Web Store can reject).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$out = Join-Path $PSScriptRoot "dist/nias-spot-exporter-$version.zip"

New-Item -ItemType Directory -Force dist | Out-Null
if (Test-Path $out) { Remove-Item $out -Force }

$files = @(Get-Item manifest.json) + (Get-ChildItem icons, src -Recurse -File)
$zip = [System.IO.Compression.ZipFile]::Open($out, "Create")
try {
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($PSScriptRoot.Length + 1).Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $rel, "Optimal") | Out-Null
    }
} finally { $zip.Dispose() }

Write-Host "Created $out ($($files.Count) files)"
