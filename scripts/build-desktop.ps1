[CmdletBinding()]
param([switch]$Dev,[switch]$PrepareOnly,[switch]$SkipRegression,[string]$NodeVersion='22.21.0')
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tauriRoot=Join-Path $projectRoot 'src-tauri'
$portableCargo=Join-Path $tauriRoot '.tools/cargo/bin'
if(Test-Path -LiteralPath (Join-Path $portableCargo 'cargo.exe')) { $env:PATH=$portableCargo+';'+$env:PATH; $env:CARGO_HOME=Join-Path $tauriRoot '.tools/cargo'; $env:RUSTUP_HOME=Join-Path $tauriRoot '.tools/rustup' }
function File-Sha([string]$Path){ $stream=[IO.File]::OpenRead($Path); try { $hash=[Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLower() } finally { $hash.Dispose() } } finally { $stream.Dispose() } }
function Run-Checked([string]$Executable,[string[]]$Arguments){ & $Executable @Arguments; if($LASTEXITCODE -ne 0){throw "Command failed with exit code $LASTEXITCODE : $Executable"} }
if($env:OS -ne 'Windows_NT'){throw 'This packaging pipeline targets Windows x64. The runner itself supports POSIX.'}
if([Environment]::Is64BitProcess -ne $true){throw 'Use a 64-bit PowerShell process.'}
if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw 'Install Node.js 22.19+ from https://nodejs.org/ first.'}
if(-not $PrepareOnly -and -not(Get-Command cargo -ErrorAction SilentlyContinue)){throw 'Rust/Cargo missing. Install the stable x86_64-pc-windows-msvc toolchain from https://rustup.rs/ and Visual Studio C++ Build Tools, then rerun. No application files were modified.'}
if(-not $PrepareOnly){if(-not(Get-Command rustc -ErrorAction SilentlyContinue)){throw 'rustc missing; install the stable MSVC toolchain.'};$hostOutput=& rustc --print host-tuple;if($LASTEXITCODE -ne 0){throw 'Rust toolchain is not initialized; run rustup default stable.'};$hostTriple=($hostOutput | Out-String).Trim();if($hostTriple -ne 'x86_64-pc-windows-msvc'){throw "Unsupported Rust host: $hostTriple. This pipeline bundles Windows x64 Node."}}
Push-Location $projectRoot
try {
 $cli=Join-Path $tauriRoot 'node_modules/.bin/tauri.cmd'
 if(-not(Test-Path -LiteralPath $cli)){Run-Checked 'npm.cmd' @('ci','--prefix',$tauriRoot,'--no-audit','--no-fund')}
 if(-not(Test-Path -LiteralPath $cli)){throw 'Tauri CLI missing. Run npm ci --prefix src-tauri.'}
 $binaries=Join-Path $tauriRoot 'binaries';New-Item -ItemType Directory -Force $binaries | Out-Null
 $binary=Join-Path $binaries 'node-runtime-x86_64-pc-windows-msvc.exe'
 $checksumFile=Join-Path $binaries 'node-runtime.sha256.json'
 $expected=$null
 if(Test-Path -LiteralPath $checksumFile){$saved=Get-Content -Raw -LiteralPath $checksumFile | ConvertFrom-Json;if($saved.version -eq $NodeVersion){$expected=$saved.sha256}}
 if(-not $expected){
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $checks=(Invoke-WebRequest -TimeoutSec 120 -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt").Content
  $entry=($checks -split "`n" | Where-Object {$_ -match '\swin-x64/node\.exe\s*$'} | Select-Object -First 1)
  if(-not $entry){throw 'Official Node.js checksum entry missing.'};$expected=($entry -split '\s+')[0].ToLower()
 }
 if(-not(Test-Path -LiteralPath $binary) -or (File-Sha $binary) -ne $expected){
  $local=(Get-Command node).Source
  if((File-Sha $local) -eq $expected){Copy-Item -LiteralPath $local -Destination $binary}
  else {Invoke-WebRequest -TimeoutSec 120 -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe" -OutFile ($binary+'.download');if((File-Sha ($binary+'.download')) -ne $expected){throw 'Node.js SHA256 verification failed.'};Move-Item -LiteralPath ($binary+'.download') -Destination $binary -Force}
 }
 if((File-Sha $binary) -ne $expected){throw 'Bundled runtime SHA256 mismatch.'}
 [IO.File]::WriteAllText($checksumFile,(@{version=$NodeVersion;sha256=$expected;source="https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe"} | ConvertTo-Json))
 $nodeLicense=Join-Path $binaries "node-v$NodeVersion-LICENSE.txt"
 if(-not(Test-Path -LiteralPath $nodeLicense)){Invoke-WebRequest -TimeoutSec 120 -UseBasicParsing -Uri "https://raw.githubusercontent.com/nodejs/node/v$NodeVersion/LICENSE" -OutFile $nodeLicense}
 if((Get-Item -LiteralPath $nodeLicense).Length -lt 1000){throw 'Node distribution license missing or truncated.'}
 Run-Checked 'node' @('scripts/prepare-desktop.cjs')
 Run-Checked 'npm.cmd' @('run','build')
 if(-not $SkipRegression){Run-Checked 'node' @('scripts/pipeline-gate.mjs','P4');Run-Checked 'node' @('--test','scripts/tauri-desktop.test.cjs')}
 Run-Checked 'node' @('scripts/prepare-desktop.cjs','--clean-caches')
 if($PrepareOnly){Write-Host 'DESKTOP PREPARED: resources and portable runtime ready; no Rust compilation requested.';return}
 Push-Location $tauriRoot
 try {if($Dev){Run-Checked $cli @('dev','--no-dev-server-wait')}else{Run-Checked $cli @('build')}} finally {Pop-Location}
 Write-Host 'Desktop artifacts: src-tauri/target/release/bundle/nsis/'
} finally {Pop-Location}
