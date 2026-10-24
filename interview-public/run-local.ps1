# Runs the interview simulator on this computer with no install: starts a local server and opens the page.
# Right-click this file > "Run with PowerShell", or:
#   powershell -ExecutionPolicy Bypass -File run-local.ps1
# Keep this window open while using the simulator; close it to stop.
param([string]$Root = $PSScriptRoot, [int]$Port = 8790, [string]$Page = 'index.html')
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Interview simulator running at: http://localhost:$Port/$Page"
Write-Host "Keep this window open. Close it to stop."
Start-Process "http://localhost:$Port/$Page"
$mime = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.json'='application/json'; '.txt'='text/plain; charset=utf-8' }
$rootFull = [IO.Path]::GetFullPath($Root)
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if ($path -eq '/') { $path = '/' + $Page }
  $file = [IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/').Replace('/', '\'))))
  if ($file.StartsWith($rootFull) -and (Test-Path $file -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file)
    $ctx.Response.ContentType = $(if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' })
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
