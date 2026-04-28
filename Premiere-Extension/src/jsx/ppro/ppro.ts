// ==============================================================================
// UTILS & POLYFILLS
// ==============================================================================

/**
 * Log message to ExtendScript console and potentially to a file
 */
export function logMessage(message: string): void {
  const now = new Date();
  const timeStr = now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
  $.writeln("[AutoSubs " + timeStr + "] " + message);
}

/**
 * String.indexOf polyfill for older ExtendScript engines
 */
function AK_indexOf(arr: any[], item: any): number {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === item) return i;
  }
  return -1;
}

// ==============================================================================
// PRESET MANAGEMENT
// ==============================================================================

/**
 * Helper to get the path to the included audio preset
 */
function getPresetFilePath(outputFolder: string) {
  var separator = outputFolder.indexOf("/") !== -1 ? "/" : "\\";
  var presetName = "WAV_48_kHz_16_bits.epr";

  // Strategy 1: Check in the extension's presets folder
  var scriptFile = new File($.fileName);

  // Strategy 1b: Check in the extension's root presets folder (dist/cep/presets)
  var rootPresetsFolder = new Folder(scriptFile.parent.parent.fsName + separator + "presets");
  var rootPresetFile = new File(rootPresetsFolder.fsName + separator + presetName);
  if (rootPresetFile.exists) {
    return { success: true, path: rootPresetFile.fsName };
  }
  var presetsFolder = new Folder(scriptFile.parent.fsName + separator + "presets");
  var presetFile = new File(presetsFolder.fsName + separator + presetName);

  if (presetFile.exists) {
    return { success: true, path: presetFile.fsName };
  }

  // Strategy 2: Check in the same folder as the script
  presetFile = new File(scriptFile.parent.fsName + separator + presetName);
  if (presetFile.exists) {
    return { success: true, path: presetFile.fsName };
  }

  return { success: false, path: null };
}

// ==============================================================================
// SEQUENCE MODULE
// ==============================================================================

/**
 * Gets detailed information about the active sequence
 */
export function getActiveSequenceInfo(): string {
  try {
    if (!app.project || !app.project.activeSequence) {
      return JSON.stringify({
        success: false,
        error: "No active sequence found",
        hasActiveSequence: false,
      });
    }

    const sequence = app.project.activeSequence;
    const timebase = parseFloat(sequence.timebase);
    let frameWidth = sequence.frameWidth;
    let frameHeight = sequence.frameHeight;

    // Fallback for resolution
    if (!frameWidth || !frameHeight) {
      try {
        const settings = (sequence as any).getSettings();
        if (settings) {
          frameWidth = settings.videoFrameWidth;
          frameHeight = settings.videoFrameHeight;
        }
      } catch (e) { }
    }

    let durationSeconds = 0;
    try {
      const durationTicks = parseFloat(sequence.end);
      durationSeconds = durationTicks / 254016000000;
    } catch (e) { }

    const audioTrackInfo: any[] = [];
    if (sequence.audioTracks) {
      for (let i = 0; i < sequence.audioTracks.numTracks; i++) {
        const track = sequence.audioTracks[i];
        audioTrackInfo.push({
          index: i + 1,
          name: track.name || "Audio " + (i + 1),
          enabled: true,
        });
      }
    }

    return JSON.stringify({
      success: true,
      hasActiveSequence: true,
      name: sequence.name,
      id: sequence.sequenceID,
      durationSeconds: durationSeconds,
      timebase: timebase,
      width: frameWidth || 1920,
      height: frameHeight || 1080,
      numAudioTracks: sequence.audioTracks ? sequence.audioTracks.numTracks : 0,
      numVideoTracks: sequence.videoTracks ? sequence.videoTracks.numTracks : 0,
      audioTrackInfo: audioTrackInfo,
    });
  } catch (e: any) {
    return JSON.stringify({
      success: false,
      error: "Error getting sequence info: " + e.toString(),
      hasActiveSequence: false,
    });
  }
}

/**
 * Gets the time range of selected clips across all tracks
 */
export function getSelectedClipsTimeRange(sequence: any) {
  try {
    var earliestStart = 999999999;
    var latestEnd = 0;
    var selectedClipsFound = 0;
    var selectedItems: any[] = [];

    logMessage("Analyzing selected clips...");

    // Method 1: sequence.getSelection()
    try {
      var sel = sequence.getSelection();
      if (sel && sel.length > 0) {
        for (var si = 0; si < sel.length; si++) {
          selectedItems.push(sel[si]);
        }
        logMessage("Got " + selectedItems.length + " clips via getSelection()");
      }
    } catch (selErr: any) {
      logMessage("getSelection() failed: " + selErr.toString());
    }

    // Method 2: Fallback - iterate tracks and check isSelected()
    if (selectedItems.length === 0) {
      logMessage("Falling back to per-clip isSelected() check...");
      // Video tracks
      for (var vi = 0; vi < sequence.videoTracks.numTracks; vi++) {
        var vTrack = sequence.videoTracks[vi];
        for (var vj = 0; vj < vTrack.clips.numItems; vj++) {
          var vClip = vTrack.clips[vj];
          if (vClip) {
            try {
              if (typeof vClip.isSelected === "function" && vClip.isSelected()) {
                selectedItems.push(vClip);
              }
            } catch (e2) { }
          }
        }
      }
      // Audio tracks
      for (var ai = 0; ai < sequence.audioTracks.numTracks; ai++) {
        var aTrack = sequence.audioTracks[ai];
        for (var aj = 0; aj < aTrack.clips.numItems; aj++) {
          var aClip = aTrack.clips[aj];
          if (aClip) {
            try {
              if (typeof aClip.isSelected === "function" && aClip.isSelected()) {
                selectedItems.push(aClip);
              }
            } catch (e3) { }
          }
        }
      }
      if (selectedItems.length > 0) {
        logMessage("Found " + selectedItems.length + " clips via isSelected() fallback");
      }
    }

    if (selectedItems.length === 0) {
      logMessage("No clips selected by any method");
      return { success: false, error: "No clips are currently selected" };
    }

    for (var i = 0; i < selectedItems.length; i++) {
      var clip = selectedItems[i];
      if (clip) {
        try {
          selectedClipsFound++;
          var startTime = parseFloat(clip.start.seconds);
          var endTime = parseFloat(clip.end.seconds);

          if (startTime < earliestStart) earliestStart = startTime;
          if (endTime > latestEnd) latestEnd = endTime;

          logMessage("Selected clip: " + clip.name + " (" + startTime + "s to " + endTime + "s)");
        } catch (clipErr: any) {
          logMessage("Error reading clip time: " + clipErr.toString());
        }
      }
    }

    if (selectedClipsFound === 0) {
      return { success: false, error: "No valid clips in selection" };
    }

    logMessage("Found " + selectedClipsFound + " selected clips total");
    logMessage("Combined range: " + earliestStart + "s to " + latestEnd + "s");

    return {
      success: true,
      startTime: earliestStart,
      endTime: latestEnd,
      clipCount: selectedClipsFound,
    };
  } catch (e: any) {
    return { success: false, error: e.toString() };
  }
}

// ==============================================================================
// AUDIO EXPORT MODULE
// ==============================================================================

/**
 * Exports sequence audio
 */
export function exportSequenceAudio(
  outputFolder: string,
  selectedTracksJson: string,
  selectedRange: string,
  externalPresetPath: string
): string {
  var debugInfo: any = {
    method: "QE_DOM",
    outputFolder: outputFolder,
    selectedRange: selectedRange || "entire",
    externalPresetPath: externalPresetPath,
  };

  try {
    logMessage("=== EXPORT SEQUENCE AUDIO VIA QE DOM ===");
    if (!app.project || !app.project.activeSequence) {
      return JSON.stringify({ success: false, error: "No active sequence", debug: debugInfo });
    }

    var sequence = app.project.activeSequence;
    var selectedTracks: number[] = [];

    // Parse selected tracks
    if (selectedTracksJson && selectedTracksJson.length > 0) {
      try {
        if (typeof selectedTracksJson === "string") {
          selectedTracks = JSON.parse(selectedTracksJson);
        } else if ((selectedTracksJson as any) instanceof Array || typeof (selectedTracksJson as any).length === 'number') {
          var asArray: any = selectedTracksJson;
          for (var k = 0; k < asArray.length; k++) {
            selectedTracks.push(asArray[k]);
          }
        } else {
          selectedTracks = JSON.parse(String(selectedTracksJson));
        }
      } catch (e: any) {
        logMessage("Error parsing selectedTracksJson: " + e.toString());
      }
    }

    // Ensure all numeric
    for (var v = 0; v < selectedTracks.length; v++) {
      if (typeof selectedTracks[v] !== 'number') {
        selectedTracks[v] = Number(selectedTracks[v]);
      }
    }

    // Filename generation
    var timestamp = new Date().getTime();
    var sequenceName = sequence.name.replace(/[^a-zA-Z0-9]/g, "_");
    var filename = sequenceName + "_audio_" + timestamp + ".wav";
    var separator = outputFolder.indexOf("/") !== -1 ? "/" : "\\";
    var lastChar = outputFolder.charAt(outputFolder.length - 1);
    var outputPath = outputFolder + (lastChar === separator ? "" : separator) + filename;
    debugInfo.outputPath = outputPath;

    // Preset selection
    var audioPresetPath = "";
    if (externalPresetPath) {
      var eprFile = new File(externalPresetPath);
      if (eprFile.exists) audioPresetPath = eprFile.fsName;
      else logMessage("External preset not found: " + externalPresetPath);
    }
    if (!audioPresetPath) {
      var presetResult = getPresetFilePath(outputFolder);
      audioPresetPath = presetResult.path || "";
    }

    if (!audioPresetPath) {
      return JSON.stringify({ success: false, error: "Audio preset not found", debug: debugInfo });
    }
    debugInfo.presetPath = audioPresetPath;

    // Verify preset file exists right before calling export
    var preExportCheck = new File(audioPresetPath);
    if (!preExportCheck.exists) {
      logMessage('CRITICAL: Preset file missing at export time: ' + audioPresetPath);
      return JSON.stringify({
        success: false,
        error: 'Preset file missing at export time: ' + audioPresetPath,
        debug: debugInfo
      });
    }

    // QE DOM for track control
    app.enableQE();
    var qeSequence = (qe.project as any).getActiveSequence();
    if (!qeSequence) {
      return JSON.stringify({ success: false, error: "QE sequence not available", debug: debugInfo });
    }

    // Store original states
    var originalStates: any[] = [];
    for (var i = 0; i < qeSequence.numAudioTracks; i++) {
      var qeTrack = qeSequence.getAudioTrackAt(i);
      if (qeTrack) {
        var originalState = { index: i, muted: false, solo: false };
        if (typeof qeTrack.isMuted === "function") originalState.muted = qeTrack.isMuted();
        if (typeof qeTrack.isSolo === "function") originalState.solo = qeTrack.isSolo();
        originalStates.push(originalState);
      }
    }

    try {
      // Selective track control
      if (selectedTracks.length > 0) {
        for (var j = 0; j < qeSequence.numAudioTracks; j++) {
          var qeTrack2 = qeSequence.getAudioTrackAt(j);
          if (qeTrack2) {
            var shouldExport = AK_indexOf(selectedTracks, j + 1) !== -1;
            if (typeof qeTrack2.setSolo === "function") {
              qeTrack2.setSolo(shouldExport);
            } else if (typeof qeTrack2.setMute === "function") {
              qeTrack2.setMute(!shouldExport);
            }
          }
        }
      }

      // Range handling
      var workAreaType = 0; // Entire sequence
      var tempInOutSet = false;
      var originalInPoint: any = null;
      var originalOutPoint: any = null;
      var timeOffsetSeconds = 0;

      var rangeType = (selectedRange || "entire").toLowerCase();
      if (rangeType === "inout") {
        workAreaType = 1;
        logMessage("Using In/Out range for export");
        var inPointSeconds = parseFloat(sequence.getInPoint()) || 0;
        timeOffsetSeconds = inPointSeconds;
      } else if (rangeType === "selected" || rangeType === "selection") {
        logMessage("Getting selected clips range...");
        originalInPoint = sequence.getInPoint();
        originalOutPoint = sequence.getOutPoint();

        var selectionRange = getSelectedClipsTimeRange(sequence);
        if (selectionRange.success) {
          timeOffsetSeconds = selectionRange.startTime || 0;
          logMessage("Set temporary In/Out for selection export. Offset: " + timeOffsetSeconds);

          if (typeof selectionRange.startTime === 'number' && typeof selectionRange.endTime === 'number') {
            var ticksPerSecond = 254016000000;
            sequence.setInPoint(Math.round(selectionRange.startTime * ticksPerSecond).toString());
            sequence.setOutPoint(Math.round(selectionRange.endTime * ticksPerSecond).toString());
          }

          tempInOutSet = true;
          workAreaType = 1;
        } else {
          logMessage("No valid selected clips found, falling back to entire timeline");
          workAreaType = 0;
          timeOffsetSeconds = 0;
        }
      } else {
        workAreaType = 0;
        timeOffsetSeconds = 0;
      }

      // Export attempt
      var exportResult = sequence.exportAsMediaDirect(outputPath, audioPresetPath, workAreaType);

      // Cleanup In/Out range if it was modified temporarily
      if (tempInOutSet && rangeType === "selected") {
        logMessage("Restoring original sequence In/Out points");
        if (originalInPoint !== null) sequence.setInPoint(originalInPoint);
        if (originalOutPoint !== null) sequence.setOutPoint(originalOutPoint);
      }

      if (exportResult === "No Error" || exportResult === true || exportResult === 0) {
        logMessage("Audio exported successfully: " + outputPath);
        return JSON.stringify({
          success: true,
          outputPath: outputPath,
          filename: filename,
          timeOffsetSeconds: timeOffsetSeconds,
          debug: debugInfo
        });
      } else {
        logMessage("Export failed with result: " + exportResult);
        return JSON.stringify({ success: false, error: "Export failed: " + exportResult, debug: debugInfo });
      }

    } finally {
      // Restore track states
      for (var k = 0; k < originalStates.length; k++) {
        var state = originalStates[k];
        var qeTrackRestore = qeSequence.getAudioTrackAt(state.index);
        if (qeTrackRestore) {
          if (typeof qeTrackRestore.setSolo === "function") qeTrackRestore.setSolo(state.solo);
          if (typeof qeTrackRestore.setMute === "function") qeTrackRestore.setMute(state.muted);
        }
      }
    }

  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString(), debug: debugInfo });
  }
}

// ==============================================================================
// SUBTITLES / CAPTIONS MODULE
// ==============================================================================

/**
 * Imports an SRT file into the project and creates a caption track on the active sequence
 */
export function importSRTFile(filePath: string): string {
  try {
    if (!app.project) return JSON.stringify({ success: false, error: "No project open" });
    if (!app.project.activeSequence) return JSON.stringify({ success: false, error: "No active sequence" });

    var sequence = app.project.activeSequence;
    var rootItem = app.project.rootItem;
    var childCountBefore = rootItem.children.numItems;

    // 1. Import the SRT file into the project bin
    var filePaths = [filePath];
    app.project.importFiles(filePaths, true, rootItem, false);

    // 2. Find the newly imported project item
    var srtItem = null;
    var childCountAfter = rootItem.children.numItems;

    // Check if a new item was added
    if (childCountAfter > childCountBefore) {
      srtItem = rootItem.children[childCountAfter - 1];
    } else {
      // The file may have already existed in the project; search by name
      var srtFile = new File(filePath);
      var srtName = srtFile.name.replace(/\.[^.]+$/, ""); // strip extension
      for (var i = rootItem.children.numItems - 1; i >= 0; i--) {
        var child = rootItem.children[i];
        if (child.name && child.name.indexOf(srtName) !== -1) {
          srtItem = child;
          break;
        }
      }
    }

    if (!srtItem) {
      return JSON.stringify({ success: false, error: "Could not find imported SRT in project bin" });
    }

    // 3. Create a caption track on the active sequence
    try {
      var captionResult = (sequence as any).createCaptionTrack(srtItem, 0);
      return JSON.stringify({
        success: true,
        method: "createCaptionTrack",
        captionResult: captionResult !== undefined ? String(captionResult) : "ok",
        itemName: srtItem.name
      });
    } catch (captionErr: any) {
      // Fallback: if createCaptionTrack is not available, just report the import
      return JSON.stringify({
        success: true,
        method: "importOnly",
        warning: "createCaptionTrack failed: " + captionErr.toString(),
        itemName: srtItem.name
      });
    }
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString() });
  }
}