[CmdletBinding()]
param([string]$Executable='src-tauri/target/debug/ivorg-companion.exe')
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
function Port-IsOpen([int]$Port){
 $client=New-Object Net.Sockets.TcpClient
 try { $client.Connect('127.0.0.1',$Port);return $true } catch {return $false} finally {$client.Dispose()}
}
foreach($port in @(4321,4323)){if(Port-IsOpen $port){throw "Port $port is occupied. Close the Web workbench first; this test never terminates unrelated services."}}
if(-not [IO.Path]::IsPathRooted($Executable)){$Executable=Join-Path $projectRoot $Executable}
if(-not(Test-Path -LiteralPath $Executable)){throw 'Build the desktop executable first.'}
$logRoot=Join-Path $projectRoot 'src-tauri/verification'
New-Item -ItemType Directory -Force $logRoot | Out-Null
$marker=Join-Path $env:LOCALAPPDATA 'org.ivorg.companion/desktop-smoke.json'
$started=[DateTime]::UtcNow
$previous=$env:COMPANION_DESKTOP_SMOKE
try {
 $env:COMPANION_DESKTOP_SMOKE='1'
 $process=Start-Process -FilePath $Executable -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot 'smoke.stdout.log') -RedirectStandardError (Join-Path $logRoot 'smoke.stderr.log')
 # Keep the handle alive: Windows PowerShell 5 can otherwise lose ExitCode after exit.
 $processHandle=$process.Handle
 if(-not $process.WaitForExit(300000)){Stop-Process -Id $process.Id;throw 'Native startup/window-close test timed out.'}
 $exitCode=$process.ExitCode
 if($null -eq $exitCode -or $exitCode -ne 0){throw "Native desktop exited with code '$exitCode'; inspect smoke.stderr.log."}
 if(-not(Test-Path -LiteralPath $marker) -or (Get-Item -LiteralPath $marker).LastWriteTimeUtc -lt $started){throw 'No fresh native cookie/window-close evidence.'}
 $evidence=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
 if(-not $evidence.cookieVerified -or -not $evidence.windowCloseRequested -or $evidence.entry -ne 'http://127.0.0.1:4323/?study=rhine'){throw 'Unexpected native evidence.'}
 foreach($port in @(4321,4323)){if(Port-IsOpen $port){throw "Orphan listener on $port after native window close."}}
 @{exitCode=$exitCode;cookieVerified=$true;windowClosed=$true;remainingListeners=0;verifiedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logRoot 'latest-native-result.json')
 Write-Output 'PASS: native HttpOnly cookie read-back, real window close, 4321/4323 both released.'
} finally {$env:COMPANION_DESKTOP_SMOKE=$previous}
