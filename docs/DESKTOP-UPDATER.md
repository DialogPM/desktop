# Desktop auto-updates (signed)

Gap analysis item 6.3. The desktop app includes `tauri-plugin-updater`, but it is **off** in
every build unless the build sets an update signing public key and an update endpoint. Code:
`app/src-tauri/src/updater.rs`.

## How it works

- Build-time variables (read with `option_env!`, so they are baked into the binary):
  - `DIALOG_UPDATER_PUBKEY`: the public key printed by `pnpm tauri signer generate` (the base64
    text from the `.pub` file);
  - `DIALOG_UPDATER_ENDPOINT`: `https://…` URL of the update manifest; it may contain
    `{{target}}`, `{{arch}}` and `{{current_version}}`. Plain `http://` is refused.
- Without both, the plugin is not even registered. With both, the app checks once at start
  and the UI shows a banner ("Dialog X is available"); installing happens only when the user
  clicks it (`update_install` command).
- **Signature verification is mandatory**: the plugin checks the minisign signature of every
  downloaded update against the built-in public key and refuses anything else. There is no
  setting to turn this off. The web view gets no `updater:` permission, so page script cannot
  drive the updater with other parameters.

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

## Signing a release

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat /path/to/dialog-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='…'
export DIALOG_UPDATER_PUBKEY="$(cat /path/to/dialog-updater.key.pub)"
export DIALOG_UPDATER_ENDPOINT='https://updates.example.com/dialog/{{target}}/{{arch}}/{{current_version}}'
cd app && pnpm tauri build   # with "createUpdaterArtifacts": true in bundle config for releases
```

Tauri then writes the update bundles and their `.sig` files. Publish a manifest at the
endpoint, for example:

```json
{
  "version": "0.2.0",
  "notes": "…",
  "pub_date": "2026-11-01T12:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<content of the .sig>", "url": "https://updates.example.com/Dialog_0.2.0_aarch64.app.tar.gz" },
    "windows-x86_64": { "signature": "<content of the .sig>", "url": "https://updates.example.com/Dialog_0.2.0_x64-setup.exe" }
  }
}
```

Recommended: sign releases on a dedicated, offline-capable machine (not in CI) and upload the
signed artifacts; if CI must sign, use a protected environment with required reviewers, and
keep the private key only in that environment's secrets.

## Still to do before the first public release

- Add `"createUpdaterArtifacts": true` to `bundle` in `app/src-tauri/tauri.conf.json` for release
  builds (it fails without `TAURI_SIGNING_PRIVATE_KEY`, so it is not set by default).
- OS code signing / notarization (Apple Developer ID, Windows Authenticode) is separate from the
  update signature and still missing (`desktop.yml` builds ad-hoc signed apps).
