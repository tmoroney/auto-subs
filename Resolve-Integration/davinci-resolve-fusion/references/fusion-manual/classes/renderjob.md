> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

# RenderJob

class RenderJob
Parent class: Object
Represents a RenderJob.

RenderJob Attributes

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  RJOBS_Status | string | The current status of the job as String.  |
|  RJOBB_Resumable | boolean |   |
|  RJOBS_CompEndScript | string |   |
|  RJOBN_CompID | number |   |
|  RJOBS_QueuedBy | string |   |
|  RJOBB_IsRemoving | boolean |   |
|  RJOBB_Paused | boolean | Indicates if the Job is paused.  |
|  RJOBS_Name | string | The filename of the Job.  |
|  RJOBB_DontClose | boolean |   |
|  RJOBN_TimeOut | number | The timeout of the job in minutes.  |
|  RJOBN_Status | number | Legacy status indicator for scripts that were reliant on the old numeric index for job status.
0. Not Rendered
1. Incomplete
2. Done
3. Failed
4. Paused
5. Submitted
6. Rendering
7. Aborting  |
|  RJOBN_RenderingFrames | number | The number of currently rendering frames.  |
|  RJOBN_RenderedFrames | number | The number of frames rendered in the job.  |
|  RJOBID_ID | string | The UUID of the job for Fusion's internal tracking.  |

→ Python usage:

```python
# Adds the current composition as new job
# and print all RenderJobs in Queue.
qm = fusion.RenderManager
qm.AddJob(comp.GetAttrs()["COMPS_FileName"])
joblist = qm.GetJobList().values()
for job in joblist:
print(job.GetAttrs()["RJOBS_Name"])
```

→ Lua usage:

```txt
-- Adds the current composition as new job
-- and print all RenderJobs in Queue.
qm = fusion.RenderManager
qm.AddJob(comp.GetAttrs().COMPS_FileName)
joblist = qm.GetJobList()
for i, job in pairs(joblist) do
print(job.GetAttrs().RJOBS_Name)
end
```

# Methods

RenderJob.ClearCompletedFrames()

Clears the list of completed frames, restarting the render.

RenderJob.GetFailedSlaves()

Lists all slaves that failed this job.

This function returns a table containing all slaves that were assigned to this job but have been unable to load the comp, or to render a frame that was assigned to them.

These slaves are no longer participating in the job, but can be added back to the job by using RetrySlave().

→ Returns: failedslaves
→ Return type: table

RenderJob.GetFrames()
Returns the total set of frames to be rendered.
→ Returns: frames
→ Return type: string

RenderJob.GetRenderReport()
GetRenderReport

RenderJob.GetSlaveList()
Gets a table of slaves assigned to this job.
→ Returns: slaves
→ Return type: table

RenderJob.GetUnrenderedFrames()
Returns the remaining frames to be rendered.

The frames in the returned string is separated by commas. Contiguous frames are given as a range in the form <first>.<last>.

→ Returns: frames
→ Return type: string

RenderJob.IsRendering()
Returns true if job is currently rendering.
→ Returns: rendering
→ Return type: boolean

RenderJob.RetrySlave([slave])
Attempts to reuse slaves that have previously failed.

The job manager will place them back on the active list for the job, and attempt to assign frames to them again.

slave a RenderSlave object, assigned to this job, that has previously failed to render a frame assigned to it. If slave is not specified, all failed slaves will be retried.

→ Parameters:
slave (RenderSlave) – slave

FUSION SCRIPTING GUIDE AND REFERENCE MANUAL</last></first>

RenderJob.SetFrames(frames)

Specifies the set of frames to render.

frames a string with valid formatting for frames to be rendered by the job. Frame numbers should be separated by commas, without spaces, and ranges of frames are denoted by <first>.<last>.

→ Python usage:

```python
# Set the frames to render on the first job in queue
job = fusion.RenderManager.GetJobList()[1]
job.SetFrames("1..50,55,60,75,80..100")
```

→ Lua usage:

```txt
-- Set the frames to render on the first job in queue
job = fusion.RenderManager:GetJobList()[1]
job.SetFrames("1..50,55,60,75,80..100")
```

→ Parameters:

frames (string) - frames

RenderJob._Heartbeat()

_Heartbeat
