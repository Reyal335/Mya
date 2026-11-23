<#
Manual test for mya-path.ps1. Run it by hand:
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-mya-path.ps1
It never touches HKCU\Environment. Every case runs mya-path.ps1 against scratch keys
(HKCU\Software\mya-test-<guid>\Env and \State) and the scratch root is deleted at the end.
Prints PASS or FAIL for each case. Exit: 0 all passed, 1 a case failed.
#>
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$ps1 = Join-Path $PSScriptRoot 'mya-path.ps1'
$prefix = 'Software\mya-test-'
$root = $prefix + [guid]::NewGuid().ToString('N')
$envRel = "$root\Env"
$stateRel = "$root\State"
$hkcu = [Microsoft.Win32.Registry]::CurrentUser
$realBefore = [string]$hkcu.OpenSubKey('Environment').GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$failures = 0

# Fresh scratch keys: an empty Env key, no State key (mya-path.ps1 makes that one).
function Reset-Keys {
  if (-not $root.StartsWith($prefix)) { throw "Refusing to touch $root" }
  $hkcu.DeleteSubKeyTree($root, $false)
  $hkcu.CreateSubKey($envRel).Close()
}
function Set-Path($Value, $Kind = 'ExpandString') {
  $k = $hkcu.OpenSubKey($envRel, $true)
  $k.SetValue('Path', $Value, [Microsoft.Win32.RegistryValueKind]$Kind)
  $k.Close()
}
function Set-Record([string]$Value) {
  $k = $hkcu.CreateSubKey($stateRel)
  $k.SetValue('CliPathEntry', $Value, [Microsoft.Win32.RegistryValueKind]::String)
  $k.Close()
}
# The raw Path value ($null if there is none), not expanded.
function Get-Path {
  $k = $hkcu.OpenSubKey($envRel)
  $v = $k.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  $k.Close()
  return $v
}
function Get-Kind {
  $k = $hkcu.OpenSubKey($envRel)
  $v = if ($k.GetValueNames() -contains 'Path') { [string]$k.GetValueKind('Path') } else { $null }
  $k.Close()
  return $v
}
function Get-Record {
  $k = $hkcu.OpenSubKey($stateRel)
  if ($null -eq $k) { return $null }
  $v = $k.GetValue('CliPathEntry', $null)
  $k.Close()
  return $v
}
function Test-StateKey { return $null -ne $hkcu.OpenSubKey($stateRel) }

# Runs mya-path.ps1 in its own powershell. Returns the exit code and what it printed.
function Invoke-Mya([string]$Action, [string]$Dir) {
  $ErrorActionPreference = 'Continue'
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1 -Action $Action -Dir $Dir -EnvKey $envRel -StateKey $stateRel -NoBroadcast 2>&1 | Out-String
  return [pscustomobject]@{ Code = $LASTEXITCODE; Out = $out.Trim() }
}

function Check([string]$Name, [bool]$Ok, [string]$Detail) {
  if ($Ok) { Write-Host "PASS $Name" }
  else { Write-Host "FAIL $Name -- $Detail"; $script:failures++ }
}
function Check-Value([string]$Name, $Actual, $Expected) {
  Check $Name ($Actual -ceq $Expected) "expected [$Expected], got [$Actual]"
}

$D = 'C:\Mya Test\resources\bin'
$D1 = 'C:\Mya Test\old\bin'
$D2 = 'C:\Mya Test\new\bin'

try {
  Write-Host "Scratch keys: HKCU\$root"

  Reset-Keys
  $r = Invoke-Mya 'add' $D
  Check-Value '1 missing Path + add: value' (Get-Path) $D
  Check-Value '1 missing Path + add: kind' (Get-Kind) 'ExpandString'
  Check-Value '1 missing Path + add: record' (Get-Record) $D
  Check-Value '1 missing Path + add: exit' $r.Code 0

  Reset-Keys
  Set-Path 'a;b' 'String'
  $r = Invoke-Mya 'add' $D
  Check-Value '2 REG_SZ + add: value' (Get-Path) "a;b;$D"
  Check-Value '2 REG_SZ + add: kind' (Get-Kind) 'String'

  Reset-Keys
  Set-Path '%USERPROFILE%\x;;C:\Y\;' 'ExpandString'
  $r = Invoke-Mya 'add' $D
  Check-Value '3 empty entries + add: value' (Get-Path) "%USERPROFILE%\x;;C:\Y\;$D"
  Check '3 empty entries + add: still unexpanded' ((Get-Path).StartsWith('%USERPROFILE%')) "got [$(Get-Path)]"
  Check-Value '3 empty entries + add: kind' (Get-Kind) 'ExpandString'

  Reset-Keys
  Set-Path 'a' 'ExpandString'
  $r1 = Invoke-Mya 'add' $D
  $r2 = Invoke-Mya 'add' $D
  Check-Value '4 add twice: value' (Get-Path) "a;$D"
  Check '4 add twice: second run says already' ($r2.Out -like '*already*') "got [$($r2.Out)]"
  Check-Value '4 add twice: exit' ($r1.Code + $r2.Code) 0

  Reset-Keys
  Set-Path ('a;' + $D.ToUpper() + '\;b') 'ExpandString'
  $r = Invoke-Mya 'add' $D
  Check-Value '5 same folder, other case and trailing backslash: unchanged' (Get-Path) ('a;' + $D.ToUpper() + '\;b')
  Check-Value '5 same folder, other case and trailing backslash: record' (Get-Record) $D

  Reset-Keys
  Set-Path "a;$D1;b" 'ExpandString'
  Set-Record $D1
  $r = Invoke-Mya 'add' $D2
  Check-Value '6 moved install: value' (Get-Path) "a;b;$D2"
  Check-Value '6 moved install: record' (Get-Record) $D2

  # Case 7 continues from case 6: Path a;b;D2, record D2.
  $r = Invoke-Mya 'remove' $D2
  Check-Value '7 remove with record: value' (Get-Path) 'a;b'
  Check-Value '7 remove with record: record value gone' (Get-Record) $null
  Check '7 remove with record: state key gone' (-not (Test-StateKey)) 'the state key is still there'

  Reset-Keys
  Set-Path "a;$D;b" 'ExpandString'
  $r = Invoke-Mya 'remove' $D
  Check-Value '8 remove with no record: value' (Get-Path) 'a;b'
  Check-Value '8 remove with no record: exit' $r.Code 0

  Reset-Keys
  Set-Path $D 'ExpandString'
  Set-Record $D
  $r = Invoke-Mya 'remove' $D
  Check-Value '9 remove the only entry: Path value deleted' (Get-Path) $null
  Check-Value '9 remove the only entry: exit' $r.Code 0

  Reset-Keys
  $bytes = [byte[]](1, 2, 3, 4, 250)
  Set-Path $bytes 'Binary'
  $r = Invoke-Mya 'add' $D
  $after = $hkcu.OpenSubKey($envRel).GetValue('Path')
  Check-Value '10 REG_BINARY Path: exit' $r.Code 4
  Check-Value '10 REG_BINARY Path: kind' (Get-Kind) 'Binary'
  Check '10 REG_BINARY Path: bytes unchanged' (($after -is [byte[]]) -and ([Convert]::ToBase64String($after) -ceq [Convert]::ToBase64String($bytes))) 'the bytes changed'

  Reset-Keys
  $env:MYA_TEST_X = $D
  try {
    Set-Path '%MYA_TEST_X%' 'ExpandString'
    $r = Invoke-Mya 'add' $D
  } finally { Remove-Item Env:\MYA_TEST_X -ErrorAction SilentlyContinue }
  Check-Value '11 %VAR% that expands to Dir: unchanged' (Get-Path) '%MYA_TEST_X%'
  Check-Value '11 %VAR% that expands to Dir: record' (Get-Record) $D

  Reset-Keys
  Set-Path 'a' 'ExpandString'
  $r = Invoke-Mya 'add' 'relative\bin'
  Check-Value '12 relative Dir: exit' $r.Code 1
  Check-Value '12 relative Dir: Path unchanged' (Get-Path) 'a'

  Reset-Keys
  $original = 'C:\A;  C:\B ;C:\C'
  Set-Path $original 'String'
  $r1 = Invoke-Mya 'add' $D
  $mid = Get-Path
  $r2 = Invoke-Mya 'remove' $D
  Check-Value '13 exact preservation: after add' $mid "$original;$D"
  Check-Value '13 exact preservation: after remove' (Get-Path) $original

  Check-Value 'real user Path was not touched' ([string]$hkcu.OpenSubKey('Environment').GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)) $realBefore
}
finally {
  if ($root.StartsWith($prefix)) { $hkcu.DeleteSubKeyTree($root, $false) }
}

if ($failures -eq 0) { Write-Host 'All cases passed.'; exit 0 }
Write-Host "$failures check(s) failed."
exit 1
