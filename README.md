# AutoSubs V2 – Subtitles Made Simple
Create high-quality subtitles effortlessly with **one click**. AutoSubs delivers **fast, accurate, and fully customisable** subtitles in a sleek, intuitive interface.

### 📥 One-Click Installer: [Windows ](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Win-setup.exe) ✨ [MacOS (ARM)](https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg)
**💡 14,000+ downloads in under 2 months!**

<a href="https://www.buymeacoffee.com/tmoroney"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=tmoroney&button_colour=3562e3&font_colour=ffffff&font_family=Poppins&outline_colour=ffffff&coffee_colour=FFDD00" /></a>

## 🚀 Key Features
**⚡ Blazing Fast:** Lightning-fast transcription in nearly any language.

**🗣️ Speaker Diarization:** Detect different speakers & color-code subtitles automatically.

**🌏 English Translation:** Convert subtitles to English (more languages coming soon).

**🎨 Modern UI:** A clean, user-friendly designed for creators.

**📦 One-Click Installer:** One-click installer for Mac (ARM) & Windows. (Linux & Intel Mac support coming soon!)

Generate Subtitles & Label Speakers |  Advanced Settings
:-------------------------:|:-------------------------:
<img width="550" alt="Transcription Page" src="https://github.com/user-attachments/assets/59803d26-cda0-4b44-ac54-3eb46438f7a6"> | <img width="600" alt="Advanced Settings" src="https://github.com/user-attachments/assets/d136f300-89be-4f0c-a330-57372fd71041">

## Setup:
### 1. Download & Install
- Click the download link for your operating system above.
- Open the installer and follow the on-screen instructions.

### 2. Launch AutoSubs in DaVinci Resolve
- Open **DaVinci Resolve**.
- In the top menu, go to **Workspace → Scripts → AutoSubs V2**.

You’re all set! 🚀 AutoSubs V2 is now ready to generate subtitles effortlessly.

Watch this helpful tutorial to get you started with AutoSubs: [Watch Now](https://www.youtube.com/watch?v=U36KbpoAPxM)

# AutoSubs V1 (Legacy Version)
If your OS isn’t supported by **AutoSubs V2**, you can try **AutoSubs V1** using manual installation. However, this requires basic experience with Python and the terminal, and this version is no longer supported so any errors you will have to fix yourself.
>[!Warning]
If using the **free version**, you must be on **Resolve 19.0.3 or earlier**, as Blackmagic removed the built-in UI manager in v19.1.

### [AutoSubs V1 Install Guide](https://github.com/tmoroney/auto-subs/blob/a695224b66e46c62dc716f5336582795e7174f17/V1_README.md)

# Contribute to AutoSubs
If you would like to contribute to the development of AutoSubs, follow the steps below.
## Set Up for Development
1. Clone this repository to whatever directory you wish.
2. Navigate to this directory within the repo: `../AutoSubs-App/src-tauri/resources`
3. Copy the `AutoSubs V2.lua` file.
4. Navigate to one of the directories below and paste the `AutoSubs V2.lua` file so that Resolve can see it:
  - Windows: `$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility`
  - Mac: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility`
3. Open the `AutoSubs V2.lua` and remove the section below from the code. This code opens the main Tauri application, but we will be starting the Tauri app manually while in development so we want to remove this to stop the Lua server from starting the Tauri app executable on launch.
  ```lua
-- Start AutoSubs app
if os_name == "Windows" then
    -- Windows
    local SW_SHOW = 5 -- Show the window

    -- Call ShellExecuteA from Shell32.dll
    local shell32 = ffi.load("Shell32")
    local result_open = shell32.ShellExecuteA(nil, "open", main_app, nil, nil, SW_SHOW)

    if result_open > 32 then
        print("AutoSubs launched successfully.")
    else
        print("Failed to launch AutoSubs. Error code:", result_open)
        return
    end
else
    -- MacOS
    local result_open = ffi.C.system(command_open)

    if result_open == 0 then
        print("AutoSubs launched successfully.")
    else
        print("Failed to launch AutoSubs. Error code:", result_open)
        return
    end
end
```

