console.log("content script running");

var recorder = null;

function onAccessApproved(stream) {
  recorder = new MediaRecorder(stream, {
    videoBitsPerSecond: 5000000,
    ignoreMutedMedia: true,
    mimeType: "video/webm;codecs=h264,vp9,opus",
  });

  recorder.start();

  recorder.onstop = function () {
    stream.getTracks().forEach(function (track) {
      if (track.readyState === "live") {
        track.stop();
      }
    });
  };

  recorder.ondataavailable = function (event) {
    let recordedData = event.data;
    let url = URL.createObjectURL(recordedData);
    // Get the current tab's title
    chrome.runtime.sendMessage({ action: "get_tab_title" }, (response) => {
      if (response && response.tabTitle) {
        let tabTitle = response.tabTitle;
        // Clean the tab title to make it a valid file name
        let cleanedTitle = tabTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();

        let a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `${cleanedTitle}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        chrome.runtime.sendMessage({ action: "save_name", saveName: a.download });
      } else {
        console.error("Failed to get tab title");
        let a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = "screen-recording.mp4";
        document.body.append(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        chrome.runtime.sendMessage({ action: "save_name", saveName: a.download });
      }
    });
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "recording_request") {
    console.log("recording requested");
    sendResponse(`seen: ${message.action}`);

    navigator.mediaDevices
      .getDisplayMedia({
        audio: true,
        video: true,
      })
      .then((stream) => {
        onAccessApproved(stream);
      });
  }

  if (message.action === "stop_recording") {
    console.log("Stop recording");
    sendResponse(`seen: ${message.action}`);

    if (!recorder) {
      return console.log("no recording");
    } else {
      recorder.stop();
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  console.log(`Command: ${command}`);
  console.log(bool(command === "open-screen-captue"));
  if (command === "open-screen-captue") {
    console.log("recording requested");
    sendResponse(`seen: ${command}`);

    navigator.mediaDevices
      .getDisplayMedia({
        audio: true,
        video: true,
      })
      .then((stream) => {
        onAccessApproved(stream);
      });
  }

  if (command === "end-screen-captue") {
    console.log("Stop recording");
    sendResponse(`seen: ${command}`);

    if (!recorder) {
      return console.log("no recording");
    } else {
      recorder.stop();
    }
  }
});
