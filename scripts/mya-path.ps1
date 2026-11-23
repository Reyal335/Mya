<#
Puts the folder that holds the mya command on the USER Path (HKCU\Environment), or takes
it off. Run by the Mya installer (add) and uninstaller (remove).
The Path is read and written only here, never through NSIS strings or setx. Its type is
kept, %VARIABLES% stay unexpanded, and every other entry stays as it is and where it is,
empty entries included (they are not ours to tidy). The entry added is recorded in
HKCU\<StateKey> (CliPathEntry): a later install takes a moved entry off first, and the
uninstaller takes off exactly the recorded entry.
Exit: 0 done or nothing to do, 1 bad arguments, 2 could not read, 3 could not write,
4 the Path value is not a string.
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('add', 'remove')][string]$Action,
  [Parameter(Mandatory = $true)][string]$Dir,
  # Relative to HKEY_CURRENT_USER. Tests point both at scratch keys.
  [string]$EnvKey = 'Environment',
  [string]$StateKey = 'Software\mya',
  [switch]$NoBroadcast
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$StateName = 'CliPathEntry'
$MaxLength = 32767
$Hkcu = [Microsoft.Win32.Registry]::CurrentUser

function Fail([int]$Code, [string]$Message) {
  [Console]::Error.WriteLine("mya-path: $Message")
  exit $Code
}

# For comparing only; never written back.
function Get-Comparable([string]$Entry) {
  $e = $Entry.Trim()
  if ($e.Length -ge 2 -and $e.StartsWith('"') -and $e.EndsWith('"')) { $e = $e.Substring(1, $e.Length - 2).Trim() }
  return [Environment]::ExpandEnvironmentVariables($e).TrimEnd('\')
}
function Test-Same([string]$A, [string]$B) {
  $x = Get-Comparable $A
  if ($x -eq '') { return $false }
  return [string]::Equals($x, (Get-Comparable $B), [StringComparison]::OrdinalIgnoreCase)
}
function Remove-Matching($List, [string]$Target) {
  $kept = New-Object 'System.Collections.Generic.List[string]'
  foreach ($e in $List) { if (-not (Test-Same $e $Target)) { $kept.Add($e) } }
  return ,$kept
}

$Dir = $Dir.Trim()
if ($Dir -eq '' -or -not [System.IO.Path]::IsPathRooted($Dir)) { Fail 1 'Dir must be an absolute folder path.' }

# Read everything first. Nothing is written unless every read worked.
# (PowerShell names are case-insensitive: the key objects cannot be called $envKey or
# $stateKey, those are the string parameters.)
try {
  $envReg = $Hkcu.OpenSubKey($EnvKey, $true)
  if ($null -eq $envReg) { $envReg = $Hkcu.CreateSubKey($EnvKey) }
  $stateReg = $Hkcu.OpenSubKey($StateKey, $true)
  if ($null -eq $stateReg -and $Action -eq 'add') { $stateReg = $Hkcu.CreateSubKey($StateKey) }
  $pathName = $null
  foreach ($n in $envReg.GetValueNames()) { if ($n -ieq 'Path') { $pathName = $n } }
  if ($null -ne $pathName) {
    $kind = $envReg.GetValueKind($pathName)
    $old = [string]$envReg.GetValue($pathName, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  } else {
    $pathName = 'Path'; $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString; $old = ''
  }
  $recorded = $null
  if ($null -ne $stateReg) { $recorded = $stateReg.GetValue($StateName, $null) }
  if ($recorded -isnot [string] -or $recorded.Trim() -eq '') { $recorded = $null }
} catch { Fail 2 "Could not read the user Path: $($_.Exception.Message)" }
if ($kind -ne [Microsoft.Win32.RegistryValueKind]::ExpandString -and $kind -ne [Microsoft.Win32.RegistryValueKind]::String) {
  Fail 4 "The user Path is a $kind value, not a string. It was not changed."
}

$entries = New-Object 'System.Collections.Generic.List[string]'
if ($old -ne '') { foreach ($e in $old.Split(';')) { $entries.Add($e) } }
if ($Action -eq 'add') {
  if ($null -ne $recorded -and -not (Test-Same $recorded $Dir)) {
    $entries = Remove-Matching $entries $recorded
    Write-Output "Took the old entry $recorded off the user Path."
  }
  $present = $false
  foreach ($e in $entries) { if (Test-Same $e $Dir) { $present = $true } }
  if ($present) { Write-Output "$Dir is already on the user Path." }
  else {
    # "a;b;" ends in an empty entry: fill it, so the value reads "a;b;<dir>".
    if ($entries.Count -gt 0 -and $entries[$entries.Count - 1] -eq '') { $entries[$entries.Count - 1] = $Dir }
    else { $entries.Add($Dir) }
    Write-Output "Added $Dir to the user Path."
  }
} else {
  $target = if ($null -ne $recorded) { $recorded } else { $Dir }
  $before = $entries.Count
  $entries = Remove-Matching $entries $target
  if ($entries.Count -lt $before) { Write-Output "Took $target off the user Path." }
  else { Write-Output "$target was not on the user Path." }
}
$new = [string]::Join(';', $entries)
$changed = -not [string]::Equals($new, $old, [StringComparison]::Ordinal)
if ($new.Length -gt $MaxLength) { Fail 3 "The user Path would be longer than $MaxLength characters. It was not changed." }

if ($changed) {
  try {
    if ($new -eq '') { $envReg.DeleteValue($pathName, $false) }
    else { $envReg.SetValue($pathName, $new, $kind) }
  } catch { Fail 3 "Could not write the user Path: $($_.Exception.Message)" }
  if (-not $NoBroadcast) {
    try {
      Add-Type -Namespace MyaCli -Name Native -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
      $result = [UIntPtr]::Zero
      # HWND_BROADCAST, WM_SETTINGCHANGE, SMTO_ABORTIFHUNG, 5 s.
      [void][MyaCli.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
    } catch { Write-Output "Could not tell Windows the Path changed: $($_.Exception.Message). New terminals see it after signing in again." }
  }
}

try {
  if ($Action -eq 'add') { $stateReg.SetValue($StateName, $Dir, [Microsoft.Win32.RegistryValueKind]::String) }
  elseif ($null -ne $stateReg) {
    $stateReg.DeleteValue($StateName, $false)
    $empty = $stateReg.ValueCount -eq 0 -and $stateReg.SubKeyCount -eq 0
    $stateReg.Close()
    if ($empty) { $Hkcu.DeleteSubKey($StateKey, $false) }
  }
} catch { Fail 3 "The Path is updated, but the record in HKCU\$StateKey could not be written: $($_.Exception.Message)" }
exit 0
