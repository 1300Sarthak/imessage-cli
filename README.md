# iMessage Client (2026 Modernization)

A modern, terminal-based iMessage client for macOS, rebuilt for **Apple Silicon (M1/M2/M3)** and **macOS Ventura/Sonoma/Sequoia**.

![iMessage client screenshot](screenshot.png)

## 🚀 What's New

This project is a modernization of a decade-old tool, updated to work in the strict security environment of modern macOS.

- **Architecture**: Dropped deprecated dependencies (`exec`, old `sqlite3`). Now uses native Node.js `child_process` and updated bindings.
- **UI Overhaul**: A complete redesign using `blessed` with a 2-column layout (Chats | Conversation + Input).
- **Native Compatibility**: Runs natively on Apple Silicon (ARM64).
- **Rich Text Support**: Implements a custom heuristic parser to decode the binary `attributedBody` blobs that Apple now uses for message storage, stripping away binary artifacts to reveal readable text.
- **Inline Images**: Supports the **iTerm2 Inline Image Protocol** to render received photos directly in your terminal.

## 🛠️ Challenges & Solutions

### 1. The "Full Disk Access" Wall

Modern macOS (13+) sandboxes user data aggressively. Even `root` cannot read `~/Library/Messages` without explicit permission.

- **Solution**: The app now detects permission failures and guides you to grant **Full Disk Access** to your Terminal/Cursor application.

### 2. The "Binary Blob" Nightmare

Apple moved away from simple text columns to `attributedBody`—a serialized binary blob (NSKeyedArchiver) containing formatting, timestamps, and metadata.

- **Solution**: We reverse-engineered the blob format to surgically extract the text content while stripping out CoreData artifacts (`streamtyped`, `NSObject`, etc.) and system noise.

### 3. Contact Resolution

There is no public Node.js API to resolve phone numbers to names efficiently.

- **Solution**: We directly query the macOS AddressBook SQLite database (`AddressBook-v22.abcddb`) with a smart caching layer to resolve contact names instantly.

## 🔮 Future Goals

- **Global CLI Tool**: Package this as a global binary (`npm install -g imessage-cli`) so you can type `imessage` anywhere.
- **ASCII Image Fallback**: For terminals that don't support the iTerm2 protocol, convert images to high-res ASCII/ANSI art.
- **Interactive Notifications**: System notifications for new messages with "Quick Reply" support.
- **Group Chat Management**: Better support for naming group chats and managing participants.

## 📦 How to Run

### Prerequisites

- Node.js v20+
- **iTerm2** (Recommended for image support) or any modern terminal.

### Installation

1.  Clone the repo:

    ```bash
    git clone https://github.com/CamHenlin/imessageclient.git
    cd imessageclient
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  **Grant Permissions (Crucial step!)**:

    - Open **System Settings** -> **Privacy & Security** -> **Full Disk Access**.
    - Enable **Terminal** (or **iTerm2** / **Cursor**).
    - _Restart your terminal completely._

4.  Run it:
    ```bash
    npm start
    ```

## ⌨️ Controls

- **Up/Down**: Navigate conversation list.
- **Enter**: Select a chat / Send a message.
- **Tab**: Toggle focus between conversation list and input box.
- **Esc**: Unfocus.

---

_Original project by Cam Henlin. Modernized for 2026 by Sarthak._
