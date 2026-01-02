# Modernization Guide: iMessage Client for macOS Ventura (13.x) & Apple Silicon (2026)

This guide outlines the necessary steps to run this codebase on an Apple M1 Pro running macOS 13.5.1 in 2026.

## 1. System Architecture & Prerequisites

### Apple Silicon (ARM64) Support

The codebase uses `sqlite3`, which is a native C++ module. On Apple Silicon, this must be compiled for `arm64`.

- **Requirement**: Ensure `python3` is installed (usually pre-installed or via Xcode command line tools) for `node-gyp` rebuilding.
- **Node.js**: Use a modern LTS version (e.g., Node v20 or v22).

### Permissions (Critical)

macOS has significantly tightened security since this code was written. You must grant specific permissions for the application (or the Terminal running it) to function.

1.  **Full Disk Access (FDA)**:
    - Required to read `~/Library/Messages/chat.db` and `~/Library/Application Support/AddressBook/`.
    - **Action**: Go to `System Settings` -> `Privacy & Security` -> `Full Disk Access`. Add your Terminal app (e.g., Terminal, iTerm2, Cursor).
2.  **Accessibility**:
    - Required for `assistive.AppleScript` and `send_return.AppleScript` to interact with the UI.
    - **Action**: Go to `System Settings` -> `Privacy & Security` -> `Accessibility`. Add your Terminal app.
3.  **Contacts**:
    - The app tries to read the Address Book database directly. You may be prompted to allow access to Contacts.

## 2. Codebase Changes

### Dependency Updates (`package.json`)

- **`sqlite3`**: Update to the latest version to ensure pre-built binaries for Apple Silicon are available, or that it builds correctly.
- **`exec`**: This package is deprecated. Replace with Node.js built-in `child_process`.
- **`imessagemodule`**: Verify compatibility or replace with direct `osascript` calls if the module is unmaintained.

### Logic Updates (`app.js`)

- **OS Detection**: Remove the outdated `OLD_OSX` check (which checks for OS X 10.8). macOS 13 is Darwin 22.
- **Path Handling**: Ensure paths for `chat.db` and `AddressBook` are valid.
- **Modern JavaScript**: Convert `var` to `const`/`let` for better stability.

### AppleScript Updates

- **`assistive.AppleScript`**:
  - "System Preferences" is now **"System Settings"** in macOS 13.
  - The pane "com.apple.preference.security" and anchor "Privacy_Accessibility" references need updating or removal (direct linking to deep settings is harder/changed).
  - Recommendation: Check for UI element access; if failed, prompt user to manually open Settings.

## 3. Database Schema (`chat.db`)

The schema for `chat.db` has remained largely backward compatible for _reading_ messages, but we should verify the columns `room_name`, `is_from_me`, `handle_id` still exist (they typically do).

- **Note**: Dates in Core Data are seconds since 2001-01-01. The application seems to handle sorting correctly, but date display might need adjustment if using raw values.

## 4. Setup Instructions

1.  `npm install`
2.  Grant **Full Disk Access** to your Terminal.
3.  Run `node app.js`.
