import { logMessage as _log } from "../lib/log";

// ==============================================================================
// UTILS
// ==============================================================================

/**
 * Log a message to the ExtendScript console with the AEFT prefix.
 */
const log = (message: string): void => {
  _log("AEFT", message);
};

// ==============================================================================
// COMPOSITION MODULE
// ==============================================================================

function getActiveComp() {
  if (app.project.activeItem instanceof CompItem) {
    return app.project.activeItem;
  }
  return null;
}

/**
 * Returns composition metadata in the same shape as ppro's getActiveSequenceInfo,
 * so the Tauri frontend can treat both hosts uniformly.
 */
export function getActiveSequenceInfo(): string {
  try {
    const comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({
        success: false,
        error: "No active composition found",
        hasActiveSequence: false,
      });
    }

    const audioTrackInfo: any[] = [];
    let audioTrackCount = 0;

    // In AE, layers act as tracks — count layers that have audio enabled
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layers[i];
      if (layer.hasAudio && layer.audioEnabled) {
        audioTrackCount++;
        audioTrackInfo.push({
          index: i,
          name: layer.name || "Layer " + i,
          enabled: true,
        });
      }
    }

    return JSON.stringify({
      success: true,
      hasActiveSequence: true,
      name: comp.name,
      id: comp.id.toString(),
      durationSeconds: comp.duration,
      timebase: 1 / comp.frameDuration,
      width: comp.width,
      height: comp.height,
      numAudioTracks: audioTrackCount,
      numVideoTracks: comp.numLayers,
      audioTrackInfo: audioTrackInfo,
    });
  } catch (e: any) {
    return JSON.stringify({
      success: false,
      error: "Error getting comp info: " + e.toString(),
      hasActiveSequence: false,
    });
  }
}

/**
 * Gets the combined time range of all selected layers in the active composition.
 * The `_sequence` parameter is accepted but intentionally ignored — AE always
 * uses the global active composition rather than a sequence reference.
 */
export function getSelectedClipsTimeRange(_sequence: any) {
  try {
    const comp = getActiveComp();
    if (!comp) {
      return { success: false, error: "No active composition" };
    }

    var earliestStart = Infinity;
    var latestEnd = 0;
    var selectedClipsFound = 0;

    var selectedLayers = comp.selectedLayers;
    if (!selectedLayers || selectedLayers.length === 0) {
      return { success: false, error: "No layers are currently selected" };
    }

    for (var i = 0; i < selectedLayers.length; i++) {
      var layer = selectedLayers[i];
      selectedClipsFound++;
      var startTime = layer.inPoint;
      var endTime = layer.outPoint;

      if (startTime < earliestStart) earliestStart = startTime;
      if (endTime > latestEnd) latestEnd = endTime;
    }

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
 * Exports the active composition's audio as a WAV file via the Render Queue.
 *
 * Note: The user must have a render queue output-module template named "WAV"
 * configured in After Effects. If that template is missing, the render will
 * use the current default module settings.
 */
export function exportSequenceAudio(
  outputFolder: string,
  selectedTracksJson: string,
  selectedRange: string,
  externalPresetPath: string
): string {
  try {
    log("=== EXPORT SEQUENCE AUDIO IN AE ===");
    const activeComp = getActiveComp();
    if (!activeComp) {
      return JSON.stringify({ success: false, error: "No active comp" });
    }

    // Verify there is at least one enabled audio layer
    var audioLayers: any[] = [];
    for (var i = 1; i <= activeComp.numLayers; i++) {
      var layer = activeComp.layers[i];
      if (layer.hasAudio) {
        audioLayers.push({
          layer: layer,
          originalAudioState: layer.audioEnabled
        });
      }
    }

    if (audioLayers.length === 0) {
      return JSON.stringify({ success: false, error: "No audio layers in comp" });
    }

    // Parse selected tracks (layer indices)
    var selectedIndices: any[] = [];
    try {
      var parsed = JSON.parse(selectedTracksJson || "[]");
      for (var j = 0; j < parsed.length; j++) {
        selectedIndices.push(Number(parsed[j]));
      }
    } catch (e) {
      log("Error parsing selected tracks: " + e);
    }

    // Temporarily mute layers that are NOT selected
    // If no tracks are selected in UI, we default to all audio layers
    var hasSelection = selectedIndices.length > 0;
    if (hasSelection) {
      for (var k = 0; k < audioLayers.length; k++) {
        var item = audioLayers[k];
        var isSelected = false;
        for (var s = 0; s < selectedIndices.length; s++) {
          if (item.layer.index === selectedIndices[s]) {
            isSelected = true;
            break;
          }
        }
        item.layer.audioEnabled = isSelected;
      }
    }

    var timestamp = new Date().getTime();
    var compName = activeComp.name.replace(/[^a-zA-Z0-9]/g, "_");
    var filename = compName + "_audio_" + timestamp + ".wav";

    var outputFolderObj = new Folder(outputFolder);
    if (!outputFolderObj.exists) {
      outputFolderObj.create();
    }

    // Use "/" universally inside AE — the ExtendScript File object normalises on all platforms
    var outputPath = outputFolderObj.fsName + "/" + filename;

    var renderQueue = app.project.renderQueue;
    renderQueue.items.add(activeComp);
    var lastIndex = renderQueue.numItems;
    var rqItem = renderQueue.item(lastIndex);

    try {
      rqItem.outputModule(1).applyTemplate("WAV");
    } catch (e) {
      log(
        "WAV output-module template not found — using default. " +
        "Create a template named 'WAV' in AE for reliable audio-only exports."
      );
    }
    rqItem.outputModule(1).file = new File(outputPath);

    // Verify the resolved output path ends in .wav; abort early if not.
    var resolvedPath: string = rqItem.outputModule(1).file.fsName;
    if (!resolvedPath.toLowerCase().match(/\.wav$/)) {
      try { rqItem.remove(); } catch (_) {}
      return JSON.stringify({
        success: false,
        error:
          "Output module is not WAV (resolved path: " + resolvedPath + "). " +
          "Configure an output-module template named 'WAV' in After Effects.",
      });
    }

    // Snapshot work area before potentially changing it
    var originalStart = activeComp.workAreaStart;
    var originalDuration = activeComp.workAreaDuration;

    var rangeType = (selectedRange || "entire").toLowerCase();
    var timeOffsetSeconds = 0;

    if (rangeType === "entire") {
      activeComp.workAreaStart = 0;
      activeComp.workAreaDuration = activeComp.duration;
    } else if (rangeType === "inout") {
      // Keep the existing work area, just capture its start as the time offset
      timeOffsetSeconds = activeComp.workAreaStart;
    } else if (rangeType === "selected" || rangeType === "selection") {
      var selectionRange = getSelectedClipsTimeRange(null);
      if (selectionRange.success) {
        timeOffsetSeconds = selectionRange.startTime || 0;
        activeComp.workAreaStart = timeOffsetSeconds;
        activeComp.workAreaDuration = (selectionRange.endTime || 0) - timeOffsetSeconds;
      } else {
        log("No valid selection — exporting entire composition");
        activeComp.workAreaStart = 0;
        activeComp.workAreaDuration = activeComp.duration;
      }
    }

    var status: any;
    try {
      log("Exporting WAV to " + outputPath);
      renderQueue.render();
      status = rqItem.status;
    } finally {
      // 1. RESTORE ORIGINAL AUDIO STATES
      for (var m = 0; m < audioLayers.length; m++) {
        audioLayers[m].layer.audioEnabled = audioLayers[m].originalAudioState;
      }

      // 2. Remove the temporary render queue item
      try {
        rqItem.remove();
      } catch (_) { }

      // 3. Restore work area to its pre-export state
      activeComp.workAreaStart = originalStart;
      activeComp.workAreaDuration = originalDuration;
    }

    if (status === RQItemStatus.DONE) {
      log("Audio exported successfully: " + outputPath);
      return JSON.stringify({
        success: true,
        outputPath: outputPath,
        filename: filename,
        timeOffsetSeconds: timeOffsetSeconds,
      });
    } else {
      return JSON.stringify({ success: false, error: "Export failed or was cancelled" });
    }
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString() });
  }
}

// ==============================================================================
// SUBTITLES / CAPTIONS MODULE
// ==============================================================================

/**
 * Parses a single SRT timecode string ("HH:MM:SS,mmm") into milliseconds.
 * Returns null if the format is unrecognised.
 */
function parseTimecode(timecodeString: string, separator: string): number | null {
  try {
    var timeComponents = timecodeString.split(separator);
    if (timeComponents.length < 2) return null;

    var hhmmss = timeComponents[0].split(":");
    if (hhmmss.length < 3) return null;

    var hours = parseInt(hhmmss[0], 10);
    var minutes = parseInt(hhmmss[1], 10);
    var seconds = parseInt(hhmmss[2], 10);

    var millisecondsStr = timeComponents[1] || "0";
    var milliseconds = parseInt(millisecondsStr, 10);

    // Normalise sub-second precision to milliseconds
    if (millisecondsStr.length === 2) {
      milliseconds *= 10;
    } else if (millisecondsStr.length === 1) {
      milliseconds *= 100;
    }

    return ((hours * 3600) + (minutes * 60) + seconds) * 1000 + milliseconds;
  } catch (err) {
    return null;
  }
}

/**
 * Parses raw SRT file content into an array of subtitle objects.
 * Handles both LF and CRLF line endings. Strips HTML tags from text lines.
 */
function parseSrtContent(contentStr: string) {
  // Normalise CRLF → LF before splitting so the $ anchor and blank-line detection work correctly
  var lines = contentStr.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  var subtitles: any[] = [];
  var totalLines = lines.length;

  // SRT timecode format: HH:MM:SS,mmm --> HH:MM:SS,mmm
  // Hours, minutes, and seconds are always exactly 2 digits; milliseconds are 1–3 digits.
  var timecodePattern = /^\d{2}:\d{2}:\d{2},\d{1,3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{1,3}$/;

  for (var i = 0; i < totalLines; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, ""); // trim
    if (!timecodePattern.test(line)) {
      continue;
    }

    // Split on " --> " allowing variable whitespace around the arrow
    var timecodes = line.split(/\s+-->\s+/);
    var startTime = parseTimecode(timecodes[0], ",");
    var endTime = parseTimecode(timecodes[1], ",");

    if (startTime !== null && endTime !== null) {
      var textLines: string[] = [];
      var lineIndex = i + 1;

      while (lineIndex < totalLines && lines[lineIndex].replace(/^\s+|\s+$/g, "") !== "") {
        // Strip HTML tags (e.g. <i>, <b>, <font color=...>)
        var cleanLine = lines[lineIndex].replace(/<\/?[^>]+(>|$)/g, "");
        textLines.push(cleanLine);
        lineIndex++;
      }

      subtitles.push({
        startTime: startTime,
        endTime: endTime,
        text: textLines.join("\n"),
      });
      i = lineIndex; // advance past the text block
    }
  }
  return subtitles;
}

/**
 * Reads an SRT file and creates one BoxText layer per subtitle entry in the
 * active After Effects composition.
 */
export function importSRTFile(filePath: string): string {
  try {
    const comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({ success: false, error: "No active composition" });
    }

    var srtFile = new File(filePath);
    if (!srtFile.exists) {
      return JSON.stringify({ success: false, error: "SRT file not found" });
    }

    // encoding MUST be set before open() in ExtendScript
    srtFile.encoding = "UTF-8";
    if (!srtFile.open("r")) {
      return JSON.stringify({ success: false, error: "Could not open SRT file for reading" });
    }

    var content: string;
    try {
      content = srtFile.read();
    } finally {
      srtFile.close();
    }

    var subtitles = parseSrtContent(content);
    if (subtitles.length === 0) {
      return JSON.stringify({
        success: false,
        error: "No subtitles found or invalid SRT format",
      });
    }

    app.beginUndoGroup("Import SRT Subtitles");


    var layersCreated = 0;

    try {
      for (var i = 0; i < subtitles.length; i++) {
        var sub = subtitles[i];
        var inSeconds = sub.startTime / 1000;
        var outSeconds = sub.endTime / 1000;

        // Create a Point Text layer (more reliable for absolute centering)
        var textLayer = comp.layers.addText(sub.text);
        var textProp = textLayer.property("Source Text") as Property;
        var textDoc = textProp.value as TextDocument;

        textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
        textDoc.fontSize = Math.floor(comp.height * 0.05); // responsive font size
        textDoc.fillColor = [1, 1, 1]; // white
        textDoc.applyStroke = true;
        textDoc.strokeColor = [0, 0, 0]; // black outline
        textDoc.strokeWidth = 2;
        textProp.setValue(textDoc);

        // Truncate long text for the layer name
        textLayer.name = sub.text.replace(/\n/g, " ").substring(0, 30);

        // Set visibility range
        textLayer.inPoint = inSeconds;
        textLayer.outPoint = outSeconds;

        // --- CALCULATE REAL CENTERING ---
        // sourceRectAtTime returns the exact bounds of the drawn text
        var rect = textLayer.sourceRectAtTime(inSeconds, false);

        // Center the Anchor Point based on the text bounding box
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;
        textLayer.property("Anchor Point").setValue([centerX, centerY]);

        // Position the layer exactly at the center of the composition
        textLayer.property("Position").setValue([comp.width / 2, comp.height / 2]);

        layersCreated++;
      }
    } finally {
      app.endUndoGroup();
    }

    return JSON.stringify({
      success: true,
      method: "addTextLayers",
      itemName: "Created " + layersCreated + " Text Layers",
      layersCreated: layersCreated,
    });
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString() });
  }
}

/**
 * Moves the playhead of the active composition to the specified time.
 */
export function jumpToTime(seconds: number): string {
  try {
    const comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({ success: false, error: "No active composition" });
    }
    comp.time = seconds;
    return JSON.stringify({ success: true });
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.toString() });
  }
}
