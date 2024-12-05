# -*- mode: python ; coding: utf-8 -*-

# Exclude unnecessary modules to reduce size and startup time
excludes = [
    # Development tools
    'jupyter', 'IPython', 'notebook', 'pytest',

    # GUI-related modules
    'tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'wx', 'pyglet', 'pycairo', 'pygobject', 'pyopengl',

    # Scientific libraries and test suites
    'matplotlib.tests', 'numpy.tests', 'scipy.spatial.cKDTree', 'scipy.tests',

    # Unused data and legacy components
    'torchvision',

    # Large/unused packages
    'cv2', 'Pillow', 'geopy',

    # PyInstaller-related
    'pyinstaller', 'PyInstaller.utils', 'PyInstaller.compat',

    # Common third-party libraries
    'sqlalchemy', 'psycopg2', 'pymysql', 'redis', 'celery', 'rq',
]

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, collect_all
import certifi

# Initialize variables if not already defined
hiddenimports = []
datas = []
binaries = []

# Collect all data files, binaries, and hiddenimports for 'speechbrain'
speechbrain_datas, speechbrain_binaries, speechbrain_hiddenimports = collect_all('speechbrain')

# Include 'speechbrain' components
hiddenimports += speechbrain_hiddenimports
datas += speechbrain_datas
binaries += speechbrain_binaries

# Include other packages as before
import platform

if platform.system() == 'Windows':
    hiddenimports += collect_submodules('faster_whisper')
    datas += collect_data_files('faster_whisper')
    version_file = 'version-win.txt'
    plist = None
    ffmpeg_dir = 'ffmpeg_bin_win'
else:
    hiddenimports += collect_submodules('mlx')
    hiddenimports += collect_submodules('mlx_whisper') 
    datas += collect_data_files('mlx')
    datas += collect_data_files('mlx_whisper')
    excludes.append('openai-whisper')
    version_file = None
    plist = 'version-mac.plist'
    ffmpeg_dir = 'ffmpeg_bin_mac'

# Include other packages
hiddenimports += collect_submodules('stable_whisper')
hiddenimports += collect_submodules('pytorch_lightning')
hiddenimports += collect_submodules('pyannote')
hiddenimports += collect_submodules('torch')
hiddenimports += collect_submodules('torchaudio')
hiddenimports += collect_submodules('transformers')
hiddenimports += collect_submodules('huggingface_hub')

# Collect other data files
datas += collect_data_files('pytorch_lightning')
datas += collect_data_files('lightning_fabric')
datas += collect_data_files('pyannote')
datas += [(os.path.abspath(ffmpeg_dir), ffmpeg_dir)]

# Add certifi certificate bundle
certifi_data = [(certifi.where(), "certifi")]
datas += certifi_data

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=binaries,   # Include collected binaries
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,     # Include PYZ
    optimize=0,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None, optimize=2)

exe = EXE(
    pyz,
    a.scripts,
    exclude_binaries=True,    # Exclude binaries from EXE
    name='transcription-server',  # Use consistent naming
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,              # Set strip to False for debugging
    upx=False,                # Disable UPX compression
    console=True,
    disable_windowed_traceback=False,
    version=version_file,     # Add version file for Windows (None for macOS)
    info_plist=plist          # Add version file for macOS (None for Windows)
)

coll = COLLECT(
    exe,
    a.binaries,               # Include binaries here
    a.zipfiles,
    a.datas,                  # Include data files
    strip=False,
    upx=False,
    upx_exclude=[],
    name='Transcription-Server',  # Use consistent naming
)