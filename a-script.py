import sys
import time

print("Add Subs")
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
    # PARSE SRT FILE
    subs = []
    for i in range(0, len(lines), 4):
        frame_rate = timeline.GetSetting("timelineFrameRate") # get timeline framerate
        start_time, end_time = lines[i+1].strip().split(" --> ")
        text = lines[i+2].strip()
        # Convert the timestamp string to seconds
        hours, minutes, seconds_milliseconds = start_time.split(':')
        seconds, milliseconds = seconds_milliseconds.split(',')
        frames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * frame_rate))
        timelinePos = frames + timeline.GetStartFrame() # calculate time in frames
        #print("Start Frame: ", timelinePos)
        hours, minutes, seconds_milliseconds = end_time.split(':')
        seconds, milliseconds = seconds_milliseconds.split(',')
        frames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * frame_rate))
        duration = frames - timelinePos # set duration of subtitle in frames
        #print("End Frame: ", duration)
        subs.append([timelinePos, duration, text])
    
    # PUT TEXT+ ON TIMELINE
    folder = mediaPool.GetRootFolder()
    items = folder.GetClipList()
    foundText = False
    for item in items:
        if item.GetName() == "Text+": # Find Text+ in Media Pool
            foundText = True
            print("Found Text+ in Media Pool")
            print("Adding template subtitles to timeline")
            for i in range(len(subs)):
                #print("Adding Subtitle: ", i)
                timelinePos, duration, text = subs[i]
                if i < len(subs)-1 and subs[i+1][0] - (timelinePos + duration) < 200: # if gap between subs is less than 10 frames
                   duration = (subs[i+1][0] - subs[i][0]) - 1 # set duration to next start frame -1 frame
                timelineTrack = 3 # set video track
                newClip = {
                   "mediaPoolItem" : item,
                   "startFrame" : 0,
                   "endFrame" : duration,
                   "trackIndex" : timelineTrack,
                   "recordFrame" : timelinePos
                }
                mediaPool.AppendToTimeline( [newClip] ) # Add Text+ to timeline
            projectManager.SaveProject()
            
            fusion = resolve.Fusion() # Call the Fusion Object
            subList = timeline.GetItemListInTrack('video', 3)
            print("Updating Text in Subtitles")
            for i, sub in enumerate(subList):
                sub.SetClipColor('Orange')
                comp = sub.GetFusionCompByIndex(1)
                toollist = comp.GetToolList().values()
                for tool in toollist:
                    if tool.GetAttrs()['TOOLS_Name'] == 'Template' :
                        comp.SetActiveTool(tool)
                        tool.SetInput('StyledText', subs[i][2])
                sub.SetClipColor('Tan')

            #compList = fusion.GetCompList()
            #time.sleep(1)
            #
            #for key, cmp in sorted(compList.items()):
            #    print("Adding Subtitle: ", key-1)
            #    text = subs[key-2][2]
            #    toollist = cmp.GetToolList().values()
            #    tool = []
            #    for tool in toollist:
            #        if tool.GetAttrs()['TOOLS_Name'] == 'Template' :
            #            cmp.SetActiveTool(tool)
            #            tool.SetInput('StyledText', text)
            #    if key == 20:
            #        time.sleep(0.5)
            break # only execute once if multiple Text+ in Media Pool
    if not foundText:
        print("Text+ not found in Media Pool")
projectManager.SaveProject()