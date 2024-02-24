import sys
ui = fu.UIManager
disp = bmd.UIDispatcher(ui)

dlg = disp.AddWindow({'WindowTitle': 'Copy Text+ Properties', 'ID': 'MyWin', 'Geometry': [100, 100, 500, 400],},[
	ui.VGroup({'Spacing': 0,},[
        ui.Button({
			'ID': 'CopyColorButton',
			'Text': '\tCopy Color',
			'Font': ui.Font({
				'Family': 'Droid Sans Mono',
				'PixelSize': 25,
				'MonoSpaced': True,
			}),
			'IconSize': [40, 40],
			'MinimumSize': [64, 64],
			'Margin': 10,
			'Icon': ui.Icon({'File': 'AllData:../Support/Developer/Workflow Integrations/Examples/SamplePlugin/img/logo.png'}),
		}),
		ui.Button({
			'ID': 'CopyOutlineButton',
			'Text': '\tCopy Outline',
			'Font': ui.Font({
				'Family': 'Droid Sans Mono',
				'PixelSize': 25,
				'MonoSpaced': True,
			}),
			'IconSize': [40, 40],
			'MinimumSize': [64, 64],
			'Margin': 10,
			'Icon': ui.Icon({'File': 'AllData:../Support/Developer/Workflow Integrations/Examples/SamplePlugin/img/logo.png'}),
		}),
        ui.Button({
			'ID': 'CopySizeButton',
			'Text': '\tCopy Size',
			'Font': ui.Font({
				'Family': 'Droid Sans Mono',
				'PixelSize': 25,
				'MonoSpaced': True,
			}),
			'IconSize': [40, 40],
			'MinimumSize': [64, 64],
			'Margin': 10,
			'Icon': ui.Icon({'File': 'Scripts:/Comp/UI Manager/fusion-logo.png'}),
		}),
        ui.VGap(10),
        ui.Label({ 'Text': "Select track to edit", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 15 }) }),
        ui.SpinBox({"ID": "TrackSelector", "Min": 1, "Value": 2}),
        ui.VGap(15),
        ui.Label({ 'Text': "Step 1: Place playead at start of clip you want to copy.", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 16 }) }),
        ui.VGap(10),
        ui.Label({ 'Text': "Step 2: Add marker where you want to stop pasting.", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 16 }) }),
	]),
])

itm = dlg.GetItems()

# The window was closed
def _func(ev):
	disp.ExitLoop()
dlg.On.MyWin.Close = _func

# Copy text outline
def _func(ev):
    projectManager = resolve.GetProjectManager()
    project = projectManager.GetCurrentProject()
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
        timelineTrack = itm['TrackSelector'].Value # set video track to edit
        clips = timeline.GetItemListInTrack('video', timelineTrack)
        start_time = timeline.GetCurrentTimecode()
        frame_rate = timeline.GetSetting('timelineFrameRate')
        timeline_start = timeline.GetStartFrame()
        # Convert timestamp to frames for position of the playhead
        hours, minutes, seconds, framesLeft = start_time.split(':')
        frames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds)) * int(frame_rate)))
        timelinePos = frames + int(framesLeft)
        markers = timeline.GetMarkers()
        for marker in markers:
            if (timeline_start + (marker * frame_rate)) > timelinePos:
                endPoint = timeline_start + (marker * frame_rate)
                break

        red = 0
        blue = 0
        green = 0
        i = 0
        for clip in clips:
            if clip.GetStart() >= timelinePos and clip.GetStart() < endPoint:
                cmp = clip.GetFusionCompByIndex(1)
                toollist = cmp.GetToolList().values()
                tool = []
                for tool in toollist:
                    if tool.GetAttrs()['TOOLS_Name'] == 'Template' :
                        cmp.SetActiveTool(tool)
                        if i == 0:
                            print("Copied color from text at playhead.")
                            red = tool.GetInput('Red1')
                            blue = tool.GetInput('Blue1')
                            green = tool.GetInput('Green1')
                        else :
                            tool.SetInput('Red1', red)
                            tool.SetInput('Blue1', blue)
                            tool.SetInput('Green1', green)
                i += 1
    projectManager.SaveProject()
	# disp.ExitLoop()
dlg.On.CopyColorButton.Clicked = _func

# Copy text size
def _func(ev):
    projectManager = resolve.GetProjectManager()
    project = projectManager.GetCurrentProject()
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
        timelineTrack = itm['TrackSelector'].Value # set video track edit
        clips = timeline.GetItemListInTrack('video', timelineTrack)
        start_time = timeline.GetCurrentTimecode()
        frame_rate = timeline.GetSetting('timelineFrameRate')
        timeline_start = timeline.GetStartFrame()

        # Convert timestamp to frames for position of the playhead
        hours, minutes, seconds, framesLeft = start_time.split(':')
        frames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds)) * int(frame_rate)))
        timelinePos = frames + int(framesLeft)
        markers = timeline.GetMarkers()
        for marker in markers:
            if (timeline_start + (marker * frame_rate)) > timelinePos:
                endPoint = timeline_start + (marker * frame_rate)
                break

        size = 1
        i = 0
        print("Copied size of text at playhead. Stopped pasting at first marker.")
        for clip in clips:
            if clip.GetStart() >= timelinePos and clip.GetStart() < endPoint:
                cmp = clip.GetFusionCompByIndex(1)
                toollist = cmp.GetToolList().values()
                tool = []
                for tool in toollist:
                    if tool.GetAttrs()['TOOLS_Name'] == 'Template' :
                        cmp.SetActiveTool(tool)
                        if i == 0:
                            size = tool.GetInput('Size')
                        else :
                            tool.SetInput('Size', size)
                i += 1
    projectManager.SaveProject()
	# disp.ExitLoop()
dlg.On.CopySizeButton.Clicked = _func

# Copy text outline
def _func(ev):
    projectManager = resolve.GetProjectManager()
    project = projectManager.GetCurrentProject()
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
        timelineTrack = itm['TrackSelector'].Value # set video track to edit
        clips = timeline.GetItemListInTrack('video', timelineTrack)
        start_time = timeline.GetCurrentTimecode()
        frame_rate = timeline.GetSetting('timelineFrameRate')
        timeline_start = timeline.GetStartFrame()
        # Convert timestamp to frames for position of the playhead
        hours, minutes, seconds, framesLeft = start_time.split(':')
        frames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds)) * int(frame_rate)))
        timelinePos = frames + int(framesLeft)
        markers = timeline.GetMarkers()
        for marker in markers:
            if (timeline_start + (marker * frame_rate)) > timelinePos:
                endPoint = timeline_start + (marker * frame_rate)
                break

        red = 0
        blue = 0
        green = 0
        i = 0
        for clip in clips:
            if clip.GetStart() >= timelinePos and clip.GetStart() < endPoint:
                cmp = clip.GetFusionCompByIndex(1)
                toollist = cmp.GetToolList().values()
                tool = []
                for tool in toollist:
                    if tool.GetAttrs()['TOOLS_Name'] == 'Template' :
                        cmp.SetActiveTool(tool)
                        if i == 0:
                            print("Copied color from text at playhead.")
                            red = tool.GetInput('Red2')
                            blue = tool.GetInput('Blue2')
                            green = tool.GetInput('Green2')
                        else :
                            tool.SetInput('Red2', red)
                            tool.SetInput('Blue2', blue)
                            tool.SetInput('Green2', green)
                i += 1
    projectManager.SaveProject()
	# disp.ExitLoop()
dlg.On.CopyOutlineButton.Clicked = _func

dlg.Show()
disp.RunLoop()
dlg.Hide()