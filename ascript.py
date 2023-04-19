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
    folder = mediaPool.GetRootFolder()
    items = folder.GetClipList()
    for item in items:
        if item.GetName() == "Text+":
            mediaPool.AppendToTimeline(item)
            #mediaPool.AppendToTimeline([{clipInfo}, …​]) # Appends list of dicts - "mediaPoolItem", "startFrame" (int), "endFrame" (int)
            #item.SetClipColor("Violet")
projectManager.SaveProject()