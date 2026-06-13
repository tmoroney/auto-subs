Fusion Transitions
------------------

Fusion transitions are templates built using Fusion tools. This added functionality gives you the freedom to create custom looks and designs that are traditionally not available on the Edit and Cut pages. Creating these templates can be done within Resolve's Fusion page, and when saved as a macro, your custom templates can be accessed on the Edit or Cut pages ready for use. 

For more information about creating macros refer to Chapter 59 of the manual. 

When creating a Fusion transition it's important to know that the animation and duration will be driven by the transition curve and edit length on the Edit & Cut pages. Fusion transitions animated with normal fixed-time keyframes will not adapt to other edit durations, so it's recommended to use adaptable modifiers such as Anim Curves instead.

When building a transition, instead of clicking the keyframe diamond on controls you want to animate, add the Anim Curves modifier with the "Modify With" item on the control's right-click context menu. This will create simple linear animation over the duration of the transition, which you can then customize using the controls in the Modifiers tab of the Inspector. Various preset and customizable curves are available, with options for scaling the values and timing of the curve. See the Anim Curves Modifier section below for more details.


Building a Transition
---------------------

As an example, to create a simple cross dissolve, do the following:

	1. Add a Fusion Composition to the Edit page timeline
	2. Add a Dissolve tool to the Flow
	3. In the Inspector, right-click on the Background/Foreground control, then select Anim Curves from the list of modifiers (choose Modify With > Anim Curves). Adding this modifier to the Background/Foreground control will cause the slider animation to adapt to the transition duration back on the Edit/Cut page.
	3a. Optionally, to give the dissolve some easing, click the Modifiers tab at the top of the Inspector, open the Anim Curves controls, then set the Curve control to Easing, and choose an ease-in curve type from the In dropdown control.
	4. In the Nodes view, right-click on the Dissolve tool, and select Macro > Create Macro
	5. When creating a macro that's to be used as a Fusion transition, it's important to ensure that two image inputs and one output are selected in the Macro Editor. In this example, under the tool Dissolve, check that the Output, Background and Foreground check boxes are enabled.
	5a. Optionally, other controls may be enabled. These will be available in the Edit page Inspector.
	6. Give the transition a name, then use the top File menu to save the macro. See the Template Paths section below for the proper location.
	8. Restart Resolve to refresh the templates lists.
	9. On the Edit page, open the Effects Library. Navigate to Toolbox > Video Transitions > Fusion Transitions, and there you'll see the custom Fusion transition. Click and drag it to an edit point.

Selecting the transition will show any available controls for customization in the Inspector. It is also possible to make deeper changes to the transition's tools by right-clicking on the transition, and selecting "Open in Fusion Page".

Choose "Create Transition Preset" from the transition's context menu to save all control and tool changes as a User preset transition, for later use in the Edit or Cut pages.

Tip: When saving the macro, use "Save As Group..." to create a macro that can be opened within the Fusion Nodes view, allowing changes to its internal tools.


Fusion Generators
-----------------

Similar to Fusion transitions, generators are templates created from a macro, but with no image inputs, and a single image output. Generators can be created from Fusion generator tools such as Background or Fast Noise, or 3D rendered scenes, particles etc, or any combination of Fusion and ResolveFX tools.

As with transitions, it is recommended that the Anim Curves modifier be used for any animation, instead of fixed keyframes. This enables any animation in the generator to adapt to the duration on the Edit and Cut pages. See the Anim Curve Modifier section below for details.


Fusion Titles
-------------

Titles are a special case of Generator that create text. Either Text+ or Text3D tools may be used as desired, along with other Fusion and ResolveFX tools. Most title templates have the text tool's "Styled Text" control exposed when creating the macro, so that users may supply their own text in the Edit Inspector. Exposing the Font, Style, and Size controls may be desirable too, along with Color controls from the Shading tab and any other relevent controls.

Likewise, it is recommended that the Anim Curves modifier be used for any animation, instead of fixed keyframes. This enables any animation in the title template to adapt to the duration on the Edit and Cut pages. See the Anim Curve Modifier section below for details.


Fusion Effects
--------------

Effects are a template with a single image input and a single output. Similar to an Adjustment Layer, they can apply any desirable effect to the clip they are applied to, but with exposed controls for customization, and with animation that adapts to the duration of the effect. Additionally, multiple Fusion Effects may be applied to a single clip, and re-ordered as desired. To edit the controls of a Fusion Effect, select the clip it is applied to, then click the Effects tab in the Edit page Inspector.

As with other templates, it is recommended that the Anim Curves modifier be used for any animation, instead of fixed keyframes. This enables any animation in the effect to adapt to the duration on the Edit and Cut pages. See the Anim Curve Modifier section below for details.


Bundled Assets
--------------

As of 17.2, Resolve allows various asset files to be included and used with your template. This includes image files of some supported formats (PNG, JPG, EXR, TGA, BMP) for logos, watermarks, particles etc, 3D objects and cameras in an FBX file, and LUTs. These can be used with Fusion tools including Loader, FBX Mesh 3D, and File LUT. For ease of portability and user installation, the new "Setting:" path map has been provided, which is valid inside templates and other macros & tool groups that have been loaded from a .setting file, and points to the same folder that the .setting file is in.

For example, a Loader set to "Setting:leaf.jpg" could provide an image source for a particle system, so long as the leaf.jpg file was in the same folder as the template .setting file containing the Loader, or an FBX Mesh tool could use "Setting:Models/object.fbx" to get an object from a Models subfolder.


The Anim Curves Modifier
------------------------

The Anim Curves modifier is designed to allow easy creation of animation for transition and effect templates, and will speed up and slow down automatically to match the edit duration. It can also take the Edit page's Transition Curve easing into account, giving greater control to editors. It offers many preset curve shapes and combinations, including fully customized, with controls for scaling and timing the animation as well.

To use this animation modifier, right-click on a control in the Inspector, then select Anim Curves from the list of modifiers (choose Modify With > Anim Curves).

Anim Curves Controls:

- Source: allows the following timing choices:
  * Duration:   Animation is timed to match the duration of the edit
  * Transition: Like Duration, but values are shaped by the Edit page's Transition Curve
  * Custom:     Timing can be controlled manually by a spline or other modifier on the revealed Input control
  
- Curve: allows the following curve shape choices:
  * Linear:     Simple linear animation
  * Easing:     Allows selection from a number of preset curve shapes, for ease-in, ease-out, or both:
    - None (linear or no easing)
	- Sine
	- Quad
	- Cubic
	- Quart
	- Quint
	- Expo
	- Circ
	- Back
	- Elastic
	- Bounce
  * Custom:     Displays an editable curve control allowing full customization of the animation

- Mirror:       The animation curve is mirrored so that after reaching the end, it returns to the starting value
- Invert:       The curve is flipped upside-down, so that the values start high and end low

- Scale:        Multiplies the default 0..1 output value, to reduce or increase the effect of the control
- Offset:       Adds to the default 0..1 output value, to allow animation over a specific range of values

- Clip Low:     Ensure the output value never dips below 0.0
- Clip High:    Ensure the output value never exceeds 1.0

- Time Scale:   Speeds up or slows down the animation
- Time Offset:  Delays the animation, as a fraction of its total duration


Tip: The resulting animation curve can be seen in the Spline view, and is updated live as you change the controls. In the Spline view's tool tree, find the tool and select the name of the control you're animating to see the curve.


Template Icons
--------------

As of 17.2, Resolve supports an included .png image file with the same name as your .setting file, and will use this as your template's icon in the Resolve user interface. The recommended size is 104 x 58, but will be resized to suit. For example, a LogoPop.setting will use a LogoPop.png icon in the same dir.


Template Paths
--------------

Fusion templates are stored in subdirectories within the OS specific directory described below:

    - MacOS: 
        - All users: /Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Templates/
        - Specific user: /Users/<UserName>/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Templates/

    - Windows: 
        - All users: C:\ProgramData\Blackmagic Design\DaVinci Resolve\Fusion\Templates\
		- Specific user: C:\Users\<UserName>\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Templates\

    - Linux:
        - All users: /var/BlackmagicDesign/DaVinci Resolve/Fusion/Templates/ (or for some installs, /home/resolve/Fusion/Templates/)
        - Specific user: $HOME/.local/share/DaVinciResolve/Fusion/Templates/

Your template should be saved in one of the following subdirectories, according to its purpose. Note that only templates in these subfolders will be available from the Cut and Edit pages. Templates in other subfolders will still be accessible from the Fusion page:

    Edit/
      Transitions/
      Titles/
      Generators/
      Effects/

Please note that the folders for custom Fusion templates can also be located using the option "Show Folder" available in the 3 dot menu in "Effects Library" on the Fusion page. Select the desired template category, choose the Show Folder menu option, and a system file manager window will be opened at the proper path. 

It is also possible to import template files by opening the Fusion page Effects Library to the appropriate category, then dragging and dropping the template file onto the list of templates. The template should then become available on all pages.


DRFX Bundles
------------

As of 17.2, multiple templates may now be bundled together in .drfx files, which are ordinary zip files with a renamed extension (plain .zip files are supported too, with different naming in the UI). These may be organised into subfolders within the zip, if desired, and can also include icons for each template, and any associated assets, for ease of distribution and installation of one or more templates in a single file.

Note: When organising into DRFX bundles, the above folder hierarchy should be followed in order for the Cut and Edit pages to recognize them. For example, a Title template should be placed in the zip inside Edit/Titles/ subfolders.

Note: For cross-platform compatibility, it is important to use lower-case ".drfx" extensions, as other cases may not be recognized by case-sensitive filesystems.
