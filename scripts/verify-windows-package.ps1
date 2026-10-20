$ErrorActionPreference = 'Stop'
$expectedName = 'Flow-Tube - Dollhouse Deviants Tuned (Desktop)'
$expectedTitle = 'Flow-Tube: Dollhouse Deviants Tuned (Desktop)'
$bundle = Get-ChildItem 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe'
if ($bundle.Count -ne 1) { throw 'Expected exactly one NSIS installer' }
$installDirectory = Join-Path $env:RUNNER_TEMP 'deviants-package-smoke'
$installer = Start-Process -FilePath $bundle.FullName -ArgumentList '/S', "/D=$installDirectory" -Wait -PassThru
if ($installer.ExitCode -ne 0) { throw "NSIS failed: $($installer.ExitCode)" }
$installed = Join-Path $installDirectory 'flow.exe'
if (-not (Test-Path $installed)) { throw 'Installed executable missing' }
$entries = @(
  'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*',
  'HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*',
  'HKLM:/Software/WOW6432Node/Microsoft/Windows/CurrentVersion/Uninstall/*'
) | ForEach-Object { Get-ItemProperty $_ -ErrorAction SilentlyContinue }
$entry = $entries | Where-Object { $_.DisplayName -eq $expectedName } | Select-Object -First 1
if (-not $entry) { throw 'Installer display name did not match the tuned name' }
$app = Start-Process -FilePath $installed -PassThru
try {
  $title = ''
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    $app.Refresh()
    if ($app.HasExited) { throw 'Installed app exited before showing its window' }
    $title = $app.MainWindowTitle
    if ($title -eq $expectedTitle) { break }
  }
  if ($title -ne $expectedTitle) { throw "Window title mismatch: $title" }
  Write-Output "Installed package: $($entry.DisplayName); version: $($entry.DisplayVersion); window: $title"
} finally {
  if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
}
