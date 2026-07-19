!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NJUcsPete" '"$INSTDIR\NJUcsPete.exe"'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NJUcsPete"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "nju-cs-pete"
!macroend
