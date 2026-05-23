import { logMessage as _log } from "../lib/log";

// ==============================================================================
// UTILS & POLYFILLS
// ==============================================================================

/**
 * Log a message to the ExtendScript console with the PPRO prefix.
 */
const log = (message: string): void => {
  _log("PPRO", message);
};

/**
 * Array.indexOf polyfill for older ExtendScript engines (ES3).
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
 * Resolves the path to the bundled WAV audio preset.
 * Search order:
 *   1. <extension-root>/presets/
 *   2. <script-dir>/presets/
 *   3. Same directory as the script
 */
function getPresetFilePath(outputFolder: string) {
  var separator = outputFolder.indexOf("/") !== -1 ? "/" : "\\";
  var presetName = "WAV_48_kHz_16_bits.epr";
  var scriptFile = new File($.fileName);

  // Strategy 1: Check in the extension root presets folder (dist/cep/presets)
  var rootPresetsFolder = new Folder(scriptFile.parent.parent.fsName + separator + "presets");
  var rootPresetFile = new File(rootPresetsFolder.fsName + separator + presetName);
  if (rootPresetFile.exists) {
    return { success: true, path: rootPresetFile.fsName };
  }

  // Strategy 2: Check in the script directory's presets sub-folder
  var presetsFolder = new Folder(scriptFile.parent.fsName + separator + "presets");
  var presetFile = new File(presetsFolder.fsName + separator + presetName);
  if (presetFile.exists) {
    return { success: true, path: presetFile.fsName };
  }

  // Strategy 3: Check in the same directory as the script
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
 * Gets detailed information about the active sequence.
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

    // Fallback for resolution via getSettings()
    if (!frameWidth || !frameHeight) {
      try {
        const settings = (sequence as any).getSettings();
        if (settings) {
          frameWidth = settings.videoFrameWidth;
          frameHeight = settings.videoFrameHeight;
        }
      } catch (e) {
        log("getSettings() failed: " + e);
      }
    }

    // Prefer the Time object's .seconds accessor when available; fall back to
    // dividing raw ticks by the well-known Premiere tick rate (254 016 000 000).
    let durationSeconds = 0;
    try {
      const endObj = sequence.end as any;
      if (endObj && typeof endObj.seconds !== "undefined") {
        durationSeconds = parseFloat(endObj.seconds);
      } else {
        const TICKS_PER_SECOND = 254016000000;
        durationSeconds = parseFloat(String(endObj)) / TICKS_PER_SECOND;
      }
    } catch (e) {
      log("Error reading sequence duration: " + e);
    }

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
 * Gets the combined time range of all selected clips across video and audio tracks.
 * Returns start/end in seconds relative to the sequence start.
 */
export function getSelectedClipsTimeRange(sequence: any) {
  try {
    var earliestStart = Infinity;
    var latestEnd = 0;
    var selectedClipsFound = 0;
    // Use a set-like object (keyed by clip start+end) to deduplicate linked clips
    // that appear on both a video and audio track.
    var seenKeys: any = {};
    var selectedItems: any[] = [];

    log("Analyzing selected clips...");

    // Method 1: sequence.getSelection()
    try {
      var sel = sequence.getSelection();
      if (sel && sel.length > 0) {
        for (var si = 0; si < sel.length; si++) {
          selectedItems.push(sel[si]);
        }
        log("Got " + selectedItems.length + " clips via getSelection()");
      }
    } catch (selErr: any) {
      log("getSelection() failed: " + selErr.toString());
    }

    // Method 2: Fallback — iterate tracks and check isSelected()
    if (selectedItems.length === 0) {
      log("Falling back to per-clip isSelected() check...");
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
            } catch (e2) {
              log("Error checking video clip selection: " + e2);
            }
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
            } catch (e3) {
              log("Error checking audio clip selection: " + e3);
            }
          }
        }
      }
      if (selectedItems.length > 0) {
        log("Found " + selectedItems.length + " clips via isSelected() fallback");
      }
    }

    if (selectedItems.length === 0) {
      log("No clips selected by any method");
      return { success: false, error: "No clips are currently selected" };
    }

    for (var i = 0; i < selectedItems.length; i++) {
      var clip = selectedItems[i];
      if (clip) {
        try {
          var startTime = parseFloat(clip.start.seconds);
          var endTime = parseFloat(clip.end.seconds);

          // Deduplicate linked clips (same start+end appear on both video and audio track)
          var key = startTime + "_" + endTime;
          if (seenKeys[key]) continue;
          seenKeys[key] = true;

          selectedClipsFound++;
          if (startTime < earliestStart) earliestStart = startTime;
          if (endTime > latestEnd) latestEnd = endTime;

          log("Selected clip: " + clip.name + " (" + startTime + "s to " + endTime + "s)");
        } catch (clipErr: any) {
          log("Error reading clip time: " + clipErr.toString());
        }
      }
    }

    if (selectedClipsFound === 0) {
      return { success: false, error: "No valid clips in selection" };
    }

    log("Found " + selectedClipsFound + " unique selected clips");
    log("Combined range: " + earliestStart + "s to " + latestEnd + "s");

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
 * Exports the active sequence's audio as a WAV file.
 * @param outputFolder       - Folder path where the WAV will be written
 * @param selectedTracksJson - JSON string encoding an array of 1-based track indices to export
 * @param selectedRange      - "entire" | "inout" | "selected"
 * @param externalPresetPath - Optional path to a custom .epr preset file
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
    log("=== EXPORT SEQUENCE AUDIO VIA QE DOM ===");
    if (!app.project || !app.project.activeSequence) {
      return JSON.stringify({ success: false, error: "No active sequence", debug: debugInfo });
    }

    var sequence = app.project.activeSequence;

    // Parse selected tracks — the parameter is always a JSON string but guard defensively
    var selectedTracks: number[] = [];
    if (selectedTracksJson && selectedTracksJson.length > 0) {
      try {
        selectedTracks = JSON.parse(String(selectedTracksJson));
      } catch (e: any) {
        log("Error parsing selectedTracksJson: " + e.toString());
      }
    }

    // Ensure every element is numeric
    for (var v = 0; v < selectedTracks.length; v++) {
      if (typeof selectedTracks[v] !== "number") {
        selectedTracks[v] = Number(selectedTracks[v]);
      }
    }

    // Build output path
    var timestamp = new Date().getTime();
    var sequenceName = sequence.name.replace(/[^a-zA-Z0-9]/g, "_");
    var filename = sequenceName + "_audio_" + timestamp + ".wav";
    var separator = outputFolder.indexOf("/") !== -1 ? "/" : "\\";
    var lastChar = outputFolder.charAt(outputFolder.length - 1);
    var outputPath = outputFolder + (lastChar === separator ? "" : separator) + filename;
    debugInfo.outputPath = outputPath;

    // Resolve preset
    var audioPresetPath = "";
    if (externalPresetPath) {
      var eprFile = new File(externalPresetPath);
      if (eprFile.exists) {
        audioPresetPath = eprFile.fsName;
      } else {
        log("External preset not found: " + externalPresetPath);
      }
    }
    if (!audioPresetPath) {
      var presetResult = getPresetFilePath(outputFolder);
      audioPresetPath = presetResult.path || "";
    }
    if (!audioPresetPath) {
      return JSON.stringify({ success: false, error: "Audio preset not found", debug: debugInfo });
    }
    debugInfo.presetPath = audioPresetPath;

    // Verify preset still exists immediately before export
    var preExportCheck = new File(audioPresetPath);
    if (!preExportCheck.exists) {
      log("CRITICAL: Preset file missing at export time: " + audioPresetPath);
      return JSON.stringify({
        success: false,
        error: "Preset file missing at export time: " + audioPresetPath,
        debug: debugInfo,
      });
    }

    // Access QE DOM for per-track mute/solo control
    app.enableQE();
    var qeSequence = (qe.project as any).getActiveSequence();
    if (!qeSequence) {
      return JSON.stringify({ success: false, error: "QE sequence not available", debug: debugInfo });
    }

    // Snapshot original track states so we can restore them unconditionally
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

    // Track state changes and range changes are restored in the finally block
    var tempInOutSet = false;
    var originalInPoint: any = null;
    var originalOutPoint: any = null;

    try {
      // Apply selective track control when a subset is requested
      if (selectedTracks.length > 0) {
        // Determine which API is available by checking the first track
        var firstQeTrack = qeSequence.getAudioTrackAt(0);
        var hasSolo = firstQeTrack && typeof firstQeTrack.setSolo === "function";
        var hasMute = firstQeTrack && typeof firstQeTrack.setMute === "function";

        for (var j = 0; j < qeSequence.numAudioTracks; j++) {
          var qeTrack2 = qeSequence.getAudioTrackAt(j);
          if (!qeTrack2) continue;
          var shouldExport = AK_indexOf(selectedTracks, j + 1) !== -1;
          if (hasSolo) {
            qeTrack2.setSolo(shouldExport);
          } else if (hasMute) {
            qeTrack2.setMute(!shouldExport);
          }
        }
      }

      // Determine export range
      var workAreaType = 0; // 0 = entire sequence
      var timeOffsetSeconds = 0;
      var rangeType = (selectedRange || "entire").toLowerCase();

      if (rangeType === "inout") {
        workAreaType = 1;
        log("Using In/Out range for export");
        var inPointSeconds = parseFloat(sequence.getInPoint()) || 0;
        timeOffsetSeconds = inPointSeconds;
      } else if (rangeType === "selected" || rangeType === "selection") {
        log("Getting selected clips range...");
        originalInPoint = sequence.getInPoint();
        originalOutPoint = sequence.getOutPoint();

        var selectionRange = getSelectedClipsTimeRange(sequence);
        if (selectionRange.success) {
          timeOffsetSeconds = selectionRange.startTime || 0;
          if (
            typeof selectionRange.startTime === "number" &&
            typeof selectionRange.endTime === "number"
          ) {
            var TICKS_PER_SECOND = 254016000000;
            sequence.setInPoint(
              Math.round(selectionRange.startTime * TICKS_PER_SECOND).toString()
            );
            sequence.setOutPoint(
              Math.round(selectionRange.endTime * TICKS_PER_SECOND).toString()
            );
          }
          tempInOutSet = true;
          workAreaType = 1;
          log("Temporary In/Out set for selection export. Offset: " + timeOffsetSeconds);
        } else {
          log("No valid selection — falling back to entire timeline");
          workAreaType = 0;
          timeOffsetSeconds = 0;
        }
      }

      var exportResult = sequence.exportAsMediaDirect(outputPath, audioPresetPath, workAreaType);

      if (exportResult === "No Error" || exportResult === true || exportResult === 0) {
        log("Audio exported successfully: " + outputPath);
        return JSON.stringify({
          success: true,
          outputPath: outputPath,
          filename: filename,
          timeOffsetSeconds: timeOffsetSeconds,
          debug: debugInfo,
        });
      } else {
        log("Export failed with result: " + exportResult);
        return JSON.stringify({
          success: false,
          error: "Export failed: " + exportResult,
          debug: debugInfo,
        });
      }
    } finally {
      // Always restore In/Out points if we temporarily changed them
      if (tempInOutSet) {
        log("Restoring original sequence In/Out points");
        try {
          if (originalInPoint !== null) sequence.setInPoint(originalInPoint);
          if (originalOutPoint !== null) sequence.setOutPoint(originalOutPoint);
        } catch (e) {
          log("Error restoring In/Out points: " + e);
        }
      }

      // Always restore track mute/solo states
      for (var k = 0; k < originalStates.length; k++) {
        var state = originalStates[k];
        var qeTrackRestore = qeSequence.getAudioTrackAt(state.index);
        if (qeTrackRestore) {
          try {
            if (typeof qeTrackRestore.setSolo === "function") qeTrackRestore.setSolo(state.solo);
            if (typeof qeTrackRestore.setMute === "function") qeTrackRestore.setMute(state.muted);
          } catch (e) {
            log("Error restoring track state at index " + state.index + ": " + e);
          }
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
 * Imports an SRT file into the project and creates a caption track on the active sequence.
 */
export function importSRTFile(filePath: string): string {
  try {
    if (!app.project) return JSON.stringify({ success: false, error: "No project open" });
    if (!app.project.activeSequence)
      return JSON.stringify({ success: false, error: "No active sequence" });

    var sequence = app.project.activeSequence;
    var rootItem = app.project.rootItem;
    var childCountBefore = rootItem.children.numItems;

    // 1. Import the SRT file into the project bin
    app.project.importFiles([filePath], true, rootItem, false);

    // 2. Find the newly imported project item
    var srtItem = null;
    var childCountAfter = rootItem.children.numItems;

    if (childCountAfter > childCountBefore) {
      // A new item was added — it is the last child
      srtItem = rootItem.children[childCountAfter - 1];
    } else {
      // File may already have been in the project — search by name
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
      return JSON.stringify({
        success: false,
        error: "Could not find imported SRT in project bin",
      });
    }

    // 3. Create a caption track on the active sequence
    try {
      var captionResult = (sequence as any).createCaptionTrack(srtItem, 0);
      return JSON.stringify({
        success: true,
        method: "createCaptionTrack",
        captionResult: captionResult !== undefined ? String(captionResult) : "ok",
        itemName: srtItem.name,
      });
    } catch (captionErr: any) {
      // createCaptionTrack is not available in all Premiere versions; fall back to import-only
      log("createCaptionTrack failed: " + captionErr.toString());
      return JSON.stringify({
        success: true,
        method: "importOnly",
        warning: "createCaptionTrack failed: " + captionErr.toString(),
        itemName: srtItem.name,
      });
    }
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString() });
  }
}

/**
 * Moves the playhead of the active sequence to the specified time.
 */
export function jumpToTime(seconds: number): string {
  try {
    if (!app.project) return JSON.stringify({ success: false, error: "No project open" });
    if (!app.project.activeSequence)
      return JSON.stringify({ success: false, error: "No active sequence" });

    var sequence = app.project.activeSequence;
    var TICKS_PER_SECOND = 254016000000;
    var ticks = Math.round(seconds * TICKS_PER_SECOND).toString();
    sequence.setPlayerPosition(ticks);

    return JSON.stringify({ success: true });
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString() });
  }
}