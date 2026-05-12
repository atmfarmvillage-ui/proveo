$root = $PSScriptRoot
$prefix = 'http://localhost:8080/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
  Write-Host "ERREUR demarrage: $($_.Exception.Message)"
  exit 1
}
Write-Host "Serveur PROVENDA actif sur $prefix"
Write-Host "Racine: $root"

$mimes = @{
  '.html'='text/html; charset=utf-8'
  '.htm' ='text/html; charset=utf-8'
  '.js'  ='application/javascript; charset=utf-8'
  '.css' ='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'
  '.png' ='image/png'
  '.jpg' ='image/jpeg'
  '.jpeg'='image/jpeg'
  '.svg' ='image/svg+xml'
  '.ico' ='image/x-icon'
  '.webmanifest'='application/manifest+json'
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch { break }
  $req = $ctx.Request
  $resp = $ctx.Response
  $path = [Uri]::UnescapeDataString($req.Url.LocalPath)
  if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
  $file = Join-Path $root $path.TrimStart('/')

  if (Test-Path -LiteralPath $file -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    $mime = if ($mimes.ContainsKey($ext)) { $mimes[$ext] } else { 'application/octet-stream' }
    $resp.ContentType = $mime
    $resp.Headers.Add('Cache-Control','no-cache, no-store, must-revalidate')
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    Write-Host ("[{0}] {1} -> {2}" -f $req.HttpMethod, $path, $bytes.Length)
  } else {
    $resp.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
    $resp.ContentLength64 = $msg.Length
    $resp.OutputStream.Write($msg, 0, $msg.Length)
    Write-Host ("[404] {0}" -f $path)
  }
  $resp.Close()
}
