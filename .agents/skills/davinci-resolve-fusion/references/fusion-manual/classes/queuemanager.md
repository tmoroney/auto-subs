> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## QueueManager

class QueueManager
Parent class: LockableObject
Represents the QueueManager.

QueueManager Attributes

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  RQUEUE_B_Paused | boolean | True if rendering is currently paused, and no jobs are being rendered.  |
|  RQUEUE_B_Verbose | boolean | True if Verbose Logging is currently enabled.  |
|  RQUEUES_QueueName | string | The name of the file the queue has been loaded from, or saved to, if any.  |

→ Python usage:

```txt
# Access to the QueueManager
qm = fusion.RenderManager
```

→ Lua usage:

```txt
-- Access to the QueueManager
qm = fusion.RenderManager
```

## Methods

QueueManager.AddItem()

AddItem

QueueManager.AddJob(filename[, groups][, frames][, endscript])

Note: This method is overloaded and has alternative parameters. See other definitions.

Adds a job to the list.

This function allows a user to add jobs remotely to the Fusion Render Manager, either through a standalone script or through the Fusion interface. This is potentially useful for the batch adding of jobs.

filename A valid path for a job to be added to the render manager.

groups A string listing the slave groups (comma separated) to render this job on. Defaults to "all".

frames The set of frames to render, e.g. "1..150,155,160". If nil or unspecified, the comp's saved frame range will be used.

endscript Full pathname of a script to be executed when this job has completed (available from the RenderJob object as the RJOBS_CompEndScript attribute).

Returns the RenderJob object just created in the queue manager.

→ Parameters:
- filename (string) – filename
- groups (string) – groups
- frames (string) – frames
- endscript (string) – endscript

→ Returns: job
→ Return type: RenderJob

QueueManager.AddJob(args)

Note: This method is overloaded and has alternative parameters. See other definitions.

Adds a job to the list.

This function allows a user to add jobs remotely to the Fusion Render Manager, either through a standalone script or through the Fusion interface. This is potentially useful for the batch adding of jobs.

filename A valid path for a job to be added to the render manager.

groups A string listing the slave groups (comma separated) to render this job on. Defaults to "all".

frames The set of frames to render, e.g. "1..150,155,160". If nil or unspecified, the comp's saved frame range will be used.

endscript Full pathname of a script to be executed when this job has completed (available from the RenderJob object as the RJOBS_CompEndScript attribute).

Returns the RenderJob object just created in the queue manager.

→ Parameters:
- args (table) – args
→ Returns: job
→ Return type: RenderJob

QueueManager.AddSlave(name[, groups][, unused])

Adds a slave to the slave list.

This function allows a user to add jobs remotely to the Fusion Render Manager, either through a standalone script or through the Fusion interface. This is potentially useful for the batch adding of jobs.

name the slave's hostname or IP address.

groups the render groups to join (this defaults to "all").

The RenderSlave object just created in the queue manager.

→ Parameters:
name (string) – name
groups (string) – groups
unused (boolean) – unused

→ Returns: slave
→ Return type: RenderSlave

QueueManager.AddWatch()
AddWatch

QueueManager.DeleteItem()
Deleteltem

QueueManager.GetGroupList()
Get a list of all slave groups.
Returns a table of all the various groups used by the slaves within this QueueManager.

→ Returns: groups
→ Return type: table

QueueManager.GetID()
GetID

QueueManager.GetItemList()
GetItemList

QueueManager.GetJobFromID()
GetJobFromID

QueueManager.GetJobList()
Get the list of jobs to render.
Returns a table with RenderJob objects that represent the jobs currently in the queue manager. Like any other object within Fusion, these objects have attributes that indicate information about the status of the object, and functions that can query or manipulate the object.

→ Python usage:

```python
# Print all RenderJobs in Queue.
qm = fusion.RenderManager
joblist = qm.GetJobList().values()
for job in joblist:
print(job.GetAttrs()["RJOBS_Name"])
```

→ Lua usage:

```txt
-- Print all RenderJobs in Queue.
qm = fusion.RenderManager
joblist = qm:GetJobList()
for i, job in pairs(joblist) do
print(job:GetAttrs().RJOBS_Name)
end
```

→ Returns: jobs
→ Return type: table

QueueManager.GetJobs()
Get tables with current RenderJob information.

QueueManager.GetRootData()
GetRootData

QueueManager.GetSchemaList()
GetSchemaList

QueueManager.GetSlaveFromID()
GetSlaveFromID

QueueManager.GetSlaveList()
Get the list of available slaves.

This function returns a table with RenderSlave objects that represent
the slaves currently listed in the queue manager.

→ Python usage:

```python
# Print all RenderSlaves in Queue.
qm = fusion.RenderManager
slavelist = qm.GetSlaveList().values()
for slave in slavelist:
print(slave.GetAttrs()["RSLVS_Name"])
```

→ Lua usage:

```txt
-- Print all RenderSlaves in Queue.
qm = fusion.RenderManager
slavelist = qm:GetSlaveList()
for i, slave in pairs(slavelist) do
print(slave:GetAttrs().RSLVS_Name)
end
```

→ Returns: slaves
→ Return type: table

QueueManager.GetSlaves()

Get tables with current RenderSlave information.

QueueManager.LoadQueue(filename)

Loads a list of jobs to do.

This function allows a script to load a Fusion Studio Render Queue file, containing a list of jobs to complete, into the queue manager.

filename path to the queue to load.

→ Parameters:

filename (string) – filename

QueueManager.LoadSlaveList([filename])

Loads a list of slaves to use.

→ Parameters:
filename (string) – filename

→ Returns: success
→ Return type: boolean

QueueManager.Log(message)

Writes a message to the Render Log.

Write messages to the render manager’s log. This is useful for triggering custom notes for compositions submitted to the manager.

→ Parameters:
message (string) – message

QueueManager.MoveJob(job, offset)

Moves a job up or down the list.

Changes the priority of jobs in the render manager by an offset.

job the RenderJob to move.

offset how far up or down the job list to move it (negative numbers will move it upwards).

→ Python usage:

```python
# Moves all jobs called "master" to the top of the queue
# or at least up one hundred entries.
qm = fusion.RenderManager
jl = qm.GetJobList().values()
for job in jl:
if "master" in job.GetAttrs()["RJOBS_Name"]:
qm.MoveJob(job,-100)
```

→ Lua usage:

```txt
-- Moves all jobs called "master" to the top of the queue
-- or at least up one hundred entries.
```

```txt
qm = fusion.RenderManager
jl = qm:GetJobList()
for i, job in pairs(jl) do
if job:GetAttrs().RJOBS_Name:find("master") then
qm:MoveJob(job,-100)
end
end
```

→ Parameters:
```
job (RenderJob) – job
offset (number) – offset
```

QueueManager.NetJoinRender()
```txt
NetJoinRender
```

QueueManager.RemoveJob(job)
Removes a job from the list.

→ Parameters:
```
job (RenderJob) – job
```

QueueManager.RemoveSlave(slave)
Note: This method is overloaded and has alternative parameters. See other definitions.
Removes a slave from the slave list.

→ Parameters:
```
slave (RenderSlave) – slave
```

QueueManager.RemoveSlave(slave)
Note: This method is overloaded and has alternative parameters. See other definitions.
Removes a slave from the slave list.

→ Parameters:
```
slave (string) – slave
```

QueueManager.RemoveWatch()
RemoveWatch

QueueManager.SaveQueue(filename)
Saves the current list of jobs.
filename the location to save the queue in.
This function save the currently loaded queue in the render manager to a file.
→ Parameters:
filename (string) – filename

QueueManager.SaveSlaveList([filename])
Saves the current list of slaves.
→ Parameters:
filename (string) – filename
→ Returns: success
→ Return type: boolean

QueueManager.ScanForSlaves()
Scans local network for new slaves.
This function locates all machines on the local network (local subnet only), queries each to find out if they are currently running a copy of Fusion then adds them to the manager's Slaves list.

QueueManager.Start()
Start

QueueManager.Stop()
Stop

QueueManager.UpdateItem()
UpdateItem
