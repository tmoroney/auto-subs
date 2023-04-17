import re
import os
import time
import datetime
import DaVinciResolveScript as dvr

# Define the path to the subtitle file and the path to the DaVinci Resolve project file
subtitle_path = "/path/to/subtitle_file.srt"
project_path = "/path/to/project_file.drp"

# Initialize the DaVinci Resolve scripting API
resolve = dvr.scriptapp("Resolve")
projectManager = resolve.GetProjectManager()
project = projectManager.GetCurrentProject()

# Get the timeline and Fusion composition
timeline = project.GetCurrentTimeline()
fusion_comp = timeline.GetFusionComp()

# Get the "Subtitle" text+ object from the Media Pool
subtitle_clip = None
for item in project.GetMediaPool().GetRootFolder().GetClipList():
    if item.GetName() == "Subtitle":
        subtitle_clip = item
        break

if not subtitle_clip:
    print("Error: 'Subtitle' text+ object not found in the Media Pool")
    projectManager.CloseProject(project)
    exit()

# Read the subtitle file and create a list of subtitle objects
with open(subtitle_path, 'r') as f:
    content = f.read()
    subtitles = re.findall(r'(\d+)\n(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)\n(.+?)(?=\n\d+\n|$)', content, re.DOTALL)

# Define the pop-in effect keyframes
pop_in_effect = [
    {"frame": 0, "value": 0.9},
    {"frame": 4, "value": 1.05},
    {"frame": 7, "value": 1.0}
]

# Loop through the subtitle objects and add them to the timeline
for subtitle in subtitles:
    index = int(subtitle[0])
    start_time = datetime.datetime.strptime(subtitle[1], "%H:%M:%S,%f")
    end_time = datetime.datetime.strptime(subtitle[2], "%H:%M:%S,%f")
    text = subtitle[3]

    # Duplicate the "Subtitle" text+ object and set the new text
    new_subtitle = subtitle_clip.Duplicate()
    new_subtitle.SetClipProperty("TextPlus.Title", text)

    # Delete all keyframes from the Zoom property
    zoom_control = new_subtitle.GetInput("Zoom")
    zoom_control.RemoveKeyframeAt(0)

    # Add the pop-in effect keyframes to the Zoom property
    for keyframe in pop_in_effect:
        zoom_control.AddKeyframe(keyframe["frame"], keyframe["value"])

    # Calculate the start and end frames based on the start and end times of the subtitle
    start_frame = int(start_time.total_seconds() * timeline.GetFrameRate())
    end_frame = int(end_time.total_seconds() * timeline.GetFrameRate())

    # Set the in and out points of the new text+ object
    new_subtitle.SetInPoint(start_frame)
    new_subtitle.SetOutPoint(end_frame)

    # Add the new text+ object to the timeline
    timeline.InsertClip(new_subtitle)

    print(f"Added subtitle {index} to timeline")

# Save and close the project
project.Save()
projectManager.CloseProject(project)
