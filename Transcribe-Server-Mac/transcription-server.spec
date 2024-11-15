# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, collect_all

# Collect all data files, binaries, and hiddenimports for 'speechbrain'
speechbrain_datas, speechbrain_binaries, speechbrain_hiddenimports = collect_all('speechbrain')

# Initialize variables if not already defined
hiddenimports = []
datas = []
binaries = []

# Include 'speechbrain' components
hiddenimports += speechbrain_hiddenimports
datas += speechbrain_datas
binaries += speechbrain_binaries

# Include other packages as before
hiddenimports += collect_submodules('mlx')
hiddenimports += collect_submodules('mlx_whisper')
hiddenimports += collect_submodules('lightning_fabric')
hiddenimports += collect_submodules('pytorch_lightning')
hiddenimports += collect_submodules('pyannote')
hiddenimports += collect_submodules('torch')
hiddenimports += collect_submodules('torchaudio')
hiddenimports += collect_submodules('transformers')
hiddenimports += collect_submodules('huggingface_hub')

# Collect data files
datas += collect_data_files('mlx')
datas += collect_data_files('mlx_whisper')
datas += collect_data_files('lightning_fabric')
datas += collect_data_files('pytorch_lightning')
datas += collect_data_files('pyannote')
datas += [(os.path.abspath('ffmpeg_bin'), 'ffmpeg_bin')]

# Get the Matplotlib cache directory and add it to datas
from matplotlib import get_cachedir
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
    console=False,
    disable_windowed_traceback=False,
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