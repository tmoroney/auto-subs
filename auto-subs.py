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
#
# Support development of this script by buying me a coffee: https://www.buymeacoffee.com/tmoroney
#

import stable_whisper
import time
import re
from datetime import datetime, timedelta
import os
import platform

# check for macOS, then configure ffmpeg path + homebrew path (ensures that script works on M1 Macs)
if platform.system() == 'Darwin':
   os.environ['FFMPEG'] = '/opt/homebrew/bin/ffmpeg'
   os.environ['PATH'] = '/opt/homebrew/bin:' + os.environ['PATH']

# some element IDs
winID = "com.blackmagicdesign.resolve.AutoSubsGen"   # should be unique for single instancing
textID = "TextEdit"
addSubsID = "AddSubs"
transcribeID = "Transcribe"
executeAllID = "ExecuteAll"
browseFilesID = "BrowseButton"

# create the UI
ui = fusion.UIManager
dispatcher = bmd.UIDispatcher(ui)

# get the storage path for the settings file and other files
settingsName = "settings.txt"
if platform.system() == 'Darwin':
   # MacOS
   storagePath = os.path.expandvars("/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/")
elif platform.system() == 'Linux':
   # Linux
   storagePath = os.path.expandvars("$HOME/.local/share/DaVinciResolve/Fusion/Scripts/Utility/")
elif platform.system() == 'Windows':
   # Windows
   storagePath = os.path.expandvars("%APPDATA%\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Utility\\")
else:
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
   'Geometry': [ 100,100, 910, 980 ],
   'WindowTitle': "Resolve AI Subtitles",
   },
   ui.VGroup({"ID": "root",},[
      ui.HGroup({'Weight': 1.0},[
         ui.HGap(10),
         ui.VGroup({'Weight': 0.0, 'MinimumSize': [400, 960]},[
            ui.VGap(4),
            ui.Label({ 'Text': "♆ AutoSubs", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 22, 'Bold': True}) }),
            ui.VGap(35),
            ui.Label({ 'ID': 'DialogBox', 'Text': "Waiting for Task", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 24, 'Italic': True }), 'Alignment': { 'AlignHCenter': True } }),
            ui.VGap(40),
            ui.Label({ 'Text': "1. Add Text+ subtitle template to Media Pool.", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 15, 'Bold': True }), 'Alignment': { 'AlignHCenter': True } }),
            ui.Label({ 'Text': "2. Mark In + Out of area to subtitle with \"I\" + \"O\" keys.", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 15, 'Bold': True }), 'Alignment': { 'AlignHCenter': True } }),
            ui.VGap(2),
            ui.Button({ 
               'ID': executeAllID,
               'Text': "  Generate Subtitles", 
               'MinimumSize': [150, 40],
               'MaximumSize': [1000, 40], 
               'IconSize': [17, 17], 
               'Font': ui.Font({'PixelSize': 15}),
               'Icon': ui.Icon({'File': 'AllData:../Support/Developer/Workflow Integrations/Examples/SamplePlugin/img/logo.png'}),}),
            ui.VGap(1),
            ui.HGroup({'Weight': 0.0,},[
               ui.Button({ 'ID': transcribeID, 'Text': "➔  Get Subtitles File", 'MinimumSize': [120, 35], 'MaximumSize': [1000, 35], 'Font': ui.Font({'PixelSize': 14}),}),
               ui.Button({ 'ID': addSubsID, 'Text': "☇ Revert all changes", 'MinimumSize': [120, 35], 'MaximumSize': [1000, 35], 'Font': ui.Font({'PixelSize': 14}),}),
            ]),
            ui.VGap(12),
            ui.Label({ 'Text': "Basic Settings:", 'Weight': 1, 'Font': ui.Font({ 'PixelSize': 20 }) }),
            ui.VGap(1),
            ui.Label({ 'Text': "Video Track for Subtitles", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.SpinBox({"ID": "TrackSelector", "Min": 1, "Value": 2, 'MaximumSize': [2000, 40]}),
            ui.VGap(1),
            ui.Label({ 'Text': "Select Template Text", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 })}),
            ui.ComboBox({"ID": "Template", 'MaximumSize': [2000, 55]}),
            ui.VGap(1),
            ui.Label({ 'Text': "Transcription Model", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 })}),
            ui.ComboBox({"ID": "WhisperModel", 'MaximumSize': [2000, 55]}),
            ui.VGap(3),
            ui.Label({ 'Text': "Output Mode  (spoken language is auto detected)", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 })}),
            ui.ComboBox({"ID": "SubsOutput", 'MaximumSize': [2000, 55]}),
            ui.VGap(1),
            ui.CheckBox({"ID": "RefineSubs", "Text": "Refine Timestamps - may improve timing (slower)", "Checked": False, 'Font': ui.Font({ 'PixelSize': 14 })}),
            ui.VGap(15),
            ui.Label({ 'Text': "Advanced Settings:", 'Weight': 1, 'Font': ui.Font({ 'PixelSize': 20 }) }),
            ui.VGap(1),
            ui.Label({'ID': 'Label', 'Text': 'Use Your Own Subtitles File ( .srt )', 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.HGroup({'Weight': 0.0, 'MinimumSize': [200, 25]},[
		      	ui.LineEdit({'ID': 'FileLineTxt', 'Text': '', 'PlaceholderText': 'Please Enter a filepath', 'Weight': 0.9}),
		      	ui.Button({'ID': 'BrowseButton', 'Text': 'Browse', 'Weight': 0.1}),
		      ]),
            ui.VGap(3),
            ui.HGroup({'Weight': 0.0},[
               ui.VGroup({'Weight': 0.0, 'MinimumSize': [140, 48]},[
                  ui.Label({ 'Text': "Max Words", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
                  ui.SpinBox({"ID": "MaxWords", "Min": 1, "Value": 6}),
               ]),
               ui.VGroup({'Weight': 0.0, 'MinimumSize': [140, 48]},[
                  ui.Label({ 'Text': "Max Characters", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
                  ui.SpinBox({"ID": "MaxChars", "Min": 1, "Value": 20}),
               ]),
               ui.VGroup({'Weight': 0.0, 'MinimumSize': [140, 48]},[
                  ui.Label({ 'Text': "Split by Gap (seconds)", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
                  ui.DoubleSpinBox({"ID": "SplitByGap", "Min": 0.1, "Value": 0.4}),
               ]),
            ]),
            ui.VGap(1),
            ui.Label({'ID': 'Label', 'Text': 'Censored Words (comma separated list)', 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.LineEdit({'ID': 'CensorList', 'Text': '', 'PlaceholderText': 'e.g. bombing = b***ing', 'Weight': 0, 'MinimumSize': [200, 30]}),
            ui.VGap(1),
            ui.Label({ 'Text': "Format Text", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 14 }) }),
            ui.ComboBox({"ID": "FormatText", 'MaximumSize': [2000, 30]}),
            ui.VGap(1),
            ui.CheckBox({"ID": "RemovePunc", "Text": "Remove commas , and full stops .", "Checked": False, 'Font': ui.Font({ 'PixelSize': 14 })}),
            ui.VGap(10),
         ]),
         ui.HGap(20),
         ui.VGroup({'Weight': 1.0},[
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
   saveSettings()
   dispatcher.ExitLoop()

def OnBrowseFiles(ev):
	selectedPath = fusion.RequestFile()
	if selectedPath:
		itm['FileLineTxt'].Text = str(selectedPath)
                
# Transcribe + Generate Subtitles on Timeline
def OnSubsGen(ev):
   timeline = project.GetCurrentTimeline()
   if itm['TrackSelector'].Value > timeline.GetTrackCount('video'):
      print("Track", itm['TrackSelector'].Value ,"does not exist - please select a valid track number ( 1 - ", timeline.GetTrackCount('video'), ")")
      itm['DialogBox'].Text = "Error: track " + str(itm['TrackSelector'].Value) + " does not exist!"
      return
   
   if itm['FileLineTxt'].Text == '':
      OnTranscribe(ev)
   OnGenerate(ev)

def AudioToSRT(ev):
   #OnTranscribe(ev)
   # Show the file in the Media Storage
   mediaStorage = resolve.GetMediaStorage()
   fileList = mediaStorage.GetFileList(storagePath)
   for filePath in fileList:
      if 'audio.srt' in filePath:
         mediaStorage.RevealInStorage(filePath)
         itm['DialogBox'].Text = "Storage folder of \"audio.srt\" opened!"
         break

def adjust_subtitle_timestamps(srt_content, time_delta):
    # Define a regular expression pattern to match the timestamps in the SRT file
    timestamp_pattern = re.compile(r'(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})')

    # Function to adjust the timestamps by adding the specified time_delta
    def adjust_timestamp(match):
        start_time = datetime.strptime(match.group(1), '%H:%M:%S,%f')
        end_time = datetime.strptime(match.group(2), '%H:%M:%S,%f')
        adjusted_start_time = start_time + time_delta
        adjusted_end_time = end_time + time_delta

        return f"{adjusted_start_time.strftime('%H:%M:%S,%f')[:-3]} --> {adjusted_end_time.strftime('%H:%M:%S,%f')[:-3]}"

    # Use the re.sub function to replace timestamps with adjusted timestamps
    adjusted_srt_content = re.sub(timestamp_pattern, adjust_timestamp, srt_content)

    return adjusted_srt_content

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
   
   if itm['SubsOutput'].CurrentIndex == 0: # use english only model
      chosenModel = chosenModel + ".en"

   print("Using model -> [", chosenModel, "]")

   if not project:
      print("No project is loaded")
      return
   
   resolve.OpenPage("edit")

   timeline = project.GetCurrentTimeline()
   if not timeline:
      if project.GetTimelineCount() > 0:
         timeline = project.GetTimelineByIndex(1)
         project.SetCurrentTimeline(timeline)
      else:
         print("Current project has no timelines")
         return
   
   frame_rate = int(timeline.GetSetting("timelineFrameRate")) # get timeline framerate (sometimes returned as string so must cast to int)

   # RENDER AUDIO FOR TRANSCRIPTION
   project.LoadRenderPreset('H.265 Master')
   project.SetRenderSettings({"SelectAllFrames": 0, "CustomName": "audio", "TargetDir": storagePath, "AudioCodec": "mp3", "ExportVideo": False, "ExportAudio": True})
   pid = project.AddRenderJob()

   renderSettings = project.GetRenderJobList()[-1]
   markIn = renderSettings['MarkIn']
   print("MarkIn:", markIn)

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

   # TRANSCRIBE AUDIO TO SRT FILE
   if itm['SubsOutput'].CurrentIndex == 0 or itm['SubsOutput'].CurrentIndex == 1: # subtitles in original language
      result = model.transcribe(location, fp16=False, regroup=True, only_voice_freq=True) # transcribe audio file
      (
         result
         .split_by_punctuation([('.', ' '), '。', '?', '？', ',', '，'])
         .split_by_gap(itm['SplitByGap'].Value)
         .merge_by_gap(.10, max_words=3)
         .split_by_length(max_words=itm['MaxWords'].Value, max_chars=itm['MaxChars'].Value)
      )
   elif itm['SubsOutput'].CurrentIndex == 2:  # translate to english
      result = model.transcribe(location, fp16=False, regroup=True, only_voice_freq=True, task = 'translate')
      (
         result
         .split_by_punctuation([('.', ' '), '。', '?', '？', ',', '，'])
         .split_by_gap(itm['SplitByGap'].Value)
         .merge_by_gap(.10, max_words=3)
         .split_by_length(max_words=itm['MaxWords'].Value, max_chars=itm['MaxChars'].Value)
      )
   
   if itm['RefineSubs'].Checked == True:
      model.refine(location, result) # refine transcription to improve timing

   # Save transcription to SRT file   
   file_path = storagePath + 'audio.srt'
   result.to_srt_vtt(file_path, word_level=False) # save to SRT file
   print("Transcription Complete!")
   print("Subtitles saved to -> [", file_path, "]")
   
   # Move subtitles forward to start at markIn
   try:
      with open(file_path, 'r', encoding='utf-8') as f:
         original_content = f.read()
   except FileNotFoundError:
      print("There was an error transcribing the timeline!")
      itm['DialogBox'].Text = "Error: No subtitles were returned!"
      return

   markIn = markIn - timeline.GetStartFrame()
   # Adjust the timestamps in the SRT file to start at MarkIn (in seconds)
   time_delta = timedelta(seconds=markIn / frame_rate)
   print("Adjusting timestamps by", time_delta)
   adjusted_content = adjust_subtitle_timestamps(original_content, time_delta)

   # Write the adjusted content to the SRT file
   with open(file_path, 'w', encoding='utf-8') as f:
      f.write(adjusted_content)

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
      print("Track", itm['TrackSelector'].Value ,"does not exist - please select a track number in the range 1 -", timeline.GetTrackCount('video'))
      itm['DialogBox'].Text = "Error: track " + str(itm['TrackSelector'].Value) + " does not exist!"
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
   
   timelineStartFrame = timeline.GetStartFrame()
   frame_rate = int(timeline.GetSetting("timelineFrameRate")) # get timeline framerate

   # Create clip object for each line in the SRT file
   for i in range(0, len(lines), 4):
      start_time, end_time = lines[i+1].strip().split(" --> ")
      text = lines[i+2].strip() # get  subtitle text
      # Set start position of subtitle (in frames)
      hours, minutes, seconds_milliseconds = start_time.split(':')
      seconds, milliseconds = seconds_milliseconds.split(',')
      posInFrames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * frame_rate))
      timelinePos = timelineStartFrame + posInFrames
      #print("->", i//4+1, ":", text, " @ ", timelinePos, " frames")
      
      # Set duration of subtitle (in frames)
      hours, minutes, seconds_milliseconds = end_time.split(':')
      seconds, milliseconds = seconds_milliseconds.split(',')
      endPosInFrames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * frame_rate))
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
   templateText = mediaPoolItemsList[itm['Template'].CurrentIndex] # get selected Text+ template
   print(templateText.GetClipProperty()['Clip Name'], "selected as template")
   if not templateText:
      print("No Text+ found in Media Pool")
      itm['DialogBox'].Text = "No Text+ found in Media Pool!"
      return
   
   print("Adding template subtitles...")
   itm['DialogBox'].Text = "Adding template subtitles..."
   timelineTrack = itm['TrackSelector'].Value # set video track to add subtitles

   # Add template text to timeline (text not set yet)
   for i in range(len(subs)):
      timelinePos, duration, text = subs[i]
      if i < len(subs)-1 and subs[i+1][0] - (timelinePos + duration) < 200:   # if gap between subs is less than 10 frames
         duration = (subs[i+1][0] - subs[i][0]) - 1                           # then set current subtitle to end at start of next subtitle - 1 frame
      newClip = {
         "mediaPoolItem" : templateText,
         "startFrame" : 0,
         "endFrame" : duration,
         "trackIndex" : timelineTrack,
         "recordFrame" : timelinePos
      }
      mediaPool.AppendToTimeline( [newClip] ) # add text+ to timeline
   
   # Modify text content of Text+ clips
   print("Modifying subtitle text content...")
   itm['DialogBox'].Text = "Updating text content..."
   clipList = timeline.GetItemListInTrack('video', timelineTrack) # get list of Text+ in timeline
   #print("-> Found", len(clipList), "clips on the timeline")
   i = 0
   for count, clip in enumerate(clipList):
      if clip.GetStart() >= subs[0][0]: # check that this Text+ clip is within range of the subtitles being added
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
         i += 1 # move to text of next subtitle

   print("Subtitles added to timeline!")
   itm['DialogBox'].Text = "Subtitles added to timeline!"
   projectManager.SaveProject()
   OnPopulateSubs(ev) # populate subtitles in table view

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
   if clipList is None or len(clipList) == 0:
      itm["Tree"].Clear()
      itRow = itm["Tree"].NewItem()
      itRow.Text[0] = "No subtitles"
      itRow.Text[1] = "Select a video track that contains Text+ subtitles."
      itm["Tree"].AddTopLevelItem(itRow)
      return

   # Retrieve subtitles from the specified timeline track
   itm["Tree"].Clear()
   frame_rate = int(timeline.GetSetting("timelineFrameRate")) # get timeline framerate
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

# Save settings to file
def saveSettings():
   # create text file to store settings
   with open(storagePath + settingsName, 'w') as file:
      # Write settings to the file
      file.write('track=' + str(itm['TrackSelector'].Value) + '\n')
      file.write('model=' + str(itm['WhisperModel'].CurrentIndex) + '\n')
      file.write('outputMode=' + str(itm['SubsOutput'].CurrentIndex) + '\n')
      file.write('maxWords=' + str(itm['MaxWords'].Value) + '\n')
      file.write('maxChars=' + str(itm['MaxChars'].Value) + '\n')
      file.write('splitByGap=' + str(itm['SplitByGap'].Value) + '\n')
      file.write('censorList=' + str(itm['CensorList'].Text) + '\n')
      file.write('formatText=' + str(itm['FormatText'].CurrentIndex) + '\n')
      file.write('removePunc=' + str(itm['RemovePunc'].Checked) + '\n')

# Load settings from file
def loadSettings():
   if not os.path.exists(storagePath + settingsName):
      return

   # read settings from the text file
   with open(storagePath + settingsName, 'r') as file:
      settings = file.readlines()

   # parse the settings
   track = int(settings[0].split('=')[1].strip())
   model = int(settings[1].split('=')[1].strip())
   output_mode = int(settings[2].split('=')[1].strip())
   max_words = int(settings[3].split('=')[1].strip())
   max_chars = int(settings[4].split('=')[1].strip())
   split_by_gap = float(settings[5].split('=')[1].strip())
   censor_list = settings[6].split('=')[1].strip()
   format_text = int(settings[7].split('=')[1].strip())
   remove_punc = settings[8].split('=')[1].strip() == 'True'

   # use the settings as needed
   itm['TrackSelector'].Value = track
   itm['WhisperModel'].CurrentIndex = model
   itm['SubsOutput'].CurrentIndex = output_mode
   itm['MaxWords'].Value = max_words
   itm['MaxChars'].Value = max_chars
   itm['SplitByGap'].Value = split_by_gap
   itm['CensorList'].Text = censor_list
   itm['FormatText'].CurrentIndex = format_text
   itm['RemovePunc'].Checked = remove_punc

# Search Media Pool for Text+ template
mediaPoolItemsList = []
def searchMediaPool():
   mediaPool = project.GetMediaPool()
   folder = mediaPool.GetRootFolder()
   items = folder.GetClipList() # remove this?
   itm['Template'].Clear()
   recursiveSearch(folder)

CLIP_TYPES_LOCALE = [
   'Título – Fusion', # spanish
   "Título Fusion", # portuguese
   "Generator", # en-us? or version < v19
   "Fusion Title", # English
   "Titre Fusion", # French
   "Титры на стр. Fusion", # Russian
   "Fusion Titel", # German
   "Titolo Fusion", # Italian
   "Fusionタイトル", # Japanese
   "Fusion标题", # Chinese
   "퓨전 타이틀", # Korean
   "Tiêu đề Fusion", # Vietnamese
   "Fusion Titles", # Thai
]

def recursiveSearch(folder):
   items = folder.GetClipList()
   for item in items:
      itemType = item.GetClipProperty()["Type"]
      if itemType in CLIP_TYPES_LOCALE:
         itemName = item.GetName()
         clipName = item.GetClipProperty()['Clip Name']
         itm['Template'].AddItem(clipName)
         if re.search('text|Text|title|Title|subtitle|Subtitle', itemName) or re.search('text|Text|title|Title|subtitle|Subtitle', clipName):
            itm['Template'].CurrentIndex = len(mediaPoolItemsList) - 1 # set default template to Text+
         mediaPoolItemsList.append(item)
   subfolders = folder.GetSubFolderList()
   for subfolder in subfolders:
      recursiveSearch(subfolder)
   return

# Add the items to the FormatText ComboBox menu
itm['FormatText'].AddItem("None")
itm['FormatText'].AddItem("all lowercase")
itm['FormatText'].AddItem("ALL UPPERCASE")

# Add the items to the Transcription Model ComboBox menu
itm['WhisperModel'].AddItem("Recommended: Small")
itm['WhisperModel'].AddItem("Tiny - fastest / lowest accuracy")
itm['WhisperModel'].AddItem("Base")
itm['WhisperModel'].AddItem("Small")
itm['WhisperModel'].AddItem("Medium - slowest / highest accuracy")

# Add the items to the Subtitles Output ComboBox menu
itm['SubsOutput'].AddItem("English Only  ➞  Increase accuracy for English language")
itm['SubsOutput'].AddItem("Any Language  ➞  Subtitles in original language")
itm['SubsOutput'].AddItem("Translate to English  ➞  Any language to English")

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
win.On[winID].Close     = OnClose               # close window
win.On[addSubsID].Clicked  = OnGenerate         # generate Text+ subtitles on timeline (no transcription)
win.On[transcribeID].Clicked = AudioToSRT       # get SRT file (old: transcribe audio to SRT file)
win.On[executeAllID].Clicked = OnSubsGen        # transcribe + generate subtitles
win.On[browseFilesID].Clicked = OnBrowseFiles   # browse for custom subtitles file
win.On.Tree.ItemClicked = OnSubtitleSelect      # jump to subtitle position on timeline
win.On.RefreshSubs.Clicked = OnPopulateSubs     # refresh subtitles
# Note: there appears to be multiple ways to define event handlers

# Load settings from file
try:
   loadSettings()
except:
   print("Error loading settings - continuing with default settings...")
   
searchMediaPool() # Search media pool for possible templates

# Main dispatcher loop
win.Show()
dispatcher.RunLoop()
win.Hide()
