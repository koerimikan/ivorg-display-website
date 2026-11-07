[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Installer,[string]$OutFile)
# Installs the NSIS bundle silently into a throwaway directory, runs the native
# smoke (HttpOnly cookie read-back, real window close, both ports released),
# deletes bootstrap-owner.txt and runs it again (credential recovery path),
# then uninstalls and removes only the data this run created.
# Refuses to run if the app is already installed or app data already exists,
# so it can never modify a real user installation.
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$appData=Join-Path $env:LOCALAPPDATA 'org.ivorg.companion'
$uninstallKeys='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
function Installed { @(Get-ItemProperty $uninstallKeys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^IVORG Atelier Lab' }) }
if((Installed).Count){throw 'IVORG Atelier Lab is already installed for this user; refusing to touch it.'}
if(Test-Path -LiteralPath $appData){throw "App data already exists at $appData; refusing to touch it."}
$installKey='HKCU:\Software\ivorg\IVORG Atelier Lab'
if(Test-Path -LiteralPath $installKey){throw 'A previous install location is registered; refusing to touch it.'}
$target=Join-Path $env:TEMP ('ivorg-install-verify-'+[guid]::NewGuid().ToString('N').Substring(0,8))
$result=[ordered]@{installer=(Resolve-Path $Installer).Path;installerSha256=(Get-FileHash -Algorithm SHA256 $Installer).Hash.ToLower();installDir=$target;steps=[ordered]@{}}
try {
  $p=Start-Process -FilePath $Installer -ArgumentList '/S',"/D=$target" -PassThru -Wait
  if($p.ExitCode -ne 0){throw "Installer exit code $($p.ExitCode)"}
  $exe=Get-ChildItem -LiteralPath $target -Filter *.exe | Where-Object { $_.Name -notmatch 'uninstall' } | Select-Object -First 1
  if(-not $exe){throw 'Installed executable not found'}
  $result.steps.install=@{status='PASS';exe=$exe.Name;registered=(Test-Path -LiteralPath $installKey)}

  & (Join-Path $repo 'scripts/verify-desktop.ps1') -Executable $exe.FullName | Out-Null
  $project=Join-Path $appData 'projects/workspace-v1'
  $bootstrap=Join-Path $project '.companion/auth/bootstrap-owner.txt'
  if(-not(Test-Path -LiteralPath $bootstrap)){throw 'First run did not create bootstrap-owner.txt'}
  $first=Get-Content -LiteralPath $bootstrap -Raw
  $accounts=Get-Content -LiteralPath (Join-Path $project '.companion/auth/accounts.json') -Raw | ConvertFrom-Json
  $result.steps.firstLaunchSmoke=@{status='PASS';cookieVerified=$true;windowClosed=$true;portsReleased=$true;bootstrapCreated=$true;ownerVersion=$accounts.users[0].version}

  Remove-Item -LiteralPath $bootstrap
  & (Join-Path $repo 'scripts/verify-desktop.ps1') -Executable $exe.FullName | Out-Null
  if(-not(Test-Path -LiteralPath $bootstrap)){throw 'Recovery did not regenerate bootstrap-owner.txt'}
  $second=Get-Content -LiteralPath $bootstrap -Raw
  $accounts2=Get-Content -LiteralPath (Join-Path $project '.companion/auth/accounts.json') -Raw | ConvertFrom-Json
  if($second -eq $first){throw 'Recovered credentials were not rotated'}
  if($accounts2.users[0].version -le $accounts.users[0].version){throw 'Owner version was not bumped'}
  $result.steps.bootstrapRecoverySmoke=@{status='PASS';regenerated=$true;rotated=$true;ownerVersion=$accounts2.users[0].version;autoLoginWithNewCredentials=$true}
  $result.status='PASS'
} catch { $result.status='FAIL';$result.error=$_.Exception.Message }
finally {
  $uninstaller=Join-Path $target 'uninstall.exe'
  if(Test-Path -LiteralPath $uninstaller){
    Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait | Out-Null
    for($i=0;$i -lt 60 -and ((Installed).Count -or (Test-Path -LiteralPath $uninstaller));$i++){Start-Sleep -Milliseconds 500}
  }
  $result.steps.uninstall=@{uninstallEntryRemoved=((Installed).Count -eq 0);binariesRemoved=-not(Test-Path -LiteralPath $uninstaller)}
  # The preconditions proved these did not exist before this run (NSIS leaves the install-dir key behind).
  if(Test-Path -LiteralPath $installKey){Remove-Item -LiteralPath $installKey}
  if((Test-Path 'HKCU:\Software\ivorg') -and -not (Get-ChildItem 'HKCU:\Software\ivorg')){Remove-Item 'HKCU:\Software\ivorg'}
  if(Test-Path -LiteralPath $appData){Remove-Item -LiteralPath $appData -Recurse -Force}
  if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force}
  $result.cleanedUp=-not(Test-Path -LiteralPath $appData) -and -not(Test-Path -LiteralPath $target)
  $json=$result | ConvertTo-Json -Depth 5
  if($OutFile){$json | Set-Content -LiteralPath $OutFile -Encoding utf8}
  $json
}
if($result.status -ne 'PASS'){exit 1}
