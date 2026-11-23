; The mya command: <install>\resources\bin on the USER Path. The Path itself only ever
; passes through mya-path.ps1, never an NSIS string. A failure is reported and the
; install still succeeds.
!include "LogicLib.nsh"

!macro myaCliPath ACTION
  Push $0
  Push $1
  DetailPrint "Setting up the mya command (${ACTION})..."
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\bin\mya-path.ps1" -Action ${ACTION} -Dir "$INSTDIR\resources\bin"'
  Pop $0
  Pop $1
  DetailPrint "$1"
  ${If} $0 != "0"
    DetailPrint "The mya command was not set up (result $0). Mya itself is installed."
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro customInstall
  !insertmacro myaCliPath add
!macroend

!macro customUnInstall
  ; In an update the old uninstaller runs first: leave the entry. The new installer's
  ; customInstall keeps it, or moves it if the install folder changed.
  ${IfNot} ${isUpdated}
    !insertmacro myaCliPath remove
  ${EndIf}
!macroend
