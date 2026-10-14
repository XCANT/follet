; Uninstall: offer to delete the user's Follet data (settings, shelf, chats, encrypted keys).
; Never during an update, and the answer defaults to "No" for silent uninstalls.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Supprimer aussi tes réglages et données Follet ?$\r$\nDelete your Follet settings and data too?$\r$\n$\r$\n$APPDATA\Follet" /SD IDNO IDNO keepData
      RMDir /r "$APPDATA\Follet"
    keepData:
  ${endIf}
!macroend
