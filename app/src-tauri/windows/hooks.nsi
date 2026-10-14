; NSIS installer hooks (bundle.windows.nsis.installerHooks in tauri.conf.json).
;
; The identifier was com.dialog.app before pm.dialog.chat. Windows keeps the installed app
; under its identifier, so without help an upgrade would leave the old one installed next to
; the new one: the old uninstaller runs silently first (it keeps the user's data).
;
; Windows Explorer also keeps usage counters for every app it shows in the taskbar, keyed by
; the identifier: how often the taskbar badge changed, how often the app was switched to,
; launched, or its jump list shown. The app never writes them and cannot stop Explorer from
; doing so, but they would outlive the app: the uninstaller removes them (for both
; identifiers), so nothing named after Dialog stays in the registry after an uninstall.

!define DIALOG_OLD_ID "com.dialog.app"
!define DIALOG_ID "pm.dialog.chat"
!define DIALOG_USAGE "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage"

!macro NSIS_HOOK_PREINSTALL
  ; Per-user install of the earlier identifier (Tauri's default install mode).
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${DIALOG_OLD_ID}" "UninstallString"
  StrCmp $0 "" +3 0
    ExecWait '$0 /S'
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${DIALOG_OLD_ID}"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "${DIALOG_USAGE}\AppBadgeUpdated" "${DIALOG_ID}"
  DeleteRegValue HKCU "${DIALOG_USAGE}\AppSwitched" "${DIALOG_ID}"
  DeleteRegValue HKCU "${DIALOG_USAGE}\AppLaunch" "${DIALOG_ID}"
  DeleteRegValue HKCU "${DIALOG_USAGE}\ShowJumpView" "${DIALOG_ID}"
  DeleteRegValue HKCU "${DIALOG_USAGE}\AppBadgeUpdated" "${DIALOG_OLD_ID}"
  DeleteRegValue HKCU "${DIALOG_USAGE}\AppSwitched" "${DIALOG_OLD_ID}"
  DeleteRegValue HKCU "${DIALOG_USAGE}\AppLaunch" "${DIALOG_OLD_ID}"
  DeleteRegValue HKCU "${DIALOG_USAGE}\ShowJumpView" "${DIALOG_OLD_ID}"
!macroend
