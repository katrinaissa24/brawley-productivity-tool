# Releasing & auto-updates

Flow ships with Tauri's built-in updater. Once set up, the installed app checks
GitHub on every launch (and from **Settings → General → Updates → Check now**),
and offers to download + install any newer **signed** release, then restarts
itself. No more manual `git pull` + rebuild.

Updates are cryptographically verified: the app only installs a release that was
signed with your private key. That means there is a **one-time setup** you have
to do by hand — generating the key and telling GitHub about it. After that,
shipping an update is just pushing a tag.

---

## One-time setup

### 1. Generate a signing key pair

On your Mac, in the project folder:

```sh
npm install
npm run tauri signer generate -- -w ~/.tauri/flow-updater.key
```

It prints a **public key** and writes the **private key** to
`~/.tauri/flow-updater.key`. You'll be asked for a password — remember it.

- The **private key** + password sign releases. Keep them secret. Never commit
  them (`*.key` and `.tauri/` are already gitignored).
- The **public key** goes into the app so it can verify updates. It is safe to
  commit.

### 2. Put the public key in the app config

Open `src-tauri/tauri.conf.json` and replace the placeholder under
`plugins.updater.pubkey`:

```jsonc
"updater": {
  "endpoints": [
    "https://github.com/katrinaissa24/brawley-productivity-tool/releases/latest/download/latest.json"
  ],
  "pubkey": "PASTE_THE_PUBLIC_KEY_HERE"
}
```

Paste the whole public-key string the generator printed (it's a single line of
base64). Commit this change.

### 3. Add the private key to GitHub as secrets

The release workflow (`.github/workflows/release.yml`) signs builds in CI, so it
needs the private key. In the GitHub repo:

**Settings → Secrets and variables → Actions → New repository secret**, add two:

| Secret name | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | the contents of `~/.tauri/flow-updater.key` (`cat ~/.tauri/flow-updater.key` and paste it) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you chose in step 1 |

That's it for setup.

---

## Shipping an update

1. Make your changes and merge them to `main`.
2. Bump the version and tag it:

   ```sh
   npm version patch          # 0.1.0 -> 0.1.1 (use minor/major as needed)
   ```

   > `npm version` updates `package.json`. Also bump `version` in
   > `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` to the same number so
   > the app reports the right version — the updater compares these.

3. Push the commit and the tag:

   ```sh
   git push && git push --tags
   ```

Pushing the `v*` tag triggers the **Release** workflow, which builds a signed
universal macOS app, creates a GitHub Release, and uploads:

- `Flow_x.y.z_universal.dmg` — for a fresh manual install
- `Flow_universal.app.tar.gz` + `.sig` — the update bundle
- `latest.json` — the manifest the running app polls

The next time your installed Flow launches (or you hit **Check now**), it sees
the new `latest.json`, prompts you, and updates itself.

---

## Notes & gotchas

- **Building locally with the updater on.** `createUpdaterArtifacts` is enabled,
  so a local `npm run tauri build` also wants the signing key. Export it first:

  ```sh
  export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/flow-updater.key)"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"
  npm run tauri build
  ```

- **Gatekeeper.** These builds are updater-signed but not Apple-notarized, so the
  very first install may need right-click → Open (or **System Settings → Privacy
  & Security → Open Anyway**). Self-updates after that install silently.

- **Lost the private key?** Generate a new pair, update `pubkey` in the config,
  and refresh the GitHub secrets. Apps built with the old public key won't accept
  updates signed by the new key, so users on those builds must reinstall once
  from the `.dmg`.

- **The version must actually increase.** The updater only offers a release whose
  version is greater than what's installed.
