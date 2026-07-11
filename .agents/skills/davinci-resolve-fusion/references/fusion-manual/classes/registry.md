> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## Registry

Registry

class Registry
Represents the registry.

Registry Attributes

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  REGS_Name | string | Specifies the full name of the class represented by this registry entry.  |
|  REGS_ScriptName | boolean | Specifies the scripting name of the class represented by this registry entry. If not specified, the full name defined by REGS_Name is used.  |
|  REGS_HelpFile | string | The help file and ID for the class.  |
|  REGI_HelpID | integer | The help file and ID for the class.  |
|  REGI_HelpTopicID | integer | The help file and ID for the class.  |
|  REGS_OplconString | boolean | Specifies the toolbar icon text used to represent the class.  |
|  REGS_OpDescription | integer | Specifies a description of the class.  |
|  REGS_OpToolTip | boolean | Specifies a tooltip for the class to provide a longer name or description.  |
|  REGS_Category | integer | Specifies the category for the class, defining a position in the Tools menu for tool classes.  |
|  REGI_ClassType REGI_ClassType2 | integer | Specifies the type of this class, based on the classtype constants.  |
|  REGI_ID | string | A unique ID for this class.  |
|  REGI_OplconID | string | A resource ID for a bitmap to be used for toolbar images for this class.  |
|  REGB_OpNoMask | integer | Indicates if this Tool class cannot deal with being masked.  |

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  REGI_DataType | string table | Specifies a data type RegID dealt with by this class.  |
|  REGI_TileID | number | Specifies a resource ID used for the tile image by this class.  |
|  REGB_CreateStaticPreview | integer | Indicates that a preview object is to be created at startup of this type.  |
|  REGB_CreateFramePreview | boolean | Indicates that a preview object is to be created for each new frame window.  |
|  REGB_Preview_CanDisplayImage | boolean | Defines various capabilities of a preview class.  |
|  REGB_Preview_CanCreateAnim  |   |   |
|  REGB_Preview_CanPlayAnim  |   |   |
|  REGB_Preview_CanSaveImage  |   |   |
|  REGB_Preview_CanSaveAnim  |   |   |
|  REGB_Preview_CanCopyImage  |   |   |
|  REGB_Preview_CanCopyAnim  |   |   |
|  REGB_Preview_CanRecord  |   |   |
|  REGB_Preview_UsesFilenames  |   |   |
|  REGB_Preview_CanNetRender  |   |   |
|  REGI_Version | integer | Defines the version number of this class or plugin.  |
|  REGI_PI_DataSize | number | Defines a custom data size for AEPlugin classes.  |
|  REGB_Unpredictable | string | Indicates if this tool class is predictable or not. Predictable tools will generate the same result given the same set of input values, regardless of time.  |
|  REGI_InputDataType | integer | Specifies a data type RegID dealt with by the main inputs of this class.  |

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  REGB_OperatorControl | integer | Indicates if this tool class provides custom overlay control handling.  |
|  REGB_Source_GlobalCtrls | number | Indicates if this source tool class has global range controls.  |
|  REGB_Source_SizeCtrls | integer | Indicates if this source tool class has image resolution controls.  |
|  REGB_Source_AspectCtrls | integer | Indicates if this source tool class has image aspect controls..  |
|  REGB_NoAutoProxy | boolean | Indicates if this tool class does not want things to be auto-proxied when it is adjusted.  |
|  REGI_Logo | boolean | Specifies a resource ID of a company logo for this class.  |
|  REGI_Priority | boolean | Specifies the priority of this class on the registry list.  |
|  REGB_NoBlendCtrls | boolean | Indicates if this tool class does not have blend controls.  |
|  REGB_NoObjMatCtrls | boolean | Indicates if this tool class does not have Object/Material selection controls.  |
|  REGB_NoMotionBlurCtrls | boolean | Indicates if this tool class does not have Motion Blur controls.  |
|  REGB_NoAuxChannels | boolean | Indicates if this tool class cannot deal with being given Auxiliary channels (such as Z, ObjID, etc)  |
|  REGB_EightBitOnly | boolean | Indicates if this tool class cannot deal with being given greater than 8 bit per channel images.  |
|  REGB_ControlView | boolean | Indicates if this class is a control view class.  |

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  REGB_NoSplineAnimation | boolean | Specifies that this data type (parameter class) cannot be animated using a spline.  |
|  REGI_MergeDataType | integer | Specifies what type of data this merge tool class is capable of merging.  |
|  REGB_ForceCommonCtrl | boolean | Forces the tool to have common controls like motion blur, blend etc, even on modifiers.  |
|  REGB_Particle_ProbabilityCtrl | boolean | Specifies that particle tools should have (or not have) various standard sets of controls.  |
|  REGB_Particle_SetCtrl  |   |   |
|  REGB_Particle_AgeRangeCtrl  |   |   |
|  REGB_Particle_RegionCtrl  |   |   |
|  REGB_Particle_RegionModeCtrl  |   |   |
|  REGB_Particle_StyleCtrl  |   |   |
|  REGB_Particle_EmitterCtrl  |   |   |
|  REGB_Particle_RandomSeedCtrl  |   |   |
|  REGI_Particle_DefaultRegion | integer | Specifies the RegID of a default Region for this particle tool class.  |
|  REGI_Particle_DefaultStyle | integer | Specifies the RegID of a default Style for this particle tool class.  |
|  REGI_MediaFormat_Priority | integer | Specifies the priority of a media format class.  |
|  REGS_MediaFormat_FormatName | string | Specifies the name of a media format class  |
|  REGST_MediaFormat_Extension | string | Specifies the extensions supported by a media format class  |

|  Attribute Name | Type | Description  |
| --- | --- | --- |
|  REGB_MediaFormat_CanLoad | boolean | Specify various capabilities of a media format class  |
|  REGB_MediaFormat_CanSave |  |   |
|  REGB_MediaFormat_CanLoadMulti |  |   |
|  REGB_MediaFormat_CanSaveMulti |  |   |
|  REGB_MediaFormat_WantsIOClass |  |   |
|  REGB_MediaFormat_LoadLinearOnly |  |   |
|  REGB_MediaFormat_SaveLinearOnly |  |   |
|  REGB_MediaFormat_CanSaveCompressed |  |   |
|  REGB_MediaFormat_OneShotLoad |  |   |
|  REGB_MediaFormat_OneShotSave |  |   |
|  REGB_MediaFormat_CanLoadImages |  |   |
|  REGB_MediaFormat_CanSaveImages |  |   |
|  REGB_MediaFormat_CanLoadAudio |  |   |
|  REGB_MediaFormat_CanSaveAudio |  |   |
|  REGB_MediaFormat_CanLoadText |  |   |
|  REGB_MediaFormat_CanSaveText |  |   |
|  REGB_MediaFormat_CanLoadMIDI |  |   |
|  REGB_MediaFormat_CanSaveMIDI |  |   |
|  REGB_MediaFormat_ClipSpecificInputValues |  |   |
|  REGB_MediaFormat_WantsUnbufferedIOClass |  |   |
|  REGB_ImageFormat_CanLoadFields | boolean | Specify various capabilities of an image format class  |
|  REGB_ImageFormat_CanSaveField |  |   |
|  REGB_ImageFormat_CanScale |  |   |
|  REGB_ImageFormat_CanSave8bit |  |   |
|  REGB_ImageFormat_CanSave24bit |  |   |
|  REGB_ImageFormat_CanSave32bi |  |   |

# Members

Registry.ID
ID of this Registry node (read-only).
→ Getting:
id = Registry.ID – (string)

Registry.Name
Friendly name of this Registry node (read-only).
→ Getting:
name = Registry.Name – (string)

Registry.Parent
Parent of this Registry node (read-only).
→ Getting:
parent = Registry.Parent – (Registry)

# Methods

Registry.IsClassType()
Returns whether a tool's ID or any of its parent's IDs is a particular Registry ID.
→ Returns: matched
→ Return type: boolean

Registry.IsRegClassType()
Returns whether a tool is a particular Registry ClassType.
→ Returns: matched
→ Return type: boolean
