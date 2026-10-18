<#
.SYNOPSIS
  Gắn dòng đếm truy cập ose-track.js vào tất cả frontend app trong C:\apps.

.DESCRIPTION
  Tìm các file .html (sâu tối đa 2 cấp, bỏ qua node_modules, dist, build, .git) trong mỗi
  thư mục *-frontend, chèn trước </head>:
      <script src="https://portlogistics.ose.vn/ose-track.js" defer></script>
  File nào đã có "ose-track.js" thì bỏ qua. Mặc định chỉ LIỆT KÊ (chạy thử);
  thêm -Apply để sửa file, thêm -Push để commit + push (Cloudflare Pages tự build lại).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\add-ose-track.ps1                 # xem trước
  powershell -ExecutionPolicy Bypass -File .\add-ose-track.ps1 -Apply          # sửa file
  powershell -ExecutionPolicy Bypass -File .\add-ose-track.ps1 -Apply -Push    # sửa + đẩy lên GitHub
  powershell -ExecutionPolicy Bypass -File .\add-ose-track.ps1 -Only route,ukc -Apply -Push
#>
param(
  [string]$Root = "C:\apps",
  [string]$Pattern = "*-frontend",
  [string[]]$Only = @(),
  [switch]$Apply,
  [switch]$Push
)

$Tag = '<script src="https://portlogistics.ose.vn/ose-track.js" defer></script>'
$Skip = '\\(node_modules|dist|dist-ssr|build|\.git|coverage)(\\|$)'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$changed = 0; $already = 0; $nohead = 0

$dirs = Get-ChildItem -Path $Root -Directory -Filter $Pattern | Where-Object { $_.Name -ne "ose-portlogistics-frontend" }
if ($Only.Count -gt 0) { $dirs = $dirs | Where-Object { $n = $_.Name; ($Only | Where-Object { $n -like "*$_*" }).Count -gt 0 } }

foreach ($d in $dirs) {
  $files = Get-ChildItem -Path $d.FullName -Recurse -Depth 2 -Filter *.html -File -ErrorAction SilentlyContinue |
           Where-Object { $_.FullName -notmatch $Skip }
  $touched = @()
  foreach ($f in $files) {
    $text = [System.IO.File]::ReadAllText($f.FullName)
    if ($text -match 'ose-track\.js') { $already++; continue }
    if ($text -notmatch '(?i)</head>') { $nohead++; continue }
    $rel = $f.FullName.Substring($d.FullName.Length + 1)
    Write-Host ("  + {0}\{1}" -f $d.Name, $rel) -ForegroundColor Cyan
    if ($Apply) {
      $re = [regex]'(?i)</head>'
      $new = $re.Replace($text, "  $Tag`r`n  </head>", 1)
      [System.IO.File]::WriteAllText($f.FullName, $new, $Utf8NoBom)
      $touched += $f.FullName
    }
    $changed++
  }
  if ($Apply -and $Push -and $touched.Count -gt 0 -and (Test-Path (Join-Path $d.FullName ".git"))) {
    Push-Location $d.FullName
    git add -- $touched | Out-Null
    git commit -m "Add ose-track.js visitor counter" | Out-Null
    git push
    if ($LASTEXITCODE -ne 0) { Write-Warning "$($d.Name): git push lỗi, kiểm tra lại" }
    Pop-Location
  }
}

Write-Host ""
if ($Apply) { Write-Host "Đã gắn vào $changed file." -ForegroundColor Green }
else { Write-Host "Sẽ gắn vào $changed file (chạy lại với -Apply để sửa thật)." -ForegroundColor Yellow }
Write-Host "Đã có sẵn: $already file. Không có </head> (bỏ qua): $nohead file."
