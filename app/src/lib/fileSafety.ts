// Received files that run code when opened (programs, scripts, installers, shortcuts): saving
// one asks first, since the sender (or someone who took over their account) may be sending
// malware disguised as a document.

const DANGEROUS_EXTENSIONS = new Set([
  // Windows programs, installers and system files
  "exe", "com", "scr", "pif", "msi", "msp", "mst", "msix", "msixbundle", "appx", "appxbundle", "dll", "sys", "drv",
  "cpl", "ocx", "vxd", "inf", "ins", "isp", "cab", "diagcab", "msc", "gadget", "application", "appref-ms",
  // Windows scripts and shortcuts
  "bat", "cmd", "ps1", "ps1xml", "ps2", "psc1", "psm1", "psd1", "psrc", "vb", "vbe", "vbs", "js", "jse", "wsf", "wsh",
  "wsc", "sct", "hta", "chm", "lnk", "url", "scf", "reg", "shb", "settingcontent-ms", "mht", "mhtml", "xbap", "nsh",
  "ade", "adp", "mde", "lib", "library-ms", "searchconnector-ms",
  // macOS
  "app", "dmg", "pkg", "mpkg", "command", "tool", "workflow", "terminal", "scpt", "applescript", "osax", "kext",
  "webloc", "fileloc", "inetloc",
  // Linux and cross-platform
  "sh", "bash", "zsh", "csh", "ksh", "run", "bin", "elf", "deb", "rpm", "appimage", "snap", "flatpakref", "desktop",
  "jar", "jnlp", "py", "pyw", "pl", "rb", "php",
  // Android
  "apk", "apks", "aab", "xapk",
]);

// Bidi controls can make "invoice‮fdp.exe" display as "invoiceexe.pdf".
const BIDI_CONTROLS = /[؜‎‏‪-‮⁦-⁩]/;

/** True when opening the file could run code on this computer. */
export function isFileDangerous(fileName: string): boolean {
  if (BIDI_CONTROLS.test(fileName)) return true;
  // Trailing dots and spaces are ignored by Windows ("setup.exe. " runs as setup.exe).
  const name = fileName.replace(/[\s.]+$/, "").toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 && DANGEROUS_EXTENSIONS.has(name.slice(dot + 1));
}
