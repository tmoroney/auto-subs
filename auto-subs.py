import stable_whisper
import sys
import time
import re

# some element IDs
winID = "com.blackmagicdesign.resolve.AutoSubsGen"   # should be unique for single instancing
textID = "TextEdit"
addSubsID = "AddSubs"
transcribeID = "Transcribe"
executeAllID = "ExecuteAll"
browseFilesID = "BrowseButton"

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
   'Geometry': [ 100,100, 450, 780 ],
   'WindowTitle': "Resolve Auto Subtitle Generator",
   },
   ui.VGroup({"ID": "root",},[
      ui.Label({ 'Text': "Transcribe Using AI", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 22 }) }),
      ui.HGroup({'Weight': 0.0},[
         ui.VGroup({'Weight': 0.0, 'MinimumSize': [213, 50]},[
            ui.Label({ 'Text': "Max words per line", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
            ui.SpinBox({"ID": "MaxWords", "Min": 1, "Value": 5}),
         ]),
         ui.VGroup({'Weight': 0.0, 'MinimumSize': [212, 50]},[
            ui.Label({ 'Text': "Max characters per line", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
            ui.SpinBox({"ID": "MaxChars", "Min": 1, "Value": 18}),
         ]),
      ]),
      ui.VGap(0),
      ui.Label({ 'Text': "Transcription Model", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 })}),
      ui.ComboBox({"ID": "WhisperModel", 'MaximumSize': [2000, 30]}),
      ui.CheckBox({"ID": "EnglishOnly", "Text": "English Only Mode (more accurate)", "Checked": True}),
      ui.VGap(15),
      ui.Label({ 'Text': "Generate Text+ Subtitles", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 22 }) }),
      ui.VGap(0),
      ui.Label({ 'Text': "Select track to add subtitles", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
      ui.SpinBox({"ID": "TrackSelector", "Min": 1, "Value": 2}),
      ui.VGap(2),
      ui.Label({'ID': 'Label', 'Text': 'Use Custom Subtitles File ( .srt )', 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
      ui.HGroup({'Weight': 0.0, 'MinimumSize': [200, 30]},[
			ui.LineEdit({'ID': 'FileLineTxt', 'Text': '', 'PlaceholderText': 'Please Enter a filepath', 'Weight': 0.9}),
			ui.Button({'ID': 'BrowseButton', 'Text': 'Browse', 'Weight': 0.1}),
		]),
      ui.VGap(2),
      ui.Label({'ID': 'Label', 'Text': 'Censored Words (comma separated list)', 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
      ui.LineEdit({'ID': 'CensorList', 'Text': '', 'PlaceholderText': 'e.g. bombing = b***ing', 'Weight': 0, 'MinimumSize': [200, 30]}),
      ui.VGap(2),
      ui.Label({ 'Text': "Format Text", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 13 }) }),
      ui.ComboBox({"ID": "FormatText", 'MaximumSize': [2000, 30]}),
      ui.CheckBox({"ID": "RemovePunc", "Text": "Remove commas , and full stops .", "Checked": False}),
      ui.VGap(15),
      ui.Button({ 
         'ID': executeAllID,
         'Text': "  Generate Subtitles", 
         'MinimumSize': [150, 35],
         'MaximumSize': [1000, 35], 
         'IconSize': [17, 17], 
         'Font': ui.Font({'PixelSize': 15}),
         'Icon': ui.Icon({'File': 'AllData:../Support/Developer/Workflow Integrations/Examples/SamplePlugin/img/logo.png'}),}),
      ui.VGap(2),
      ui.HGroup({'Weight': 0.0,},[
         ui.Button({ 'ID': transcribeID, 'Text': "Transcribe to Subitles File", 'MinimumSize': [150, 35], 'MaximumSize': [1000, 35], 'Font': ui.Font({'PixelSize': 13}),}),
         ui.Button({ 'ID': addSubsID, 'Text': "Regenerate Timeline Text", 'MinimumSize': [150, 35], 'MaximumSize': [1000, 35], 'Font': ui.Font({'PixelSize': 13}),}),
      ]),
      ui.VGap(40),
      ui.Label({ 'ID': 'DialogBox', 'Text': "Waiting for Task", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 20 }), 'Alignment': { 'AlignHCenter': True } }),
      ui.VGap(40)
      ])
   )

itm = win.GetItems()
#itm['WhisperModel'].SetCurrentText("small") # set default model to small

# Event handlers
def OnClose(ev):
   dispatcher.ExitLoop()

def OnBrowseFiles(ev):
	selectedPath = fusion.RequestFile()
	if selectedPath:
		itm['FileLineTxt'].Text = str(selectedPath)
                
# Transcribe + Generate Subtitles on Timeline
def OnSubsGen(ev):
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

   # RENDER AUDIO
   projectManager = resolve.GetProjectManager()
   project = projectManager.GetCurrentProject()
   project.LoadRenderPreset('H.265 Master')
   project.SetRenderSettings({"SelectAllFrames": 0, "CustomName": "audio", "TargetDir": storagePath, "AudioCodec": "mp3", "ExportVideo": False, "ExportAudio": True})
   pid = project.AddRenderJob()
   project.StartRendering(pid)
   print("Rendering Audio for Transcription...")
   itm['DialogBox'].Text = "Rendering Audio for Transcription..."
   while project.IsRenderingInProgress():
      time.sleep(1)
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
   resolve.OpenPage("edit")
   itm['DialogBox'].Text = "Transcription Complete!"
   print("Subtitles saved to -> [", file_path, "]")




# Generate Text+ Subtitles on Timeline
def OnGenerate(ev):
   projectManager = resolve.GetProjectManager()
   project = projectManager.GetCurrentProject()
   mediaPool = project.GetMediaPool()
   folder = mediaPool.GetRootFolder()
   items = folder.GetClipList()

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
      if itm['TrackSelector'].Value > timeline.GetTrackCount('video'):
         print("Track not found - Please select a valid track")
         itm['DialogBox'].Text = "Please select a valid track!"
         return
      
      if itm['FileLineTxt'].Text != '': # use custom subtitles file
         file_path = r"{}".format(itm['FileLineTxt'].Text)
         print("Using custom subtitles from -> [", file_path, "]")
      else:
         file_path = storagePath + 'audio.srt' # use generated subtitles file at default location
      
      # READ SRT FILE
      try:
         with open(file_path, 'r') as f:
            lines = f.readlines()
      except FileNotFoundError:
         print("No subtitles file (audio.srt) found - Please Transcribe the timeline or load your own SRT file!")
         itm['DialogBox'].Text = "No subtitles file found!"
         return

      # PARSE SRT FILE
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

      # CREATE CLIPS FROM SRT FILE
      if len(lines) < 4:
         print("No subtitles found in SRT file")
         itm['DialogBox'].Text = "No subtitles found in SRT file!"
         return

      timelineStartFrame = timeline.GetStartFrame() # get timeline start frame
      #print("-> Start of timeline: ", timelineStartFrame)
      for i in range(0, len(lines), 4):
         frame_rate = timeline.GetSetting("timelineFrameRate") # get timeline framerate
         start_time, end_time = lines[i+1].strip().split(" --> ")
         text = lines[i+2].strip() # get  subtitle text

         # Convert timestamps to frames for position of subtitle
         hours, minutes, seconds_milliseconds = start_time.split(':')
         seconds, milliseconds = seconds_milliseconds.split(',')
         posInFrames = int(round((int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds) / 1000) * round(frame_rate)))
         timelinePos = timelineStartFrame + posInFrames
         #print("->", i//4+1, ":", text, " @ ", timelinePos, " frames")

         # Set duration of subtitle in frames
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

         if checkCensor: # check for words to censor
            for swear in swear_words:
               if censorSound is not None:
                  words = text.split()
                  wordCount = len(words)
                  for i, word in enumerate(words):
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
      foundText = False
      for item in items:
         itemName = item.GetName();
         if itemName == "Text+" or itemName == "Fusion Title" : # Find Text+ in Media Pool
            foundText = True
            print("Found Text+ in Media Pool!")
            print("Adding template subtitles...")
            itm['DialogBox'].Text = "Adding template subtitles..."
            timelineTrack = itm['TrackSelector'].Value # set video track to add subtitles
            for i in range(len(subs)):
               timelinePos, duration, text = subs[i]
               if i < len(subs)-1 and subs[i+1][0] - (timelinePos + duration) < 200: # if gap between subs is less than 10 frames
                  duration = (subs[i+1][0] - subs[i][0]) - 1 # set duration to next start frame -1 frame
               newClip = {
                  "mediaPoolItem" : item,
                  "startFrame" : 0,
                  "endFrame" : duration,
                  "trackIndex" : timelineTrack,
                  "recordFrame" : timelinePos
               }
               mediaPool.AppendToTimeline( [newClip] ) # add template Text+ to timeline (text not set yet)
            projectManager.SaveProject()
            
            subList = timeline.GetItemListInTrack('video', timelineTrack) # get list of Text+ in timeline
            print("Modifying subtitle text content...")
            itm['DialogBox'].Text = "Updating text content..."
            for i, sub in enumerate(subList):
               sub.SetClipColor('Orange')
               text = subs[i][2]
               comp = sub.GetFusionCompByIndex(1) # get fusion comp from Text+
               if (comp is not None):
                  toollist = comp.GetToolList().values() # get list of tools in comp
                  for tool in toollist:
                     if tool.GetAttrs()['TOOLS_Name'] == 'Template' : # find Template tool
                        comp.SetActiveTool(tool)
                        tool.SetInput('StyledText', text)
                  sub.SetClipColor('Teal')
               if i == len(subList)-1:
                  print("Updated text content for", i+1, "subtitles")
                  break
            print("Subtitles added to timeline!")
            break # only execute once if multiple Text+ in Media Pool
      if not foundText:
         print("No Text+ found in Media Pool")
   projectManager.SaveProject()
   itm['DialogBox'].Text = "Subtitles added to timeline!"

# Add the items to the FormatText ComboBox menu
itm['FormatText'].AddItem("None")
itm['FormatText'].AddItem("All Lowercase")
itm['FormatText'].AddItem("All Uppercase")

# Add the items to the Transcription Model ComboBox menu
itm['WhisperModel'].AddItem("Recommended: small")
itm['WhisperModel'].AddItem("tiny - fastest / lowest accuracy")
itm['WhisperModel'].AddItem("base")
itm['WhisperModel'].AddItem("small")
itm['WhisperModel'].AddItem("medium - slowest / highest accuracy")

# assign event handlers
win.On[winID].Close     = OnClose
win.On[addSubsID].Clicked  = OnGenerate
win.On[transcribeID].Clicked = AudioToSRT
win.On[executeAllID].Clicked = OnSubsGen
win.On[browseFilesID].Clicked = OnBrowseFiles

# Main dispatcher loop
win.Show()
dispatcher.RunLoop()
