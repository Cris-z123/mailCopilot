# Deployment Guide: mailCopilot

**Version**: 1.0.0
**Last Updated**: 2026-02-08
**Platform**: Electron 29.4.6 Desktop Application

## Overview

This guide covers packaging, code signing, and distribution of mailCopilot using electron-builder and GitHub Releases.

**Deployment Targets**:
- Windows 10+ (NSIS installer)
- macOS 10.15+ (DMG + ZIP)
- Linux Ubuntu 20.04+ (AppImage + DEB)

## Prerequisites

### Development Environment

```bash
# Required tools
node --version  # v20.x
pnpm --version  # v8.x
git --version   # 2.x+
```

### Build Dependencies

```bash
# Install dependencies
pnpm install

# Rebuild native modules
pnpm run rebuild
```

### Code Signing Certificates

#### Windows (Code Signing Certificate)

```bash
# Required for Windows distribution
# Obtain from: DigiCert, Sectigo, or other CA

# Export certificate to .pfx file
# Store in secure location (never commit to git)

# Set environment variable
export WIN_CSC_LINK=path/to/certificate.pfx
export WIN_CSC_KEY_PASSWORD=certificate-password
```

#### macOS (Developer ID Certificate)

```bash
# Required for macOS distribution
# Obtain from: Apple Developer Account

# Export certificate from Keychain
# Certificate name: "Developer ID Application: Your Name (TEAM_ID)"

# Set environment variable
export CSC_IDENTITY_AUTO_DISCOVERY=false
export APPLE_ID=your-apple-id@example.com
export APPLE_ID_PASSWORD=app-specific-password
export APPLE_TEAM_ID=your-team-id
```

### GitHub Personal Access Token

```bash
# Required for GitHub Releases publishing
# Settings → Developer settings → Personal access tokens → Tokens (classic)

# Scopes: repo (full control)
# Generate token and set as environment variable

export GH_TOKEN=your-github-token
```

## Build Configuration

### electron-builder.yml

Located at project root: `electron-builder.yml`

```yaml
appId: com.mailcopilot.app
productName: mailCopilot
directories:
  buildResources: build
  output: dist

files:
  - electron/**/*
  - dist/main/**/*
  - dist/renderer/**/*
  - dist/shared/**/*
  - package.json

extraMetadata:
  main: electron/main.js

asar: true
asarUnpack:
  - node_modules/better-sqlite3/**

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico

mac:
  target:
    - target: dmg
    - target: zip
  icon: build/icon.icns
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

linux:
  target:
    - target: AppImage
    - target: deb
  icon: build/icon.png
  category: Productivity

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true

publish:
  provider: github
  owner: your-org
  repo: mailcopilot
```

### macOS Entitlements

Create `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

## Build Process

### 1. Prepare Build Environment

```bash
# Set environment variables
export WIN_CSC_LINK=/path/to/certificate.pfx
export WIN_CSC_KEY_PASSWORD=password
export APPLE_ID=your-apple-id@example.com
export APPLE_ID_PASSWORD=app-specific-password
export APPLE_TEAM_ID=your-team-id
export GH_TOKEN=your-github-token
```

### 2. Build Application

```bash
# Build all platforms
pnpm run build

# Or build specific platform
pnpm electron-builder --win
pnpm electron-builder --mac
pnpm electron-builder --linux
```

### 3. Output Artifacts

Build artifacts are created in `dist/` directory:

**Windows**:
- `mailCopilot Setup 1.0.0.exe` (NSIS installer)
- `RELEASES` (update metadata)

**macOS**:
- `mailCopilot-1.0.0.dmg` (DMG installer)
- `mailCopilot-1.0.0-mac.zip` (ZIP archive)
- `mailCopilot-1.0.0.dmg.blockmap` (update metadata)

**Linux**:
- `mailCopilot-1.0.0.AppImage` (AppImage)
- `mailCopilot-1.0.0.deb` (DEB package)

## Code Signing

### Windows Code Signing

```bash
# Automatic via electron-builder if WIN_CSC_LINK set
# Or sign manually after build

signtool sign \
  /f certificate.pfx \
  /p password \
  /tr http://timestamp.digicert.com \
  /td sha256 \
  /fd sha256 \
  dist/mailCopilot\ Setup\ 1.0.0.exe
```

### macOS Code Signing

```bash
# Automatic via electron-builder if APPLE_ID set
# Or sign manually after build

codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAM_ID)" \
  dist/mailCopilot.app

# Verify signature
codesign --verify --verbose dist/mailCopilot.app
```

### Notarization (macOS)

```bash
# Automatic via electron-builder if APPLE_ID_PASSWORD set
# Or notarize manually

xcrun notarytool submit \
  --apple-id "your-apple-id@example.com" \
  --password "app-specific-password" \
  --team-id "your-team-id" \
  --wait \
  dist/mailCopilot-1.0.0.dmg

# Staple notary ticket
xcrun stapler staple dist/mailCopilot-1.0.0.dmg
```

## Distribution via GitHub Releases

### Automated Publishing

```bash
# Build and publish to GitHub Releases
pnpm electron-builder --publish always

# Or publish specific platform
pnpm electron-builder --win --publish always
```

**Process**:
1. Builds application for all platforms
2. Code signs artifacts (if certificates configured)
3. Creates GitHub Release with tag `v1.0.0`
4. Uploads artifacts to Release
5. Generates update metadata (`RELEASES`, `.yml`, `.blockmap`)

### Manual Publishing

```bash
# 1. Build artifacts
pnpm run build

# 2. Create Git tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# 3. Create GitHub Release
gh release create v1.0.0 \
  --title "mailCopilot v1.0.0" \
  --notes "Release notes here" \
  dist/*.exe \
  dist/*.dmg \
  dist/*.zip \
  dist/*.AppImage \
  dist/*.deb
```

### Update Metadata Files

**Windows** (`RELEASES`):
```
mailCopilot Setup 1.0.0.exe https://github.com/your-org/mailcopilot/releases/download/v1.0.0/mailCopilot-Setup-1.0.0.exe 1234567890
```

**macOS** (`mailCopilot-1.0.0-mac.yml`):
```yaml
version: 1.0.0
files:
  - url: mailCopilot-1.0.0-mac.zip
    sha512: abc123...
    size: 123456789
path: mailCopilot-1.0.0-mac.zip
sha512: abc123...
releaseDate: 2026-02-08T00:00:00.000Z
```

**Linux** (`mailCopilot-1.0.0-linux.yml`):
```yaml
version: 1.0.0
files:
  - url: mailCopilot-1.0.0.AppImage
    sha512: abc123...
    size: 123456789
path: mailCopilot-1.0.0.AppImage
sha512: abc123...
releaseDate: 2026-02-08T00:00:00.000Z
```

## Auto-Update Configuration

### electron-updater Setup

**Main Process** (`src/main/app/lifecycle.ts`):

```typescript
import { autoUpdater } from 'electron-updater';

// Configure auto-update
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'your-org',
  repo: 'mailcopilot',
});

// Check for updates on startup (remote mode only)
if (config.mode === 'remote') {
  autoUpdater.checkForUpdatesAndNotify();
}

// Manual update check (local mode)
ipcMain.handle('app:check-update', async () => {
  const result = await autoUpdater.checkForUpdates();
  return result;
});
```

### Update Policy

**Remote Mode** (per FR-038):
- Auto-check on startup
- Notify user when update available
- Download and install on user confirmation

**Local Mode** (per FR-039):
- No auto-check on startup
- Manual trigger via Settings page
- User explicitly opts-in to update check

## Release Checklist

### Pre-Release

- [ ] Update version in `package.json`
- [ ] Update changelog in `CHANGELOG.md`
- [ ] Run full test suite: `pnpm test && pnpm run lint`
- [ ] Test build on all target platforms
- [ ] Verify code signing certificates
- [ ] Test auto-update mechanism
- [ ] Create draft GitHub Release with notes

### Release

- [ ] Set environment variables (certificates, tokens)
- [ ] Build and sign all artifacts: `pnpm run build`
- [ ] Publish to GitHub Releases: `pnpm electron-builder --publish always`
- [ ] Verify artifacts uploaded correctly
- [ ] Test installation from fresh download
- [ ] Test auto-update from previous version

### Post-Release

- [ ] Announce release on communication channels
- [ ] Update documentation with new features
- [ ] Monitor issue tracker for bug reports
- [ ] Prepare next development iteration

## Platform-Specific Notes

### Windows

**Installer Configuration** (`electron-builder.yml`):
```yaml
nsis:
  oneClick: false  # Allow custom installation directory
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  perMachine: false  # Install per-user by default
```

**Antivirus Scanning**:
- Submit builds to VirusTotal for scanning
- Consider Windows Defender SmartScreen reputation
- May require multiple downloads for reputation building

### macOS

**Gatekeeper Requirements**:
- Code signing with Developer ID certificate
- Notarization with Apple notary service
- Hardened runtime enabled
- Proper entitlements for native modules

**Distribution Options**:
1. GitHub Releases (free)
2. Mac App Store (requires $99/year developer account, additional sandboxing)

### Linux

**Package Formats**:

**AppImage** (recommended):
- Universal format across distributions
- No installation required
- Self-contained

**DEB** (Debian/Ubuntu):
- Integrated with apt package manager
- Dependency resolution
- System-wide installation

## Troubleshooting

### Build Failures

**Issue**: `electron-builder` fails with permission errors

```bash
# Fix: Run with elevated permissions
sudo pnpm electron-builder
```

**Issue**: Native module rebuild fails

```bash
# Fix: Rebuild native modules explicitly
pnpm run rebuild
```

### Code Signing Failures

**Issue**: Windows code signing fails

```bash
# Verify certificate
certutil -dump certificate.pfx

# Check timestamp server
# Try alternative: http://timestamp.sectigo.com
```

**Issue**: macOS notarization fails

```bash
# Check notary status
xcrun notarytool history

# Verify app bundle structure
codesign -d --entitlements - dist/mailCopilot.app
```

### Auto-Update Failures

**Issue**: Updates not detected

```bash
# Verify update metadata files
cat RELEASES
cat mailCopilot-1.0.0-mac.yml

# Check GitHub Release assets
gh release view v1.0.0
```

## Security Considerations

### Certificate Storage

- **Never** commit certificates to repository
- Use environment variables for sensitive data
- Store certificates in secure key management system
- Rotate certificates annually

### Token Management

```bash
# Use .env.local for local development (gitignored)
WIN_CSC_LINK=/path/to/cert.pfx
WIN_CSC_KEY_PASSWORD=password
APPLE_ID=your-apple-id@example.com
APPLE_ID_PASSWORD=app-specific-password
GH_TOKEN=your-github-token

# Load in build script
dotenv.config({ path: '.env.local' });
```

### Build Verification

```bash
# Verify code signature
# Windows
signtool verify /pa dist/mailCopilot-Setup-1.0.0.exe

# macOS
codesign --verify --verbose dist/mailCopilot.app
spctl -a -vvv dist/mailCopilot.app

# Linux
gpg --verify mailCopilot-1.0.0.AppImage.sig
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm run build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-build
          path: dist/*
```

## References

- **electron-builder Documentation**: https://www.electron.build/
- **electron-updater Documentation**: https://www.electron.build/auto-update
- **Code Signing (Windows)**: https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools
- **Code Signing (macOS)**: https://developer.apple.com/support/code-signing/
- **GitHub Releases API**: https://docs.github.com/en/rest/releases

---

**Deployment Guide Version**: 1.0.0
**Last Updated**: 2026-02-08
**Maintainer**: mailCopilot Development Team
