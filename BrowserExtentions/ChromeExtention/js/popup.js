startVideoButtondocument.addEventListener("DOMContentLoaded", ()=>{
    const startRecordingButton = document.querySelector("button#start_recording")
    const stopRecordingButton = document.querySelector("button#stop_recording")

    chrome.notifications.getAll(function(notifications) {
        window.close();
    });

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
        console.log(tabs, 'line 7')
        chrome.tabs.sendMessage(tabs[0].id, {action: "recording_request"}, function(response){
            if(!chrome.runtime.lastError){
                console.log(response)
            }else{
                console.log(chrome.runtime.lastError, 'line 15 error')
            }
        })
    })
    
    startRecordingButton.addEventListener("click", ()=>{
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
            chrome.tabs.sendMessage(tabs[0].id, {action: "recording_request"}, function(response){
                if(!chrome.runtime.lastError){
                    console.log(response)
                }else{
                    console.log(chrome.runtime.lastError, 'line 26 error')
                }
            })
        })
    });    

    stopRecordingButton.addEventListener("click", ()=>{
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
            chrome.tabs.sendMessage(tabs[0].id, {action: "stop_recording"}, function(response){
                if(!chrome.runtime.lastError){
                    console.log(response)
                }else{
                    console.log(chrome.runtime.lastError, 'line 38 error')
                }
            })
        })
    })
})