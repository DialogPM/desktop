# Desktop auto-updates (signed)

The desktop app includes `tauri-plugin-updater`. It is **off** unless the build sets an update
signing public key and an update endpoint, and in every copy that a store or the system
updates. Code: `app/src-tauri/src/updater.rs`, `app/src/lib/updater.ts`.

## How it works

- Build-time variables (read with `option_env!`, so they are baked into the binary):
  - `DIALOG_UPDATER_PUBKEY`: the public key printed by `pnpm tauri signer generate` (the base64
    text from the `.pub` file);
  - `DIALOG_UPDATER_ENDPOINT`: `https://…` URL of the update manifest; it may contain
    `{{target}}`, `{{arch}}` and `{{current_version}}`. Plain `http://` is refused.
- Without both, the plugin is not even registered.
- **Only copies that can replace themselves update themselves**: the Windows setup program
  (NSIS), the AppImage and the macOS app outside the App Store. The same binary also ships as
  `.msi` (repackaged for the Microsoft Store), `.deb` (repackaged as a snap) and `.rpm`; those
  are updated by the store or by the system, and in them the updater stays off. They keep the
  prompt that opens the download page when the server announces a newer version.
- With updates on, the app asks the endpoint at start and every 6 hours. A newer version shows
  a banner ("Dialog X is available") and a row in Settings → About; nothing is downloaded or
  installed until the user clicks ("Install and restart", command `update_install`). The UI
  then shows the download progress, and the app restarts into the new version. When the server
  announces a required version, the same signed update is installed from that prompt.
- **Signature verification is mandatory**: the plugin checks the minisign signature of every
  downloaded update against the built-in public key and refuses anything else. There is no
  setting to turn this off. The web view gets no `updater:` permission, so page script cannot
  drive the updater with other parameters. An update is only accepted when its version is
  higher than the installed one, so the endpoint cannot roll an install back.
- What the endpoint sees: one HTTPS request for the manifest (address, time, and the app's
  user agent), like opening the release page in a browser. No account or device identifier is
  sent.

## Generating and keeping the key (owner, once)

On an **offline** machine (or at least not the CI runner, not the repository):

```sh
cd app
pnpm tauri signer generate -w ~/dialog-updater.key     # asks for a password
```

This writes `dialog-updater.key` (private, password-protected) and `dialog-updater.key.pub`.

- Store the private key and its password **offline**: e.g. two encrypted USB sticks in
  different places, plus the password in a password manager. Never commit it, never paste it
  into an issue, never put it on the update server.
- Losing it means installed apps can no longer be updated (they only accept that key): a new
  key requires users to install a new build by hand. Leaking it lets whoever has it push code
  to every user who can be pointed at their endpoint: rotate by shipping a build with a new
  public key, and treat it as a security incident.
- The public key (`.pub` content) is not secret: set it as `DIALOG_UPDATER_PUBKEY` in the
  release build environment (e.g. a GitHub Actions variable).

## Releases built by GitHub Actions

`.github/workflows/desktop.yml` signs when the repository has all three:

| Kind | Name | Value |
| --- | --- | --- |
| secret | `TAURI_SIGNING_PRIVATE_KEY` | content of `dialog-updater.key` |
| secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password |
| variable | `DIALOG_UPDATER_PUBKEY` | content of `dialog-updater.key.pub` |

The build then bakes in the public key and the endpoint
`https://github.com/<owner>/<repo>/releases/latest/download/latest.json`, and writes the update
packages with their `.sig` files: `Dialog.app.tar.gz` (macOS, universal), the NSIS setup
program (Windows) and the AppImage (Linux). On a version tag the `release` job uploads them
with the installers and, last, the manifest:

```json
{
  "version": "0.1.5",
  "notes": "https://github.com/DialogPM/desktop/releases/tag/v0.1.5",
  "pub_date": "2026-11-24T12:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<content of the .sig>", "url": "https://github.com/DialogPM/desktop/releases/download/v0.1.5/Dialog.app.tar.gz" },
    "darwin-x86_64": { "signature": "…", "url": "…/Dialog.app.tar.gz" },
    "windows-x86_64-nsis": { "signature": "…", "url": "…/Dialog_0.1.5_x64-setup.exe" },
    "linux-x86_64-appimage": { "signature": "…", "url": "…/Dialog_0.1.5_amd64.AppImage" }
  }
}
```

Without the secrets the workflow builds exactly as before, with updates off.

Notes:

- The first release built with the key has to be installed by hand; from then on the app
  updates itself. Earlier versions have no updater.
- A draft or a pre-release is not "latest": installed apps only see a published release.
- GitHub hosts the files but cannot change what gets installed: a package that is not signed
  with the key is refused by the app.
- CI holds the signing key in this setup. Whoever can change the workflow on the release
  branch, or read the repository secrets, can sign an update: keep the repository's write
  access and its Actions settings as tight as the key itself.

## Signing a release by hand

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat /path/to/dialog-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='…'
export DIALOG_UPDATER_PUBKEY="$(cat /path/to/dialog-updater.key.pub)"
export DIALOG_UPDATER_ENDPOINT='https://updates.example.com/dialog/latest.json'
cat > updater.conf.json <<JSON
{"bundle": {"createUpdaterArtifacts": true},
 "plugins": {"updater": {"pubkey": "$DIALOG_UPDATER_PUBKEY", "endpoints": ["$DIALOG_UPDATER_ENDPOINT"]}}}
JSON
cd app && pnpm tauri build --config ../updater.conf.json
```

Tauri then writes the update packages and their `.sig` files; publish a manifest like the one
above at the endpoint.

## Still missing

- Windows Authenticode signing is separate from the update signature and still missing
  (SmartScreen warns on the first install; updates themselves are verified by the app).
