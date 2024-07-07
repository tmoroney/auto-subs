# NOTE: This script is a simplified version of the original script with AI transcription removed. No additional packages are required to run this script.
# You are only able to add subtitles to the timeline from a custom SRT file using this script.

import sys
import time
import re

# some element IDs
winID = "com.blackmagicdesign.resolve.AutoSubsGen"   # should be unique for single instancing
textID = "TextEdit"
trackID = "TrackSelector"
addSubsID = "AddSubs"
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
   'Geometry': [ 100, 100, 450, 500 ],
   'WindowTitle': "Generate Text+ Subtitles from SRT File",
   },
   ui.VGroup([
      ui.Label({ 'Text': "Generate Subtitles from SRT File", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 20 }) }),
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
      ui.VGap(4),
      ui.Button({ 'ID': addSubsID,  'Text': "Add Subtitles to Timeline", 'MinimumSize': [150, 25], 'MaximumSize': [1000, 30]}),
      ui.VGap(40),
      ui.Label({ 'ID': 'DialogBox', 'Text': "Waiting for Task", 'Weight': 0, 'Font': ui.Font({ 'PixelSize': 20 }), 'Alignment': { 'AlignHCenter': True } }),
      ui.VGap(40)
      ])
   )

itm = win.GetItems()

# Event handlers
def OnClose(ev):
   dispatcher.ExitLoop()

def OnBrowseFiles(ev):
	selectedPath = fusion.RequestFile()
	if selectedPath:
		itm['FileLineTxt'].Text = str(selectedPath)

def OnAddSubs(ev):
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
         with open(file_path, 'r', -1, 'utf-8') as f:
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

# assign event handlers
win.On[winID].Close     = OnClose
win.On[addSubsID].Clicked  = OnAddSubs
win.On[browseFilesID].Clicked = OnBrowseFiles

# Main dispatcher loop
win.Show()
dispatcher.RunLoop()
