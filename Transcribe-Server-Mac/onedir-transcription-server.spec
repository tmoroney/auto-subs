# -*- mode: python ; coding: utf-8 -*-

import os
import sys
import matplotlib
from matplotlib import get_cachedir
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Collect hidden imports
hiddenimports = collect_submodules('mlx')
hiddenimports += collect_submodules('mlx_whisper')
hiddenimports += collect_submodules('lightning_fabric')
hiddenimports += collect_submodules('pytorch_lightning')

# Collect data files
datas = collect_data_files('mlx')
datas += collect_data_files('mlx_whisper')
datas += collect_data_files('lightning_fabric')
datas += collect_data_files('pytorch_lightning')
datas += [(os.path.abspath('ffmpeg_bin'), 'ffmpeg_bin')]

# Get the Matplotlib cache directory and add it to datas
matplotlib_cachedir = get_cachedir()
datas += [(matplotlib_cachedir, 'matplotlib_cachedir')]

# Exclude unnecessary modules to reduce size and startup time
excludes = [
    'tkinter',
    'matplotlib.tests',
    'numpy.tests',
    'scipy.spatial.cKDTree',
    'pyinstaller',
]

a = Analysis(
    ['transcription-server.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,  # Set noarchive=False to include PYZ
    optimize=0,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None, optimize=2)

exe = EXE(
    pyz,   # Pass pyz here
    a.scripts,
    exclude_binaries=True,
    name='transcription-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=True,  # Disable UPX compression
    console=False,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='Transcription-Server',
)