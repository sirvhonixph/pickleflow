# Stop stray Next.js dev servers, then start one clean instance.
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Set-Location $PSScriptRoot
npm run dev
