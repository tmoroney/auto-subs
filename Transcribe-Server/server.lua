local socket = require("ljsocket")
local json = require("dkjson")

ui = fusion.UIManager
dispatcher = bmd.UIDispatcher(ui)
local width, height = 300, 100

win = dispatcher:AddWindow({
    ID = 'MyWin',
    WindowTitle = 'AutoSubs Link',
    Geometry = { 100, 200, width, height },
    Spacing = 10,

    ui:VGroup {
        ID = 'root',

        -- Add your GUI elements here:
        ui:Label { ID = 'Message', Text = 'Starting AutoSubs...', Alignment = { AlignHCenter = true, AlignVCenter = true }, Font = ui.Font({ PixelSize = 14 }) },
        ui:Button { ID = 'ExitButton', Text = "Stop AutoSubs Link", Alignment = { AlignRight = true, AlignTop = true }, Checkable = true}
    },
})

-- Add your GUI element based event functions here:
itm = win:GetItems()

-- Show the UI window
win:Show()



-- Server
local port = 5016
local storagePath = fusion:MapPath("Scripts:/Utility/")

-- Set up server socket configuration
local info = socket.find_first_address("*", port)
local server = assert(socket.create(info.family, info.socket_type, info.protocol))

-- Set socket options
server:set_blocking(false)
assert(server:set_option("nodelay", true, "tcp"))
assert(server:set_option("reuseaddr", true))

-- Bind and listen
assert(server:bind(info))
assert(server:listen())

function CreateResponse(body)
    local header =
        "HTTP/1.1 200 OK\r\n" ..
        "Server: ljsocket/0.1\r\n" ..
        "Content-Type: application/json\r\n" ..
        "Content-Length: " .. #body .. "\r\n" ..
        "Connection: close\r\n" ..
        "\r\n"

    local response = header .. body
    return response
end

-- Recursive search for all Text+ templates in the media pool
local templates = {}
function FindAllTemplates(folder)
    -- Get subfolders and recursively process them
    for _, subfolder in ipairs(folder:GetSubFolderList()) do
        FindAllTemplates(subfolder)
    end

    -- Get clips in the current folder and add them to the templates list
    for _, clip in ipairs(folder:GetClipList()) do
        if clip:GetClipProperty()["Type"] == "Fusion Title" then
            local clipName = clip:GetClipProperty()["Clip Name"]
            local newTemplate = {
                label = clipName,
                value = clipName,
            }
            table.insert(templates, newTemplate)
        end
    end
end

-- Get a list of all Text+ templates in the media pool
function GetTemplates()
    local projectManager = resolve:GetProjectManager()
    local project = projectManager:GetCurrentProject()
    local mediaPool = project:GetMediaPool()
    local rootFolder = mediaPool:GetRootFolder()
    templates = {}
    FindAllTemplates(rootFolder)
    return templates
end

function GetTracks()
    local projectManager = resolve:GetProjectManager()
    local project = projectManager:GetCurrentProject()
    local timeline = project:GetCurrentTimeline()
    local trackCount = timeline:GetTrackCount("video")
    local tracks = {}
    for i = 1, trackCount do
        local track = {
            value = tostring(i),
            label = timeline:GetTrackName("video", i)
        }
        table.insert(tracks, track)
    end
    return tracks
end

-- Pause execution for a specified number of seconds (platform-independent)
function sleep(n)
    if FuPLATFORM_WINDOWS then
        -- Windows
        os.execute("ping -n " .. tonumber(n + 1) .. " localhost > NUL")
    else
        -- Unix-based (Linux, macOS)
        os.execute("sleep " .. tonumber(n))
    end
end

-- Convert seconds to frames based on the timeline frame rate
function SecondsToFrames(seconds, frameRate)
    return seconds * frameRate
end

function ExportAudio()
    local projectManager = resolve:GetProjectManager()
    local project = projectManager:GetCurrentProject()
    resolve:ImportRenderPreset(
        "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/AutoSubsV2/render-audio-only.xml")
    project:LoadRenderPreset('render-audio-only')
    project:SetRenderSettings({ TargetDir = storagePath })
    local pid = project:AddRenderJob()
    local renderJobList = project:GetRenderJobList()
    local renderSettings = renderJobList[#renderJobList]

    -- Print render settings k v pairs
    -- for k, v in pairs(renderSettings) do
    --     print(k .. ": " .. tostring(v))
    -- end

    local audioInfo = {
        timeline = project:GetCurrentTimeline():GetUniqueId(),
        path = renderSettings["TargetDir"] .. "/" .. renderSettings["OutputFilename"],
        markIn = renderSettings["MarkIn"],
        markOut = renderSettings["MarkOut"],
    }

    project:StartRendering(pid)
    while project:IsRenderingInProgress() do
        print("Rendering...")
        sleep(0.5) -- Check every 500 milliseconds
    end

    return audioInfo
end

-- Recursively searches to find the template item with the specified ID
function GetTemplateItem(folder, templateName)
    local subfolders = folder:GetSubFolderList()
    for i, subfolder in ipairs(subfolders) do
        local result = GetTemplateItem(subfolder, templateName)
        if result then
            return result
        end
    end
    local clips = folder:GetClipList()
    for i, clip in ipairs(clips) do
        if clip:GetClipProperty()["Clip Name"] == templateName then
            return clip
        end
    end
end

-- Function to read a JSON file
local function read_json_file(file_path)
    local file = assert(io.open(file_path, "r")) -- Open file for reading
    local content = file:read("*a")              -- Read the entire file content
    file:close()                                 -- Close the file

    -- Parse the JSON content
    local data, pos, err = json.decode(content, 1, nil)

    if err then
        print("Error:", err)
        return nil
    end

    return data -- Return the decoded Lua table
end

-- Add subtitles to the timeline using the specified template
function AddSubtitles(filePath, trackIndex, templateName)
    local projectManager = resolve:GetProjectManager()
    local project = projectManager:GetCurrentProject()
    local mediaPool = project:GetMediaPool()
    local timeline = project:GetCurrentTimeline()

    if trackIndex == "" then
        trackIndex = timeline:GetTrackCount("video") + 1
    else
        trackIndex = tonumber(trackIndex)
    end

    local data = read_json_file(filePath)
    local subtitles = data["segments"]

    print("Adding subtitles to timeline")
    resolve:OpenPage("edit")
    local timeline = project:GetCurrentTimeline()
    local timeline_start_frame = timeline:GetStartFrame()
    local frame_rate = timeline:GetSetting("timelineFrameRate")

    local rootFolder = mediaPool:GetRootFolder()

    if templateName == "" then
        FindAllTemplates(rootFolder)
        templateName = templates[1].value
    end

    local text_clip = GetTemplateItem(rootFolder, templateName)

    -- Check template is Comp / TextPlus
    -- if timelineItem:GetFusionCompCount() == 0 then
    --     local errorMsg = "No fusion comp found"
    --     print(errorMsg)
    --     return false
    -- end

    -- -- Check that the TextPlus tool exists in the comp.
    -- local comp = timelineItem:GetFusionCompByIndex(1)
    -- local text_plus_tools = comp:GetToolList(false, "TextPlus")
    -- if #text_plus_tools == 0 then
    --     local errorMsg = "No Text+ tool found in template"
    --     print(errorMsg)
    --     return false
    -- end_frame

    for i, subtitle in ipairs(subtitles) do
        local success, err = pcall(function()
            --print("Adding subtitle: ", subtitle["text"])
            local start_frame = SecondsToFrames(subtitle["start"], frame_rate) + timeline_start_frame
            local end_frame = SecondsToFrames(subtitle["end"], frame_rate) + timeline_start_frame
            local duration = end_frame - start_frame

            local newClip = {}
            newClip["mediaPoolItem"] = text_clip
            newClip["mediaType"] = 1
            newClip["startFrame"] = 0
            newClip["endFrame"] = duration - 1
            newClip["recordFrame"] = start_frame
            newClip["trackIndex"] = trackIndex

            -- print k values for newClip
            -- for k, v in pairs(newClip) do
            --     print(k .. ": " .. tostring(v))
            -- end

            local timelineItem = mediaPool:AppendToTimeline({ newClip })[1]

            -- Skip if text is not compatible
            if timelineItem:GetFusionCompCount() > 0 then
                local comp = timelineItem:GetFusionCompByIndex(1)
                local text_plus_tools = comp:GetToolList(false, "TextPlus")
                text_plus_tools[1]:SetInput("StyledText", subtitle["text"])
                timelineItem:SetClipColor("Green")
            end
        end)

        if not success then
            print("Error adding subtitle:", err)
        end
    end
end

print("AutoSubs server is listening on port: ", port)
itm.Message.Text = "Waiting for Task"
while not itm.ExitButton.Checked do
    -- Server loop to handle client connections
    local client, err = server:accept()
    if client then
        -- Set client to non-blocking
        assert(client:set_blocking(false))
        print("Client connected: ", client)
        -- Try to receive data (example HTTP request)
        local str, err = client:receive()
        if str then
            --print("Received request:", str)
            -- Split the request by the double newline
            local header_body_separator = "\r\n\r\n"
            local _, _, content = string.find(str, header_body_separator .. "(.*)")
            local data, pos, err = json.decode(content, 1, nil)
            local body = json.encode({ message = "Job failed" })
            if data == nil then
                print("Invalid JSON data")
            elseif data.func == "GetTemplates" then
                print("[AutoSubs Server] Retrieving Text+ Templates...")
                itm.Message.Text = "Retrieving Text+ Templates..."
                local templateList = GetTemplates()
                body = json.encode(templateList)
            elseif data.func == "GetTracks" then
                print("[AutoSubs Server] Retrieving Timeline Tracks...")
                itm.Message.Text = "Retrieving Timeline Tracks..."
                local trackList = GetTracks()
                body = json.encode(trackList)
            elseif data.func == "ExportAudio" then
                print("[AutoSubs Server] Exporting audio...")
                itm.Message.Text = "Exporting timeline audio..."
                local audioInfo = ExportAudio()
                body = json.encode(audioInfo)
            elseif data.func == "AddSubtitles" then
                print("[AutoSubs Server] Adding subtitles to timeline...")
                itm.Message.Text = "Adding subtitles to timeline..."
                AddSubtitles(data.filePath, data.trackIndex, data.templateName)
                body = json.encode({ message = "Job completed" })
            elseif data.func == "Exit" then
                break
            else
                print("Invalid function name")
            end
            -- Send HTTP response content
            local response = CreateResponse(body)
            assert(client:send(response))
            -- Close connection
            client:close()
            itm.Message.Text = "Waiting for Task"
        elseif err == "closed" then
            client:close()
        elseif err ~= "timeout" then
            error(err)
        end
    elseif err ~= "timeout" then
        error(err)
    end
    sleep(0.05)
end


print("Shutting down AutoSubs server...")
itm.Message.Text = "Shutting down..."
server:close()
win:Hide()
print("Server shut down.")
