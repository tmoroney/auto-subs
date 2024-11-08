# -*- mode: python ; coding: utf-8 -*-

import os
import sys
import matplotlib
from matplotlib import get_cachedir
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, collect_dynamic_libs

# Collect hidden imports
hiddenimports = collect_submodules('mlx')
hiddenimports += collect_submodules('mlx_whisper')
hiddenimports += collect_submodules('lightning_fabric')
hiddenimports += collect_submodules('pytorch_lightning')

# Include tiktoken and its extensions
hiddenimports += collect_submodules('tiktoken')
binaries = collect_dynamic_libs('tiktoken')

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
    # Add any other modules you know are unnecessary
]

# Define the fixed runtime temporary directory
fixed_runtime_dir = os.path.join(os.path.expanduser('~'), '.autosubs-app', 'runtime_temp')

# Ensure the directory exists
os.makedirs(fixed_runtime_dir, exist_ok=True)

a = Analysis(
    ['transcription-server.py'],
    pathex=[],  # Add your project paths if necessary
    binaries=binaries,  # Include collected dynamic libraries
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],  # Add custom hook paths if you have any
    runtime_hooks=[],  # Add runtime hooks if required
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None, optimize=2)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='Transcription-Server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=fixed_runtime_dir,
    console=True,
)