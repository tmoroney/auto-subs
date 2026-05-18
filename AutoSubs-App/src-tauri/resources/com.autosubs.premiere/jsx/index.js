(function (thisObj) {// ----- EXTENDSCRIPT INCLUDES ------ //"object"!=typeof JSON&&(JSON={}),function(){"use strict";var rx_one=/^[\],:{}\s]*$/,rx_two=/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,rx_three=/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,rx_four=/(?:^|:|,)(?:\s*\[)+/g,rx_escapable=/[\\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,rx_dangerous=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta,rep;function f(t){return t<10?"0"+t:t}function this_value(){return this.valueOf()}function quote(t){return rx_escapable.lastIndex=0,rx_escapable.test(t)?'"'+t.replace(rx_escapable,function(t){var e=meta[t];return"string"==typeof e?e:"\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+t+'"'}function str(t,e){var r,n,o,u,f,a=gap,i=e[t];switch(i&&"object"==typeof i&&"function"==typeof i.toJSON&&(i=i.toJSON(t)),"function"==typeof rep&&(i=rep.call(e,t,i)),typeof i){case"string":return quote(i);case"number":return isFinite(i)?String(i):"null";case"boolean":case"null":return String(i);case"object":if(!i)return"null";if(gap+=indent,f=[],"[object Array]"===Object.prototype.toString.apply(i)){for(u=i.length,r=0;r<u;r+=1)f[r]=str(r,i)||"null";return o=0===f.length?"[]":gap?"[\n"+gap+f.join(",\n"+gap)+"\n"+a+"]":"["+f.join(",")+"]",gap=a,o}if(rep&&"object"==typeof rep)for(u=rep.length,r=0;r<u;r+=1)"string"==typeof rep[r]&&(o=str(n=rep[r],i))&&f.push(quote(n)+(gap?": ":":")+o);else for(n in i)Object.prototype.hasOwnProperty.call(i,n)&&(o=str(n,i))&&f.push(quote(n)+(gap?": ":":")+o);return o=0===f.length?"{}":gap?"{\n"+gap+f.join(",\n"+gap)+"\n"+a+"}":"{"+f.join(",")+"}",gap=a,o}}"function"!=typeof Date.prototype.toJSON&&(Date.prototype.toJSON=function(){return isFinite(this.valueOf())?this.getUTCFullYear()+"-"+f(this.getUTCMonth()+1)+"-"+f(this.getUTCDate())+"T"+f(this.getUTCHours())+":"+f(this.getUTCMinutes())+":"+f(this.getUTCSeconds())+"Z":null},Boolean.prototype.toJSON=this_value,Number.prototype.toJSON=this_value,String.prototype.toJSON=this_value),"function"!=typeof JSON.stringify&&(meta={"\b":"\\b","\t":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},JSON.stringify=function(t,e,r){var n;if(gap="",indent="","number"==typeof r)for(n=0;n<r;n+=1)indent+=" ";else"string"==typeof r&&(indent=r);if(rep=e,e&&"function"!=typeof e&&("object"!=typeof e||"number"!=typeof e.length))throw new Error("JSON.stringify");return str("",{"":t})}),"function"!=typeof JSON.parse&&(JSON.parse=function(text,reviver){var j;function walk(t,e){var r,n,o=t[e];if(o&&"object"==typeof o)for(r in o)Object.prototype.hasOwnProperty.call(o,r)&&(void 0!==(n=walk(o,r))?o[r]=n:delete o[r]);return reviver.call(t,e,o)}if(text=String(text),rx_dangerous.lastIndex=0,rx_dangerous.test(text)&&(text=text.replace(rx_dangerous,function(t){return"\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)})),rx_one.test(text.replace(rx_two,"@").replace(rx_three,"]").replace(rx_four,"")))return j=eval("("+text+")"),"function"==typeof reviver?walk({"":j},""):j;throw new SyntaxError("JSON.parse")})}();// ---------------------------------- //// ----- EXTENDSCRIPT PONYFILLS -----function __objectFreeze(obj) { return obj; }// ---------------------------------- //var config = {
  id: "com.autosubs.premiere",
  zxp: {
    password: typeof process !== "undefined" && process.env.ZXP_PASSWORD || "password"}};

var ns = config.id;

// ==============================================================================
// SHARED LOGGING UTILITY
// ==============================================================================

function _pad(n) {
  return n < 10 ? "0" + n : String(n);
}

/**
 * Writes a timestamped message to the ExtendScript console.
 * @param prefix  - Short identifier for the host app, e.g. "PPRO" or "AEFT"
 * @param message - The message to log
 */
function logMessage(prefix, message) {
  var now = new Date();
  var timeStr = _pad(now.getHours()) + ":" + _pad(now.getMinutes()) + ":" + _pad(now.getSeconds());
  $.writeln("[AutoSubs " + prefix + " " + timeStr + "] " + message);
}

// ==============================================================================
// UTILS & POLYFILLS
// ==============================================================================

/**
 * Log a message to the ExtendScript console with the PPRO prefix.
 */
var log$1 = function log(message) {
  logMessage("PPRO", message);
};

/**
 * Array.indexOf polyfill for older ExtendScript engines (ES3).
 */
function AK_indexOf(arr, item) {
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
function getPresetFilePath(outputFolder) {
  var separator = outputFolder.indexOf("/") !== -1 ? "/" : "\\";
  var presetName = "WAV_48_kHz_16_bits.epr";
  var scriptFile = new File($.fileName);

  // Strategy 1: Check in the extension root presets folder (dist/cep/presets)
  var rootPresetsFolder = new Folder(scriptFile.parent.parent.fsName + separator + "presets");
  var rootPresetFile = new File(rootPresetsFolder.fsName + separator + presetName);
  if (rootPresetFile.exists) {
    return {
      success: true,
      path: rootPresetFile.fsName
    };
  }

  // Strategy 2: Check in the script directory's presets sub-folder
  var presetsFolder = new Folder(scriptFile.parent.fsName + separator + "presets");
  var presetFile = new File(presetsFolder.fsName + separator + presetName);
  if (presetFile.exists) {
    return {
      success: true,
      path: presetFile.fsName
    };
  }

  // Strategy 3: Check in the same directory as the script
  presetFile = new File(scriptFile.parent.fsName + separator + presetName);
  if (presetFile.exists) {
    return {
      success: true,
      path: presetFile.fsName
    };
  }
  return {
    success: false,
    path: null
  };
}

// ==============================================================================
// SEQUENCE MODULE
// ==============================================================================

/**
 * Gets detailed information about the active sequence.
 */
function getActiveSequenceInfo$1() {
  try {
    if (!app.project || !app.project.activeSequence) {
      return JSON.stringify({
        success: false,
        error: "No active sequence found",
        hasActiveSequence: false
      });
    }
    var sequence = app.project.activeSequence;
    var timebase = parseFloat(sequence.timebase);
    var frameWidth = sequence.frameWidth;
    var frameHeight = sequence.frameHeight;

    // Fallback for resolution via getSettings()
    if (!frameWidth || !frameHeight) {
      try {
        var settings = sequence.getSettings();
        if (settings) {
          frameWidth = settings.videoFrameWidth;
          frameHeight = settings.videoFrameHeight;
        }
      } catch (e) {
        log$1("getSettings() failed: " + e);
      }
    }

    // Prefer the Time object's .seconds accessor when available; fall back to
    // dividing raw ticks by the well-known Premiere tick rate (254 016 000 000).
    var durationSeconds = 0;
    try {
      var endObj = sequence.end;
      if (endObj && typeof endObj.seconds !== "undefined") {
        durationSeconds = parseFloat(endObj.seconds);
      } else {
        var TICKS_PER_SECOND = 254016000000;
        durationSeconds = parseFloat(String(endObj)) / TICKS_PER_SECOND;
      }
    } catch (e) {
      log$1("Error reading sequence duration: " + e);
    }
    var audioTrackInfo = [];
    if (sequence.audioTracks) {
      for (var i = 0; i < sequence.audioTracks.numTracks; i++) {
        var track = sequence.audioTracks[i];
        audioTrackInfo.push({
          index: i + 1,
          name: track.name || "Audio " + (i + 1),
          enabled: true
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
      audioTrackInfo: audioTrackInfo
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: "Error getting sequence info: " + e.toString(),
      hasActiveSequence: false
    });
  }
}

/**
 * Gets the combined time range of all selected clips across video and audio tracks.
 * Returns start/end in seconds relative to the sequence start.
 */
function getSelectedClipsTimeRange$1(sequence) {
  try {
    var earliestStart = Infinity;
    var latestEnd = 0;
    var selectedClipsFound = 0;
    // Use a set-like object (keyed by clip start+end) to deduplicate linked clips
    // that appear on both a video and audio track.
    var seenKeys = {};
    var selectedItems = [];
    log$1("Analyzing selected clips...");

    // Method 1: sequence.getSelection()
    try {
      var sel = sequence.getSelection();
      if (sel && sel.length > 0) {
        for (var si = 0; si < sel.length; si++) {
          selectedItems.push(sel[si]);
        }
        log$1("Got " + selectedItems.length + " clips via getSelection()");
      }
    } catch (selErr) {
      log$1("getSelection() failed: " + selErr.toString());
    }

    // Method 2: Fallback — iterate tracks and check isSelected()
    if (selectedItems.length === 0) {
      log$1("Falling back to per-clip isSelected() check...");
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
              log$1("Error checking video clip selection: " + e2);
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
              log$1("Error checking audio clip selection: " + e3);
            }
          }
        }
      }
      if (selectedItems.length > 0) {
        log$1("Found " + selectedItems.length + " clips via isSelected() fallback");
      }
    }
    if (selectedItems.length === 0) {
      log$1("No clips selected by any method");
      return {
        success: false,
        error: "No clips are currently selected"
      };
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
          log$1("Selected clip: " + clip.name + " (" + startTime + "s to " + endTime + "s)");
        } catch (clipErr) {
          log$1("Error reading clip time: " + clipErr.toString());
        }
      }
    }
    if (selectedClipsFound === 0) {
      return {
        success: false,
        error: "No valid clips in selection"
      };
    }
    log$1("Found " + selectedClipsFound + " unique selected clips");
    log$1("Combined range: " + earliestStart + "s to " + latestEnd + "s");
    return {
      success: true,
      startTime: earliestStart,
      endTime: latestEnd,
      clipCount: selectedClipsFound
    };
  } catch (e) {
    return {
      success: false,
      error: e.toString()
    };
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
function exportSequenceAudio$1(outputFolder, selectedTracksJson, selectedRange, externalPresetPath) {
  var debugInfo = {
    method: "QE_DOM",
    outputFolder: outputFolder,
    selectedRange: selectedRange || "entire",
    externalPresetPath: externalPresetPath
  };
  try {
    log$1("=== EXPORT SEQUENCE AUDIO VIA QE DOM ===");
    if (!app.project || !app.project.activeSequence) {
      return JSON.stringify({
        success: false,
        error: "No active sequence",
        debug: debugInfo
      });
    }
    var sequence = app.project.activeSequence;

    // Parse selected tracks — the parameter is always a JSON string but guard defensively
    var selectedTracks = [];
    if (selectedTracksJson && selectedTracksJson.length > 0) {
      try {
        selectedTracks = JSON.parse(String(selectedTracksJson));
      } catch (e) {
        log$1("Error parsing selectedTracksJson: " + e.toString());
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
        log$1("External preset not found: " + externalPresetPath);
      }
    }
    if (!audioPresetPath) {
      var presetResult = getPresetFilePath(outputFolder);
      audioPresetPath = presetResult.path || "";
    }
    if (!audioPresetPath) {
      return JSON.stringify({
        success: false,
        error: "Audio preset not found",
        debug: debugInfo
      });
    }
    debugInfo.presetPath = audioPresetPath;

    // Verify preset still exists immediately before export
    var preExportCheck = new File(audioPresetPath);
    if (!preExportCheck.exists) {
      log$1("CRITICAL: Preset file missing at export time: " + audioPresetPath);
      return JSON.stringify({
        success: false,
        error: "Preset file missing at export time: " + audioPresetPath,
        debug: debugInfo
      });
    }

    // Access QE DOM for per-track mute/solo control
    app.enableQE();
    var qeSequence = qe.project.getActiveSequence();
    if (!qeSequence) {
      return JSON.stringify({
        success: false,
        error: "QE sequence not available",
        debug: debugInfo
      });
    }

    // Snapshot original track states so we can restore them unconditionally
    var originalStates = [];
    for (var i = 0; i < qeSequence.numAudioTracks; i++) {
      var qeTrack = qeSequence.getAudioTrackAt(i);
      if (qeTrack) {
        var originalState = {
          index: i,
          muted: false,
          solo: false
        };
        if (typeof qeTrack.isMuted === "function") originalState.muted = qeTrack.isMuted();
        if (typeof qeTrack.isSolo === "function") originalState.solo = qeTrack.isSolo();
        originalStates.push(originalState);
      }
    }

    // Track state changes and range changes are restored in the finally block
    var tempInOutSet = false;
    var originalInPoint = null;
    var originalOutPoint = null;
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
        log$1("Using In/Out range for export");
        var inPointSeconds = parseFloat(sequence.getInPoint()) || 0;
        timeOffsetSeconds = inPointSeconds;
      } else if (rangeType === "selected" || rangeType === "selection") {
        log$1("Getting selected clips range...");
        originalInPoint = sequence.getInPoint();
        originalOutPoint = sequence.getOutPoint();
        var selectionRange = getSelectedClipsTimeRange$1(sequence);
        if (selectionRange.success) {
          timeOffsetSeconds = selectionRange.startTime || 0;
          if (typeof selectionRange.startTime === "number" && typeof selectionRange.endTime === "number") {
            var TICKS_PER_SECOND = 254016000000;
            sequence.setInPoint(Math.round(selectionRange.startTime * TICKS_PER_SECOND).toString());
            sequence.setOutPoint(Math.round(selectionRange.endTime * TICKS_PER_SECOND).toString());
          }
          tempInOutSet = true;
          workAreaType = 1;
          log$1("Temporary In/Out set for selection export. Offset: " + timeOffsetSeconds);
        } else {
          log$1("No valid selection — falling back to entire timeline");
          workAreaType = 0;
          timeOffsetSeconds = 0;
        }
      }
      var exportResult = sequence.exportAsMediaDirect(outputPath, audioPresetPath, workAreaType);
      if (exportResult === "No Error" || exportResult === true || exportResult === 0) {
        log$1("Audio exported successfully: " + outputPath);
        return JSON.stringify({
          success: true,
          outputPath: outputPath,
          filename: filename,
          timeOffsetSeconds: timeOffsetSeconds,
          debug: debugInfo
        });
      } else {
        log$1("Export failed with result: " + exportResult);
        return JSON.stringify({
          success: false,
          error: "Export failed: " + exportResult,
          debug: debugInfo
        });
      }
    } finally {
      // Always restore In/Out points if we temporarily changed them
      if (tempInOutSet) {
        log$1("Restoring original sequence In/Out points");
        try {
          if (originalInPoint !== null) sequence.setInPoint(originalInPoint);
          if (originalOutPoint !== null) sequence.setOutPoint(originalOutPoint);
        } catch (e) {
          log$1("Error restoring In/Out points: " + e);
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
            log$1("Error restoring track state at index " + state.index + ": " + e);
          }
        }
      }
    }
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e.toString(),
      debug: debugInfo
    });
  }
}

// ==============================================================================
// SUBTITLES / CAPTIONS MODULE
// ==============================================================================

/**
 * Imports an SRT file into the project and creates a caption track on the active sequence.
 */
function importSRTFile$1(filePath) {
  try {
    if (!app.project) return JSON.stringify({
      success: false,
      error: "No project open"
    });
    if (!app.project.activeSequence) return JSON.stringify({
      success: false,
      error: "No active sequence"
    });
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
        error: "Could not find imported SRT in project bin"
      });
    }

    // 3. Create a caption track on the active sequence
    try {
      var captionResult = sequence.createCaptionTrack(srtItem, 0);
      return JSON.stringify({
        success: true,
        method: "createCaptionTrack",
        captionResult: captionResult !== undefined ? String(captionResult) : "ok",
        itemName: srtItem.name
      });
    } catch (captionErr) {
      // createCaptionTrack is not available in all Premiere versions; fall back to import-only
      log$1("createCaptionTrack failed: " + captionErr.toString());
      return JSON.stringify({
        success: true,
        method: "importOnly",
        warning: "createCaptionTrack failed: " + captionErr.toString(),
        itemName: srtItem.name
      });
    }
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e.toString()
    });
  }
}

/**
 * Moves the playhead of the active sequence to the specified time.
 */
function jumpToTime$1(seconds) {
  try {
    if (!app.project) return JSON.stringify({
      success: false,
      error: "No project open"
    });
    if (!app.project.activeSequence) return JSON.stringify({
      success: false,
      error: "No active sequence"
    });
    var sequence = app.project.activeSequence;
    var TICKS_PER_SECOND = 254016000000;
    var ticks = Math.round(seconds * TICKS_PER_SECOND).toString();
    sequence.setPlayerPosition(ticks);
    return JSON.stringify({
      success: true
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e.toString()
    });
  }
}

var ppro = /*#__PURE__*/__objectFreeze({
  __proto__: null,
  exportSequenceAudio: exportSequenceAudio$1,
  getActiveSequenceInfo: getActiveSequenceInfo$1,
  getSelectedClipsTimeRange: getSelectedClipsTimeRange$1,
  importSRTFile: importSRTFile$1,
  jumpToTime: jumpToTime$1
});

// ==============================================================================
// UTILS
// ==============================================================================

/**
 * Log a message to the ExtendScript console with the AEFT prefix.
 */
var log = function log(message) {
  logMessage("AEFT", message);
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
function getActiveSequenceInfo() {
  try {
    var comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({
        success: false,
        error: "No active composition found",
        hasActiveSequence: false
      });
    }
    var audioTrackInfo = [];
    var audioTrackCount = 0;

    // In AE, layers act as tracks — count layers that have audio enabled
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layers[i];
      if (layer.hasAudio && layer.audioEnabled) {
        audioTrackCount++;
        audioTrackInfo.push({
          index: i,
          name: layer.name || "Layer " + i,
          enabled: true
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
      audioTrackInfo: audioTrackInfo
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: "Error getting comp info: " + e.toString(),
      hasActiveSequence: false
    });
  }
}

/**
 * Gets the combined time range of all selected layers in the active composition.
 * The `_sequence` parameter is accepted but intentionally ignored — AE always
 * uses the global active composition rather than a sequence reference.
 */
function getSelectedClipsTimeRange(_sequence) {
  try {
    var comp = getActiveComp();
    if (!comp) {
      return {
        success: false,
        error: "No active composition"
      };
    }
    var earliestStart = Infinity;
    var latestEnd = 0;
    var selectedClipsFound = 0;
    var selectedLayers = comp.selectedLayers;
    if (!selectedLayers || selectedLayers.length === 0) {
      return {
        success: false,
        error: "No layers are currently selected"
      };
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
      clipCount: selectedClipsFound
    };
  } catch (e) {
    return {
      success: false,
      error: e.toString()
    };
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
function exportSequenceAudio(outputFolder, selectedTracksJson, selectedRange, externalPresetPath) {
  try {
    log("=== EXPORT SEQUENCE AUDIO IN AE ===");
    var activeComp = getActiveComp();
    if (!activeComp) {
      return JSON.stringify({
        success: false,
        error: "No active comp"
      });
    }

    // Verify there is at least one enabled audio layer
    var audioLayers = [];
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
      return JSON.stringify({
        success: false,
        error: "No audio layers in comp"
      });
    }

    // Parse selected tracks (layer indices)
    var selectedIndices = [];
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
      log("WAV output-module template not found — using default. " + "Create a template named 'WAV' in AE for reliable audio-only exports.");
    }
    rqItem.outputModule(1).file = new File(outputPath);

    // Verify the resolved output path ends in .wav; abort early if not.
    var resolvedPath = rqItem.outputModule(1).file.fsName;
    if (!resolvedPath.toLowerCase().match(/\.wav$/)) {
      try {
        rqItem.remove();
      } catch (_) {}
      return JSON.stringify({
        success: false,
        error: "Output module is not WAV (resolved path: " + resolvedPath + "). " + "Configure an output-module template named 'WAV' in After Effects."
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
    var status;
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
      } catch (_) {}

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
        timeOffsetSeconds: timeOffsetSeconds
      });
    } else {
      return JSON.stringify({
        success: false,
        error: "Export failed or was cancelled"
      });
    }
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e.toString()
    });
  }
}

// ==============================================================================
// SUBTITLES / CAPTIONS MODULE
// ==============================================================================

/**
 * Parses a single SRT timecode string ("HH:MM:SS,mmm") into milliseconds.
 * Returns null if the format is unrecognised.
 */
function parseTimecode(timecodeString, separator) {
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
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
  } catch (err) {
    return null;
  }
}

/**
 * Parses raw SRT file content into an array of subtitle objects.
 * Handles both LF and CRLF line endings. Strips HTML tags from text lines.
 */
function parseSrtContent(contentStr) {
  // Normalise CRLF → LF before splitting so the $ anchor and blank-line detection work correctly
  var lines = contentStr.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  var subtitles = [];
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
      var textLines = [];
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
        text: textLines.join("\n")
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
function importSRTFile(filePath) {
  try {
    var comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({
        success: false,
        error: "No active composition"
      });
    }
    var srtFile = new File(filePath);
    if (!srtFile.exists) {
      return JSON.stringify({
        success: false,
        error: "SRT file not found"
      });
    }

    // encoding MUST be set before open() in ExtendScript
    srtFile.encoding = "UTF-8";
    if (!srtFile.open("r")) {
      return JSON.stringify({
        success: false,
        error: "Could not open SRT file for reading"
      });
    }
    var content;
    try {
      content = srtFile.read();
    } finally {
      srtFile.close();
    }
    var subtitles = parseSrtContent(content);
    if (subtitles.length === 0) {
      return JSON.stringify({
        success: false,
        error: "No subtitles found or invalid SRT format"
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
        var textProp = textLayer.property("Source Text");
        var textDoc = textProp.value;
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
      layersCreated: layersCreated
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e.toString()
    });
  }
}

/**
 * Moves the playhead of the active composition to the specified time.
 */
function jumpToTime(seconds) {
  try {
    var comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({
        success: false,
        error: "No active composition"
      });
    }
    comp.time = seconds;
    return JSON.stringify({
      success: true
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e.toString()
    });
  }
}

var aeft = /*#__PURE__*/__objectFreeze({
  __proto__: null,
  exportSequenceAudio: exportSequenceAudio,
  getActiveSequenceInfo: getActiveSequenceInfo,
  getSelectedClipsTimeRange: getSelectedClipsTimeRange,
  importSRTFile: importSRTFile,
  jumpToTime: jumpToTime
});

// https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-class.html?highlight=bridgetalk#appname


var host = typeof $ !== "undefined" ? $ : window;

// A safe way to get the app name since some versions of Adobe Apps break BridgeTalk in various
// places (e.g. After Effects 24-25). In that case we have to do various checks per app to
// determine the app name.
var getAppNameSafely = function getAppNameSafely() {
  var compare = function compare(a, b) {
    return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
  };
  try {
    // 1. Direct check via app.name (common in AE)
    if (typeof app !== "undefined" && app.name) {
      var name = app.name.toLowerCase();
      if (compare(name, "after effects")) return "aftereffects";
      if (compare(name, "premiere")) return "premierepro";
    }

    // 2. BridgeTalk (standard but can be broken in some AE versions)
    if (typeof BridgeTalk !== "undefined" && BridgeTalk.appName) {
      return BridgeTalk.appName;
    }

    // 3. Fallback: app.appName property (legacy AE)
    if (typeof app !== "undefined" && app.appName) {
      var appName = app.appName.toLowerCase();
      if (compare(appName, "after effects")) return "aftereffects";
    }

    // 4. Fallback: app.path property (Premiere)
    if (typeof app !== "undefined" && app.path) {
      var path = app.path.toLowerCase();
      if (compare(path, "premiere")) return "premierepro";
    }
  } catch (e) {
    $.writeln("[AutoSubs] getAppNameSafely error: " + e);
  }
  return "unknown";
};
var detectedApp = getAppNameSafely();
$.writeln("[AutoSubs] Detected host app: " + detectedApp);
switch (detectedApp) {
  case "aftereffects":
  case "aftereffectsbeta":
    $.writeln("[AutoSubs] Mapping AEFT functions...");
    host[ns] = aeft;
    break;
  case "premierepro":
  case "premiereprobeta":
    $.writeln("[AutoSubs] Mapping PPRO functions...");
    host[ns] = ppro;
    break;
  default:
    // CompItem is an AE-native class — its presence in the global scope is a reliable
    // indicator that we are running inside After Effects.  We intentionally avoid checking
    // app.project.activeItem because there may be no open project yet.
    try {
      // `new CompItem()` would throw in Premiere, but `CompItem` itself should be defined in AE.
      if (typeof app !== "undefined" && typeof CompItem === "function") {
        $.writeln("[AutoSubs] Fallback: CompItem class present — assuming After Effects");
        host[ns] = aeft;
      } else {
        $.writeln("[AutoSubs] Could not determine host app — functions may not be available");
      }
    } catch (e) {
      $.writeln("[AutoSubs] Fallback detection error: " + e);
    }
    break;
}

// Scripts represents the intersection of all exported functions.
// At runtime only one host module is ever active; consumers should guard with
// their own app-detection logic before calling host-specific APIs.
})(this);