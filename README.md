# Harmonicon V2

![Harmonicon Logo](public/logo.png)

## Professional TTRPG Sound Panel

Harmonicon is a professional-grade TTRPG soundboard crafted for GMs who demand total immersion. Designed with a focus on tactile control and visual elegance, it allows you to orchestrate complex soundscapes with ease.

This project is **Open Source** and built by the community for the community. We believe in providing powerful, accessible tools for storytellers everywhere. All your files remain local, ensuring your campaign data stays private and performant.

---

## 🚀 Installation

Harmonicon is available as a native desktop application for Windows, macOS, and Linux.

### 🪟 Windows
1. Download the latest `.exe` installer from the [Releases](https://github.com/madmobmurphy/harmonicon/releases) page.
2. Run the installer and follow the on-screen instructions.
3. Alternatively, download the **Portable** version to run it without installation.

### 🍎 macOS 
1. Download the repro.
2. Open the extracted repro in the terminal.
3. run "npm install"
4. run "npm run dist"
5. Find the .dmg file in the new created folder "dist_desktop" and install it. 
6. Launch the app from your Applications or Spotlight.

### 🐧 Linux
Harmonicon supports multiple Linux distribution formats:
- **AppImage**: Download the `.AppImage`, make it executable (`chmod +x`), and run it.
- **Debian/Ubuntu**: Download and install the `.deb` package.
- **Fedora/RedHat**: Download and install the `.rpm` package.
- **Arch Linux**: Install via the `.pacman` package.

---

## 🛠️ Building from Source

If you prefer to build the application yourself, follow these steps:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/madmobmurphy/harmonicon.git
   cd harmonicon
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode:**
   ```bash
   npm run dev
   ```

4. **Build the desktop application:**
   ```bash
   npm run dist
   ```
   The installers will be generated in the `dist_desktop` folder.

---

Update Version 2.0.1

Fixed the issue where the Discord game tag feature blocked the app from running when discord was not detected.

Uploaded a Windows .exe

Added new features: 
- Playlist mode for music tracks
- Playtime and status bar for music tracks
- File names now start rolling through the name field to show the full file name
- Import and export settings, uploads and presets

## 📄 License

This project is licensed under the **MIT License**.

---

**Harmonicon** — *Orchestrate your story.*
