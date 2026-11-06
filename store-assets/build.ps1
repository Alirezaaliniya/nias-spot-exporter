# Renders the Chrome Web Store images from the real extension pages (with demo
# data from _src/stub.js) using headless Chrome, then converts them to 24-bit
# PNG without alpha as the store requires.
#   powershell -File store-assets/build.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Add-Type -AssemblyName System.Drawing

$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Google Chrome not found" }

$build = Join-Path $PSScriptRoot "_build"
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory $build | Out-Null
Copy-Item "_src\*" $build

# Copy an extension page into _build, pointing its assets at ../../src and
# loading the stub before any extension script.
function Stub-Page($rel, $name) {
    $dir = Split-Path $rel -Parent
    $html = Get-Content "..\src\$rel" -Raw -Encoding UTF8
    $html = $html -replace '"\.\./shared/', '"../../src/shared/'
    $html = [regex]::Replace($html, '(src|href)="(?!\.\./|https?:)([\w.-]+\.(js|css))"', "`$1=`"../../src/$($dir -replace '\\','/')/`$2`"")
    $html = $html -replace '(<script src="\.\./\.\./src/shared/settings\.js">)', '<script src="stub.js"></script>$1'
    [IO.File]::WriteAllText((Join-Path $build $name), $html, (New-Object Text.UTF8Encoding $false))
}
Stub-Page "editor\editor.html" "editor.html"
Stub-Page "licenses\licenses.html" "licenses.html"
Stub-Page "popup\popup.html" "popup.html"

function Shot($page, $w, $h, $out, $scale = 1) {
    $url = "file:///" + ((Join-Path $build $page) -replace '\\', '/')
    $tmp = Join-Path $build "tmp.png"
    # Chrome logs harmless warnings to stderr; don't let them abort the script.
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & $chrome --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files `
        --force-device-scale-factor=1 --virtual-time-budget=6000 --window-size="$($w*$scale),$($h*$scale)" `
        --screenshot="$tmp" $url 2>&1 | Out-Null
    $ErrorActionPreference = $prev
    if (-not (Test-Path $tmp)) { throw "Screenshot failed: $page" }
    # flatten to 24-bit RGB (no alpha)
    $src = [Drawing.Image]::FromFile($tmp)
    $bmp = New-Object Drawing.Bitmap $w, $h, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.Clear([Drawing.Color]::White)
    $g.InterpolationMode = "HighQualityBicubic"; $g.PixelOffsetMode = "HighQuality"
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose(); $src.Dispose()
    $bmp.Save((Join-Path $PSScriptRoot $out), [Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Remove-Item $tmp
    Write-Host "  $out"
}

Write-Host "Rendering..."
1..5 | ForEach-Object { Shot "frame.html?s=$_" 1280 800 "screenshot-$_.png" }
Shot "tile-small.html" 440 280 "promo-small-440x280.png" 2
Shot "marquee.html" 1400 560 "promo-marquee-1400x560.png"

# Store icon: 96x96 artwork centred in a transparent 128x128 canvas.
$logo = [Drawing.Image]::FromFile((Resolve-Path "..\icons\icon128.png"))
$icon = New-Object Drawing.Bitmap 128, 128, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [Drawing.Graphics]::FromImage($icon)
$g.InterpolationMode = "HighQualityBicubic"; $g.SmoothingMode = "HighQuality"; $g.PixelOffsetMode = "HighQuality"
$g.Clear([Drawing.Color]::Transparent)
$g.DrawImage($logo, 16, 16, 96, 96)
$g.Dispose(); $logo.Dispose()
$icon.Save((Join-Path $PSScriptRoot "store-icon-128.png"), [Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose()
Write-Host "  store-icon-128.png"

Remove-Item $build -Recurse -Force
Write-Host "Done."
