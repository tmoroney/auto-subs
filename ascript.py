import sys
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
    folder = mediaPool.GetRootFolder()
    items = folder.GetClipList()
    for item in items:
        if item.GetName() == "Text+": # Find Text+ in Media Pool
            timelinePos = (10 * 30) + timeline.GetStartFrame() # time on track in frames
            timelineTrack = 2
            newClip = {
                "mediaPoolItem" : item,
                "startFrame" : 0,
                "endFrame" : 200,
                "trackIndex" : timelineTrack,
                "recordFrame" : timelinePos
            }
            if mediaPool.AppendToTimeline( [newClip] ) : # Append text to timeline
                print("Added clip to timeline: " + item.GetName())

projectManager.SaveProject()