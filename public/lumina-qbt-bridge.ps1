$ErrorActionPreference = "Stop"
$port = 3210
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)

$qbtCandidates = @(
  "$env:ProgramFiles\qBittorrent\qbittorrent.exe",
  "${env:ProgramFiles(x86)}\qBittorrent\qbittorrent.exe",
  "$env:LOCALAPPDATA\qBittorrent\qbittorrent.exe"
)
$qbtPath = $qbtCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $qbtPath) { throw "No se encontro qbittorrent.exe. Instala qBittorrent en su ubicacion habitual." }

function Send-Response($stream, [int]$status, [string]$body, [string]$origin) {
  $reason = if ($status -eq 200) { "OK" } elseif ($status -eq 204) { "No Content" } else { "Bad Request" }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $headers = "HTTP/1.1 $status $reason`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: $origin`r`nAccess-Control-Allow-Methods: POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($bytes.Length) { $stream.Write($bytes, 0, $bytes.Length) }
}

$listener.Start()
Write-Host ""
Write-Host "Puente de Lumina activo en http://127.0.0.1:$port" -ForegroundColor Green
Write-Host "Deja esta ventana abierta mientras uses la descarga masiva." -ForegroundColor Yellow
Write-Host "Presiona Ctrl+C para cerrarlo."

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      $headers = @{}
      while (($line = $reader.ReadLine()) -ne "") {
        $parts = $line -split ":", 2
        if ($parts.Count -eq 2) { $headers[$parts[0].Trim().ToLowerInvariant()] = $parts[1].Trim() }
      }
      $origin = if ($headers.ContainsKey("origin")) { $headers["origin"] } else { "null" }
      if ($requestLine.StartsWith("OPTIONS ")) { Send-Response $stream 204 "" $origin; continue }
      if (-not $requestLine.StartsWith("POST /import ")) { Send-Response $stream 400 '{"error":"Ruta no valida"}' $origin; continue }
      $length = if ($headers.ContainsKey("content-length")) { [int]$headers["content-length"] } else { 0 }
      $buffer = New-Object char[] $length
      $read = $reader.ReadBlock($buffer, 0, $length)
      $payload = (-join $buffer[0..($read - 1)]) | ConvertFrom-Json
      $magnets = @($payload.magnets | Where-Object { $_ -is [string] -and $_.StartsWith("magnet:?xt=urn:btih:") })
      if (-not $magnets.Count) { Send-Response $stream 400 '{"error":"No se recibieron magnets validos"}' $origin; continue }
      foreach ($magnet in $magnets) {
        Start-Process -FilePath $qbtPath -ArgumentList @($magnet) -WindowStyle Hidden
        Start-Sleep -Milliseconds 80
      }
      Send-Response $stream 200 (ConvertTo-Json @{ imported = $magnets.Count }) $origin
      Write-Host "$($magnets.Count) capitulos enviados a qBittorrent." -ForegroundColor Cyan
    } catch {
      try { Send-Response $stream 400 (ConvertTo-Json @{ error = $_.Exception.Message }) "null" } catch {}
    } finally { $client.Close() }
  }
} finally { $listener.Stop() }
