import sys
import datetime
import time

projectManager = resolve.GetProjectManager()
project = projectManager.GetCurrentProject()
mediaPool = project.GetMediaPool()
if not project:
    print("No project is loaded")
    sys.exit()
# Get current timeline. If no current timeline try to load it from timeline list
timeline = project.GetCurrentTimeline()
if not timeline:
    if project.GetTimelineCount() > 0:
       timeline = project.GetTimelineByIndex(1)
       project.SetCurrentTimeline(timeline)
if not timeline:
    print("Current project has no timelines")
    sys.exit()

else:
    #timeline.SetStartTimecode(timecode)
    file_path = r'S:\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility\audio.srt'
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    folder = mediaPool.GetRootFolder()
    items = folder.GetClipList()
    subtitles = []
    for item in items:
        if item.GetName() == "Text+": # Find Text+ in Media Pool
            for i in range(0, len(lines), 4):
                frame_rate = timeline.GetSetting("timelineFrameRate") # get timeline framerate
                start_time, end_time = lines[i+1].strip().split(" --> ")
                text = lines[i+2].strip()
                # Convert the timestamp string to seconds
                hours, minutes, seconds_milliseconds = start_time.split(':')
                seconds, milliseconds = seconds_milliseconds.split(',')
                frames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * frame_rate))
                timelinePos = frames + timeline.GetStartFrame() # calculate time in frames
                print("Start Frame: ", timelinePos)

                hours, minutes, seconds_milliseconds = end_time.split(':')
                seconds, milliseconds = seconds_milliseconds.split(',')
                frames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * frame_rate))
                end_frame = frames - timelinePos # set duration in frames
                print("End Frame: ", end_frame)

                # CHANGE: USE DICT SO CAN CHECK NEXT TIME

                # PUT TEXT+ ON TIMELINE
                timelineTrack = 2 # set video track
                newClip = {
                    "mediaPoolItem" : item,
                    "startFrame" : 0,
                    "endFrame" : end_frame,
                    "trackIndex" : timelineTrack,
                    "recordFrame" : timelinePos
                }
                if mediaPool.AppendToTimeline( [newClip] ) : # Append text to timeline
                    print("Added clip to timeline: " + item.GetName())
                    timeline.SetCurrentTimecode(timelinePos) # Move playhead to start of text
                    resolve.OpenPage('fusion')               # Open the Fusion page
                    fusion = resolve.Fusion()                # Call the Fusion Object
                    cc = fusion.GetCurrentComp()             # Get the Current Fusion Composition
                    template = cc.FindTool('Template')       # Find the Template Tool for Setting +aText
                    cc.SetActiveTool(template)               # Set it to active
                    template.SetInput('StyledText', text, 0) # Set the input of the StyledText to the variable text.
                    resolve.OpenPage('edit')                 # Go Back to the Edit Page.
            break # only execute once if multiple Text+ in Media Pool

projectManager.SaveProject()