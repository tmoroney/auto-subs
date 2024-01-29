#MIT License
#
#Copyright (c) 2023 Tom Moroney
#
#Permission is hereby granted, free of charge, to any person obtaining a copy
#of this software and associated documentation files (the "Software"), to deal
#in the Software without restriction, including without limitation the rights
#to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
#copies of the Software, and to permit persons to whom the Software is
#furnished to do so, subject to the following conditions:
#
#The above copyright notice and this permission notice shall be included in all
#copies or substantial portions of the Software.
#
#THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
#IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
#FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
#AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
#LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
#OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
#SOFTWARE.

import stable_whisper
import time
import re

# some element IDs
winID = "com.blackmagicdesign.resolve.AutoSubsGen"   # should be unique for single instancing
textID = "TextEdit"
addSubsID = "AddSubs"
transcribeID = "Transcribe"
executeAllID = "ExecuteAll"
browseFilesID = "BrowseButton"
addMarkerID = "AddMarker"
removeMarkersID = "RemoveMarkers"

subtitlesInTrack = []

ui = fusion.UIManager
dispatcher = bmd.UIDispatcher(ui)
storagePath = fusion.MapPath(r"Scripts:/Utility/")

# check for existing instance
win = ui.FindWindow(winID)
if win:
   win.Show()
   win.Raise()
   exit()
# otherwise, we set up a new window

# define the window UI layout
win = dispatcher.AddWindow({
   'ID': winID,
   'Geometry': [ 100,100, 950, 920 ],
   'WindowTitle': "Resolve Auto Subtitle Generator",
   },
   ui.VGroup({"ID": "root",},[
      ui.HGroup({'Weight': 1.0},[
         ui.HGap(10),
         ui.VGroup({'Weight': 0.0, 'MinimumSize': [400, 900]},[
            ui.VGap(4),
            ui.Label({ 'Text': "AutoSubs", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 22, 'Bold': True}) }),
            ui.VGap(40),
            ui.Label({ 'ID': 'DialogBox', 'Text': "Waiting for Task", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 20, 'Italic': True }), 'Alignment': { 'AlignHCenter': True } }),
            ui.VGap(50),
            ui.Label({ 'Text': "Place a marker at the start + end of segment to subtitle.", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 15, 'Bold': True }), 'Alignment': { 'AlignHCenter': True } }),
            ui.VGap(1),
            ui.HGroup({'Weight': 0.0,},[
               ui.Button({ 'ID': addMarkerID, 'Text': "✛ Add In / Out Marker", 'MinimumSize': [150, 35], 'MaximumSize': [1000, 35], 'Font': ui.Font({'PixelSize': 14}),}),
               ui.Button({ 'ID': removeMarkersID, 'Text': "✕ Clear Markers", 'MinimumSize': [150, 35], 'MaximumSize': [1000, 35], 'Font': ui.Font({'PixelSize': 14}),}),
            ]),
            ui.VGap(1),
            ui.Button({ 
               'ID': executeAllID,
               'Text': "  Generate Subtitles", 
               'MinimumSize': [150, 40],
               'MaximumSize': [1000, 40], 
               'IconSize': [17, 17], 
               'Font': ui.Font({'PixelSize': 15}),
               'Icon': ui.Icon({'File': 'AllData:../Support/Developer/Workflow Integrations/Examples/SamplePlugin/img/logo.png'}),}),
            ui.VGap(10),
            ui.Label({ 'Text': "Basic Settings:", 'Weight': 1, 'Font': ui.Font({ 'PixelSize': 20 }) }),
            ui.Label({ 'Text': "Video Track for Subtitles", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.SpinBox({"ID": "TrackSelector", "Min": 1, "Value": 2}),
            ui.VGap(1),
            ui.Label({ 'Text': "Transcription Model (auto detects language)", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 })}),
            ui.ComboBox({"ID": "WhisperModel", 'MaximumSize': [2000, 30]}),
            ui.CheckBox({"ID": "EnglishOnly", "Text": "English Only Mode (more accurate)", "Checked": True, 'Font': ui.Font({ 'PixelSize': 14 })}),
            ui.VGap(10),
            ui.Label({ 'Text': "Advanced Settings:", 'Weight': 1, 'Font': ui.Font({ 'PixelSize': 20 }) }),
            ui.Label({'ID': 'Label', 'Text': 'Use Your Own Subtitles File ( .srt )', 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.HGroup({'Weight': 0.0, 'MinimumSize': [200, 30]},[
		      	ui.LineEdit({'ID': 'FileLineTxt', 'Text': '', 'PlaceholderText': 'Please Enter a filepath', 'Weight': 0.9}),
		      	ui.Button({'ID': 'BrowseButton', 'Text': 'Browse', 'Weight': 0.1}),
		      ]),
            ui.VGap(1),
            ui.HGroup({'Weight': 0.0},[
               ui.VGroup({'Weight': 0.0, 'MinimumSize': [213, 50]},[
                  ui.Label({ 'Text': "Max Words Per Line", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
                  ui.SpinBox({"ID": "MaxWords", "Min": 1, "Value": 5}),
               ]),
               ui.VGroup({'Weight': 0.0, 'MinimumSize': [212, 50]},[
                  ui.Label({ 'Text': "Max Characters Per Line", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
                  ui.SpinBox({"ID": "MaxChars", "Min": 1, "Value": 18}),
               ]),
            ]),
            ui.VGap(1),
            ui.Label({ 'Text': "Colour of In / Out Markers (area to subtitle)", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.ComboBox({"ID": "MarkerColor", 'MaximumSize': [2000, 30]}),
            ui.VGap(1),
            ui.Label({'ID': 'Label', 'Text': 'Censored Words (comma separated list)', 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.LineEdit({'ID': 'CensorList', 'Text': '', 'PlaceholderText': 'e.g. bombing = b***ing', 'Weight': 0, 'MinimumSize': [200, 30]}),
            ui.VGap(1),
            ui.Label({ 'Text': "Format Text", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.ComboBox({"ID": "FormatText", 'MaximumSize': [2000, 30]}),
            ui.CheckBox({"ID": "RemovePunc", "Text": "Remove commas , and full stops .", "Checked": False, 'Font': ui.Font({ 'PixelSize': 14 })}),
            ui.VGap(20),
         ]),
         ui.HGap(20),
         ui.VGroup({'Weight': 1.0, 'MinimumSize': [350, 600]},[
            ui.VGap(4),
            ui.Label({ 'Text': "Subtitles on Timeline:", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 20 }) }),
            ui.Label({ 'Text': "Click on a subtitle to jump to its position in the timeline.", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 15 }) }),
            ui.VGap(1),
            ui.Tree({
			      "ID": "Tree",
			      "SortingEnabled": False,
			      "Events": {
			      	"CurrentItemChanged": True,
			      	"ItemActivated": True,
			      	"ItemClicked": True,
			      	"ItemDoubleClicked": True,
			      },
		      }),     
            ui.VGap(1),
            ui.Button({ 'ID': 'RefreshSubs', 'Text': "♺  Refresh + Show Latest Changes", 'MinimumSize': [200, 40], 'MaximumSize': [1000, 40], 'Font': ui.Font({'PixelSize': 15}),}),
            ui.VGap(1),
            ui.HGroup({'Weight': 0.0,},[
               ui.Button({ 'ID': transcribeID, 'Text': "➔  Get Subtitles File", 'MinimumSize': [120, 35], 'MaximumSize': [1000, 35], 'Font': ui.Font({'PixelSize': 14}),}),
               ui.Button({ 'ID': addSubsID, 'Text': "☇ Revert all changes", 'MinimumSize': [120, 35], 'MaximumSize': [1000, 35], 'Font': ui.Font({'PixelSize': 14}),}),
            ]),
            ui.VGap(1),
         ]),
      ]),
   ])
)

itm = win.GetItems()
#itm['WhisperModel'].SetCurrentText("small") # set default model to small
projectManager = resolve.GetProjectManager()
project = projectManager.GetCurrentProject()

# Event handlers
def OnClose(ev):
   dispatcher.ExitLoop()

def OnBrowseFiles(ev):
	selectedPath = fusion.RequestFile()
	if selectedPath:
		itm['FileLineTxt'].Text = str(selectedPath)
                
# Transcribe + Generate Subtitles on Timeline
def OnSubsGen(ev):
   timeline = project.GetCurrentTimeline()
   if itm['TrackSelector'].Value > timeline.GetTrackCount('video'):
      print("Track", itm['TrackSelector'].Value ,"does not exist - please select a valid track number ( 1 -", timeline.GetTrackCount('video'), ")")
      itm['DialogBox'].Text = "Selected video track does not exist!"
      return
   
   if itm['FileLineTxt'].Text == '':
      OnTranscribe(ev)
   OnGenerate(ev)

def AudioToSRT(ev):
   OnTranscribe(ev)
   # Show the file in the Media Storage
   mediaStorage = resolve.GetMediaStorage()
   fileList = mediaStorage.GetFileList(storagePath)
   for filePath in fileList:
      if 'audio.srt' in filePath:
         mediaStorage.RevealInStorage(filePath)
         itm['DialogBox'].Text = "Directory opened of audio.srt"
         break

# Transcribe Timeline to SRT file              
def OnTranscribe(ev):
   # Choose Transcription Model
   chosenModel = "small" # default model
   if itm['WhisperModel'].CurrentIndex == 1:
      chosenModel = "tiny"
   elif itm['WhisperModel'].CurrentIndex == 2:
      chosenModel = "base"
   elif itm['WhisperModel'].CurrentIndex == 3:
      chosenModel = "small"
   elif itm['WhisperModel'].CurrentIndex == 4:
      chosenModel = "medium"
   
   if itm['EnglishOnly'].Checked == True: # use english only model
      chosenModel = chosenModel + ".en"
   print("Using model -> [", chosenModel, "]")

   if not project:
      print("No project is loaded")
      return

   timeline = project.GetCurrentTimeline()
   if not timeline:
      if project.GetTimelineCount() > 0:
         timeline = project.GetTimelineByIndex(1)
         project.SetCurrentTimeline(timeline)
      else:
         print("Current project has no timelines")
         return

   # Find markers
   markerColor = itm['MarkerColor'].CurrentText
   markers = timeline.GetMarkers()
   marker1 = -1;
   marker2 = -1;
   for position, marker_info in markers.items():
      color = marker_info['color']
      if marker1 == -1 and color == markerColor:
         marker1 = position
      elif marker2 == -1 and color == markerColor:
         marker2 = position
         break
       
   if marker1 == -1:
      print("Start and end markers not found!")
      itm['DialogBox'].Text = "Please add markers to timeline!"
      return
   elif marker2 == -1:
      print("End marker not found!")
      itm['DialogBox'].Text = "Please add end marker to timeline!"
      return
   
   timelineStartFrame = marker1 + timeline.GetStartFrame()
   timelineEndFrame = marker2 + timeline.GetStartFrame()

   # RENDER AUDIO FOR TRANSCRIPTION
   project.LoadRenderPreset('H.265 Master')
   project.SetRenderSettings({"SelectAllFrames": 0, "MarkIn": timelineStartFrame, "MarkOut": timelineEndFrame, "CustomName": "audio", "TargetDir": storagePath, "AudioCodec": "mp3", "ExportVideo": False, "ExportAudio": True})
   pid = project.AddRenderJob()
   project.StartRendering(pid)
   print("Rendering Audio for Transcription...")
   itm['DialogBox'].Text = "Rendering Audio for Transcription..."
   while project.IsRenderingInProgress():
      time.sleep(3)
      progress = project.GetRenderJobStatus(pid).get("CompletionPercentage")
      print("Progress: ", progress, "%")
      itm['DialogBox'].Text = "Progress: ", progress, "%"
   print("Audio Rendering Complete!")
   format = project.GetCurrentRenderFormatAndCodec() # get audio format
   filename = "audio." + format['format'] # get audio filename
   location = storagePath + filename # get audio filepath
   print("Transcribing Audio...")
   itm['DialogBox'].Text = "Transcribing Audio..."
   model = stable_whisper.load_model(chosenModel) # load whisper transcription model
   result = model.transcribe(location, fp16=False, regroup=False) # transcribe audio file
   (
      result
      .split_by_punctuation([('.', ' '), '。', '?', '？', ',', '，'])
      .split_by_gap(.5)
      .merge_by_gap(.10, max_words=3)
      .split_by_length(max_words=itm['MaxWords'].Value, max_chars=itm['MaxChars'].Value)
   )
   file_path = storagePath + 'audio.srt'
   result.to_srt_vtt(file_path, word_level=False) # save to SRT file
   print("Transcription Complete!")
   print("Subtitles saved to -> [", file_path, "]")
   itm['DialogBox'].Text = "Transcription Complete!"
   resolve.OpenPage("edit")


# Generate Text+ Subtitles on Timeline
def OnGenerate(ev):
   resolve.OpenPage("edit")
   mediaPool = project.GetMediaPool()
   folder = mediaPool.GetRootFolder()
   items = folder.GetClipList()

   if not project:
      print("No project is loaded")
      return

   # Get current timeline. If no current timeline try to load it from timeline list
   timeline = project.GetCurrentTimeline()
   if not timeline:
      if project.GetTimelineCount() > 0:
         timeline = project.GetTimelineByIndex(1)
         project.SetCurrentTimeline(timeline)
      else:
         print("Current project has no timelines")
         return
   
   if itm['TrackSelector'].Value > timeline.GetTrackCount('video'):
      print("Track", itm['TrackSelector'].Value ,"does not exist - please select a valid track number ( 1-", timeline.GetTrackCount('video'), ")")
      itm['DialogBox'].Text = "Please select a valid track!"
      return
   
   if itm['FileLineTxt'].Text != '': # use custom subtitles file
      file_path = r"{}".format(itm['FileLineTxt'].Text)
      print("Using custom subtitles from -> [", file_path, "]")
   else:
      file_path = storagePath + 'audio.srt' # use generated subtitles file at default location
   
   # READ SRT FILE
   try:
      with open(file_path, 'r', encoding='utf-8') as f:
         lines = f.readlines()
   except FileNotFoundError:
      print("No subtitles file (audio.srt) found - Please Transcribe the timeline or load your own SRT file!")
      itm['DialogBox'].Text = "No subtitles file found!"
      return
   
   # Find markers
   markerColor = itm['MarkerColor'].CurrentText
   markers = timeline.GetMarkers()
   marker1 = -1;
   marker2 = -1;
   for timestamp, marker_info in markers.items():
      color = marker_info['color']
      if marker1 == -1 and color == markerColor:
         marker1 = timestamp
      elif marker2 == -1 and color == markerColor:
         marker2 = timestamp
         break
       
   if marker1 == -1:
      print("Start and end markers not found!")
      itm['DialogBox'].Text = "Please add markers to timeline!"
      return
   elif marker2 == -1:
      print("End marker not found!")
      itm['DialogBox'].Text = "Please add end marker to timeline!"
      return
   
   # Find sound to block censored words (if available)
   subs = []
   checkCensor = False
   censorSound = None
   if itm['CensorList'].Text != '': # only check for swear words if list is not empty
         swear_words = itm['CensorList'].Text.split(',')
         checkCensor = True
         for item in items:
            if "Censor" in item.GetClipProperty("Clip Name"): # Find Censor in Media Pool
               print("Found Censor")
               censorSound = item
               break

   if len(lines) < 4:
      print("No subtitles found in SRT file")
      itm['DialogBox'].Text = "No subtitles found in SRT file!"
      return
   
   timelineStartFrame = marker1 + timeline.GetStartFrame()
   timelineEndFrame = marker2 + timeline.GetStartFrame()

   # Create clip object for each line in the SRT file
   for i in range(0, len(lines), 4):
      frame_rate = timeline.GetSetting("timelineFrameRate") # get timeline framerate
      start_time, end_time = lines[i+1].strip().split(" --> ")
      text = lines[i+2].strip() # get  subtitle text
      # Set start position of subtitle (in frames)
      hours, minutes, seconds_milliseconds = start_time.split(':')
      seconds, milliseconds = seconds_milliseconds.split(',')
      posInFrames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * round(frame_rate)))
      timelinePos = timelineStartFrame + posInFrames
      #print("->", i//4+1, ":", text, " @ ", timelinePos, " frames")
      # stop subtitles if outside of marker range
      if timelinePos > timelineEndFrame:
         break
      # Set duration of subtitle (in frames)
      hours, minutes, seconds_milliseconds = end_time.split(':')
      seconds, milliseconds = seconds_milliseconds.split(',')
      endPosInFrames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * round(frame_rate)))
      duration = (timelineStartFrame + endPosInFrames) - timelinePos
      #print("-> Duration: ", duration, " frames")
      if itm['FormatText'].CurrentIndex == 1: # make each line lowercase
         text = text.lower()
      elif itm['FormatText'].CurrentIndex == 2: # make each line uppercase
         text = text.upper()
      if itm['RemovePunc'].Checked == True: # remove commas and full stops
         text = text.replace(',', '')
         text = text.replace('.', '')
      # Check for words to censor
      if checkCensor:
         for swear in swear_words:
            if censorSound is not None:
               words = text.split()
               wordCount = len(words)
               for i, word in enumerate(words):
                  # Block out swear words with selected censor sound
                  if swear in word:
                     censorDuration = duration/wordCount
                     censorStart = timelinePos + (censorDuration * i)
                     newClip = {
                        "mediaPoolItem" : censorSound,
                        "startFrame" : 5,
                        "endFrame" : censorDuration,
                        "mediaType" : "audio",
                        "trackIndex" : 4,
                        "recordFrame" : censorStart
                     }
                     mediaPool.AppendToTimeline( [newClip] ) # add censor sound to timeline
            pattern = r"\b" + re.escape(swear) + r"\b"
            censored_word = swear[0] + '*' * (len(swear) - 2) + swear[-1]
            text = re.sub(pattern, censored_word, text, flags=re.IGNORECASE)
            pattern = re.escape(swear)
            censored_word = swear[0] + '**'
            text = re.sub(pattern, censored_word, text, flags=re.IGNORECASE)
               
      subs.append((timelinePos, duration, text)) # add subtitle to list
   
   print("Found", len(subs), "subtitles in SRT file")
   
   # ADD TEXT+ TO TIMELINE
   templateText = None
   for item in items:
      itemName = item.GetName();
      if itemName == "Text+" or itemName == "Fusion Title" : # Find Text+ in Media Pool
         templateText = item
         print("Found Text+ in Media Pool!")
         break
   if not templateText:
      print("No Text+ found in Media Pool")
      itm['DialogBox'].Text = "No Text+ found in Media Pool!"
      return
   
   print("Adding template subtitles...")
   itm['DialogBox'].Text = "Adding template subtitles..."
   timelineTrack = itm['TrackSelector'].Value # set video track to add subtitles

   for i in range(len(subs)):
      timelinePos, duration, text = subs[i]
      if i < len(subs)-1 and subs[i+1][0] - (timelinePos + duration) < 200: # if gap between subs is less than 10 frames
         duration = (subs[i+1][0] - subs[i][0]) - 1 # set duration to next start frame -1 frame
      newClip = {
         "mediaPoolItem" : templateText,
         "startFrame" : 0,
         "endFrame" : duration,
         "trackIndex" : timelineTrack,
         "recordFrame" : timelinePos
      }
      mediaPool.AppendToTimeline( [newClip] ) # add template Text+ to timeline (text not set yet)
   
   print("Modifying subtitle text content...")
   itm['DialogBox'].Text = "Updating text content..."
   clipList = timeline.GetItemListInTrack('video', timelineTrack) # get list of Text+ in timeline
   #print("-> Found", len(clipList), "clips on the timeline")
   i = 0
   for count, clip in enumerate(clipList):
      if clip.GetStart() >= timelineStartFrame and clip.GetStart() < timelineEndFrame:
         clip.SetClipColor('Orange')
         text = subs[i][2]
         comp = clip.GetFusionCompByIndex(1) # get fusion comp from Text+
         if (comp is not None):
            toollist = comp.GetToolList().values() # get list of tools in comp
            for tool in toollist:
               if tool.GetAttrs()['TOOLS_Name'] == 'Template' : # find Template tool
                  comp.SetActiveTool(tool)
                  tool.SetInput('StyledText', text)
            clip.SetClipColor('Teal')
         if count == len(clipList)-1 or i == len(subs)-1:
            print("Updated text content for", i+1, "subtitles")
            break
         i += 1

   print("Subtitles added to timeline!")
   itm['DialogBox'].Text = "Subtitles added to timeline!"
   projectManager.SaveProject()
   OnPopulateSubs(ev)

# Add In / Out Markers to Timeline
def OnAddMarker(ev):
   timeline = project.GetCurrentTimeline()
   if not timeline:
      if project.GetTimelineCount() > 0:
         timeline = project.GetTimelineByIndex(1)
         project.SetCurrentTimeline(timeline)
      else:
         print("Current project has no timelines")
         return
      
   markerColor = itm['MarkerColor'].CurrentText
   currentPos = timeline.GetCurrentTimecode()
   frame_rate = timeline.GetSetting("timelineFrameRate") # get timeline framerate

   # convert timecode to frames
   hours, minutes, seconds, frames = currentPos.split(':')
   posInFrames = int(hours) * 3600 * round(frame_rate) + int(minutes) * 60 * round(frame_rate) + int(seconds) * round(frame_rate) + int(frames)
   posInFrames = posInFrames + timeline.GetStartFrame()
   print("Adding", markerColor, "marker at", currentPos)
   timeline.AddMarker(posInFrames, markerColor, "Subtitle area marker", "", 1.0)

# Remove all In / Out Markers from Timeline (only markers of selected colour)
def OnRemoveMarkers(ev):
   itm["Tree"].Clear()
   projectManager = resolve.GetProjectManager()
   project = projectManager.GetCurrentProject()
   timeline = project.GetCurrentTimeline()
   if not timeline:
      if project.GetTimelineCount() > 0:
         timeline = project.GetTimelineByIndex(1)
         project.SetCurrentTimeline(timeline)
      else:
         print("Current project has no timelines")
         return
   
   markerColor = itm['MarkerColor'].CurrentText
   timeline.DeleteMarkersByColor(markerColor)

def frame_to_timecode(frame_number, frame_rate):
    total_seconds = frame_number / frame_rate
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    frames = int((seconds % 1) * frame_rate)

    timecode = "{:02d}:{:02d}:{:02d}:{:02d}".format(int(hours), int(minutes), int(seconds), frames)
    return timecode

# Populate Subtitles in Table View
def OnPopulateSubs(ev):
   timeline = project.GetCurrentTimeline()
   timelineTrack = itm['TrackSelector'].Value # set video track to retrieve subtitles from
   clipList = timeline.GetItemListInTrack('video', timelineTrack) # get list of Text+ in timeline

   # Return if no Text+ clips found
   if len(clipList) == 0:
      itm["Tree"].Clear()
      itRow = itm["Tree"].NewItem()
      itRow.Text[0] = "No subtitles"
      itRow.Text[1] = "Select a video track that contains Text+ subtitles."
      itm["Tree"].AddTopLevelItem(itRow)
      return

   # Retrieve subtitles from the specified timeline track
   itm["Tree"].Clear()
   frame_rate = timeline.GetSetting("timelineFrameRate") # get timeline framerate
   for count, clip in enumerate(clipList):
      comp = clip.GetFusionCompByIndex(1) # get fusion comp from Text+
      if (comp is not None):
         toollist = comp.GetToolList().values() # get list of tools in comp
         for tool in toollist:
            if tool.GetAttrs()['TOOLS_Name'] == 'Template' : # find Template tool
               comp.SetActiveTool(tool)
               itRow = itm["Tree"].NewItem()
               startFrame = clip.GetStart() + timeline.GetStartFrame()
               itRow.Text[0] = frame_to_timecode(startFrame, frame_rate)
               itRow.Text[1] = tool.GetInput('StyledText')
               itm["Tree"].AddTopLevelItem(itRow)
   
   #itm["Tree"].GetAutoScroll()
   #itm["Tree"].SetWordWrap()
   #itm["Tree"].SortByColumn(0, 0)


def OnSubtitleSelect(ev):
   timeline = project.GetCurrentTimeline()
   timecode = ev["item"].Text[0].split(':')
   hours = int(timecode[0])
   minutes = int(timecode[1])
   seconds = int(timecode[2])
   frames = int(timecode[3])
   frames = frames + 1 # add 1 frame to ensure that playhead is on top of the subtitle
   timeline.SetCurrentTimecode("{:02d}:{:02d}:{:02d}:{:02d}".format(hours, minutes, seconds, frames))

# Add the items to the FormatText ComboBox menu
itm['FormatText'].AddItem("None")
itm['FormatText'].AddItem("all lowercase")
itm['FormatText'].AddItem("ALL UPPERCASE")

# Add colour options for In/Out Markers
colors = ["Yellow", "Blue", "Cyan", "Green", "Red", "Pink", "Purple", "Fuchsia", "Rose", "Lavender", "Sky", "Mint", "Lemon", "Sand", "Cocoa", "Cream"]
for color in colors:
    itm['MarkerColor'].AddItem(color)

# Add the items to the Transcription Model ComboBox menu
itm['WhisperModel'].AddItem("Recommended: small")
itm['WhisperModel'].AddItem("tiny - fastest / lowest accuracy")
itm['WhisperModel'].AddItem("base")
itm['WhisperModel'].AddItem("small")
itm['WhisperModel'].AddItem("medium - slowest / highest accuracy")

# Add a header row
hdr = itm["Tree"].NewItem()
hdr.Text[0] = "Timecode"
hdr.Text[1] = "Subtitle Content"
itm["Tree"].SetHeaderItem(hdr)

# Number of columns in the Tree list
itm["Tree"].ColumnCount = 2

# Resize the Columns
itm["Tree"].ColumnWidth[0] = 110
itm["Tree"].ColumnWidth[1] = 220

itRow = itm["Tree"].NewItem()
itRow.Text[0] = "No subtitles"
itRow.Text[1] = "Select a video track that contains Text+ subtitles."
itm["Tree"].AddTopLevelItem(itRow)

# assign event handlers
win.On[winID].Close     = OnClose
win.On[addSubsID].Clicked  = OnGenerate
win.On[transcribeID].Clicked = AudioToSRT
win.On[executeAllID].Clicked = OnSubsGen
win.On[browseFilesID].Clicked = OnBrowseFiles
win.On[addMarkerID].Clicked = OnAddMarker
win.On[removeMarkersID].Clicked = OnRemoveMarkers
win.On.Tree.ItemClicked = OnSubtitleSelect
win.On.RefreshSubs.Clicked = OnPopulateSubs


# Main dispatcher loop
win.Show()
dispatcher.RunLoop()
win.Hide()