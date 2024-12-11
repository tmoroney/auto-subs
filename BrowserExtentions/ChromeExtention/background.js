// Create context menu items for images and videos
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendMediaToApi",
    title: "Send URL to Local API",
    contexts: ["image", "video"], // Show menu on right-clicking images or videos
  });
});
function makenotifications(title, message) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: "images/icon-128x128.png",
      title: title,
      message: message,
      priority: 2,
    },
    (notificationId) => {
      // Clear the notification after 3 seconds
      setTimeout(() => {
        chrome.notifications.clear(notificationId);
      }, 3000);
    }
  );
}



chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "complete") {
      chrome.scripting
        .executeScript({
          target: { tabId },
          files: ["./content.js"],
        })
        .then(() => {
          console.log("content script injected");
        })
        .catch((err) => console.log(err, "error injecting script"));
    }
  });
  
// Handle the context menu click
chrome.contextMenus.onClicked.addListener((info) => {
  console.log(info);
  if (info.menuItemId === "sendMediaToApi" && info.srcUrl) {
    const mediaUrl = info.srcUrl; // URL of the image or video
    sendStringToApi('save_image',mediaUrl).then((result) => {
      if (result != "true") {
        console.log(result);
        const title = "Failed To send, check if localhost is running";
        const message =
          "Failed to send media URL. Please check if the local API is running.";
        makenotifications(title, message);
      }
    });
  }
});

chrome.commands.onCommand.addListener((command) => {
  console.log(`Command: ${command}`);
  if (command === "open-screen-captue") {
    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const currentTab = tabs[0];
        console.log("Current Tab:", currentTab);

        // Perform any action with the current tab
        // For example, you can send a message to the content script
        chrome.tabs.sendMessage(
          currentTab.id,
          { action: "recording_request" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending message:",
                chrome.runtime.lastError.message
              );
              const title = "Screen Recorder Error";
              const message =
                "Failed to start screen recording. Please refresh the page, or go to a different tab to start capture.";
              makenotifications(title, message);
            } else {
              console.log("Response from content script:", response);
              if (response === undefined) {
                const title = "cannot start capture on base chrome pages";
                const message =
                  "Failed to start screen recording. Please or go to a different tab or page to start capture.";
                makenotifications(title, message);
              }
            }
          }
        );

        chrome.action.openPopup();
        console.log("Popup opened");
      } else {
        console.error("No active tab found");
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "get_tab_title") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        sendResponse({ tabTitle: tabs[0].title });
      } else {
        sendResponse({ tabTitle: null });
      }
    });
    return true; // Keep the message channel open for sendResponse
    //the file save name to send to the backend. 
  } else if (message.action === "save_name") {
    sendStringToApi('save_video',message.saveName).then((result) => {
      if (result != "true") {
        console.log(result);
        const title = "Failed To send filename, check if localhost is running";
        const message =
          "Failed to send filename. Please check if the local API is running.";
        makenotifications(title, message);
      }
    });
  }
});

function sendStringToApi(apiPath,stringSent) {
  const apiUrl = `http://localhost:55000/${apiPath}/`; // Replace with your local API endpoint
  console.log("Sending stringSent to API:", apiUrl);
  return fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ releventString: stringSent }),
  })
    .then((response) => {
      if (response.ok) {
        console.log("stringSent sent successfully!");
        return "true";
      } else {
        console.error("Failed to send stringSent:", response.status);
        return response.status;
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      return error;
    });
}
