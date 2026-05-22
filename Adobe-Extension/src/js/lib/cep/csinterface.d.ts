/**
 * Stores constants for the window types supported by the CSXS infrastructure.
 */
declare function CSXSWindowType(): void;

/**
 * EvalScript error message
 */
declare var EvalScript_ErrMessage: any;

/**
 * Version
Defines a version number with major, minor, micro, and special
components. The major, minor and micro values are numeric; the special
value can be any string.
 * @param major - The major version component, a positive integer up to nine digits long.
 * @param minor - The minor version component, a positive integer up to nine digits long.
 * @param micro - The micro version component, a positive integer up to nine digits long.
 * @param special - The special version component, an arbitrary string.
 */
declare class Version {
  constructor(major: any, minor: any, micro: any, special: any);
  /**
     * The maximum value allowed for a numeric version component.
    This reflects the maximum value allowed in PlugPlug and the manifest schema.
     */
  static MAX_NUM: any;
}

/**
 * VersionBound
Defines a boundary for a version range, which associates a \c Version object
with a flag for whether it is an inclusive or exclusive boundary.
 * @param version - The \c #Version object.
 * @param inclusive - True if this boundary is inclusive, false if it is exclusive.
 */
declare class VersionBound {
  constructor(version: any, inclusive: any);
}

/**
 * VersionRange
Defines a range of versions using a lower boundary and optional upper boundary.
 * @param lowerBound - The \c #VersionBound object.
 * @param upperBound - The \c #VersionBound object, or null for a range with no upper boundary.
 */
declare class VersionRange {
  constructor(lowerBound: any, upperBound: any);
}

/**
 * Runtime
Represents a runtime related to the CEP infrastructure.
Extensions can declare dependencies on particular
CEP runtime versions in the extension manifest.
 * @param name - The runtime name.
 * @param version - A \c #VersionRange object that defines a range of valid versions.
 */
declare class Runtime {
  constructor(name: any, version: any);
}

/**
 * Extension
Encapsulates a CEP-based extension to an Adobe application.
 * @param id - The unique identifier of this extension.
 * @param name - The localizable display name of this extension.
 * @param mainPath - The path of the "index.html" file.
 * @param basePath - The base path of this extension.
 * @param windowType - The window type of the main window of this extension.
 * 				  Valid values are defined by \c #CSXSWindowType.
 * @param width - The default width in pixels of the main window of this extension.
 * @param height - The default height in pixels of the main window of this extension.
 * @param minWidth - The minimum width in pixels of the main window of this extension.
 * @param minHeight - The minimum height in pixels of the main window of this extension.
 * @param maxWidth - The maximum width in pixels of the main window of this extension.
 * @param maxHeight - The maximum height in pixels of the main window of this extension.
 * @param defaultExtensionDataXml - The extension data contained in the default \c ExtensionDispatchInfo section of the extension manifest.
 * @param specialExtensionDataXml - The extension data contained in the application-specific \c ExtensionDispatchInfo section of the extension manifest.
 * @param requiredRuntimeList - An array of \c Runtime objects for runtimes required by this extension.
 * @param isAutoVisible - True if this extension is visible on loading.
 * @param isPluginExtension - True if this extension has been deployed in the Plugins folder of the host application.
 */
declare class Extension {
  constructor(
    id: any,
    name: any,
    mainPath: any,
    basePath: any,
    windowType: any,
    width: any,
    height: any,
    minWidth: any,
    minHeight: any,
    maxWidth: any,
    maxHeight: any,
    defaultExtensionDataXml: any,
    specialExtensionDataXml: any,
    requiredRuntimeList: any,
    isAutoVisible: any,
    isPluginExtension: any
  );
}

/**
 * CSEvent
A standard JavaScript event, the base class for CEP events.
 * @param type - The name of the event type.
 * @param scope - The scope of event, can be "GLOBAL" or "APPLICATION".
 * @param appId - The unique identifier of the application that generated the event.
 * @param extensionId - The unique identifier of the extension that generated the event.
 */
declare class CSEvent {
  constructor(type: any, scope: any, appId: any, extensionId: any);
  /**
   * Event-specific data.
   */
  data: any;
}

/**
 * SystemPath
Stores operating-system-specific location constants for use in the
\c #CSInterface.getSystemPath() method.
 */
declare class SystemPath {
  constructor();
  /**
   * The path to user data.
   */
  static USER_DATA: any;
  /**
   * The path to common files for Adobe applications.
   */
  static COMMON_FILES: any;
  /**
   * The path to the user's default document folder.
   */
  static MY_DOCUMENTS: any;
  static APPLICATION: any;
  /**
   * The path to current extension.
   */
  static EXTENSION: any;
  /**
   * The path to hosting application's executable.
   */
  static HOST_APPLICATION: any;
}

/**
 * ColorType
Stores color-type constants.
 */
declare class ColorType {
  constructor();
  /**
   * RGB color type.
   */
  static RGB: any;
  /**
   * Gradient color type.
   */
  static GRADIENT: any;
  /**
   * Null color type.
   */
  static NONE: any;
}

/**
 * RGBColor
Stores an RGB color with red, green, blue, and alpha values.
All values are in the range [0.0 to 255.0]. Invalid numeric values are
converted to numbers within this range.
 * @param red - The red value, in the range [0.0 to 255.0].
 * @param green - The green value, in the range [0.0 to 255.0].
 * @param blue - The blue value, in the range [0.0 to 255.0].
 * @param alpha - The alpha (transparency) value, in the range [0.0 to 255.0].
     The default, 255.0, means that the color is fully opaque.
 */
declare class RGBColor {
  constructor(red: any, green: any, blue: any, alpha: any);
}

/**
 * Direction
A point value  in which the y component is 0 and the x component
is positive or negative for a right or left direction,
or the x component is 0 and the y component is positive or negative for
an up or down direction.
 * @param x - The horizontal component of the point.
 * @param y - The vertical component of the point.
 */
declare class Direction {
  constructor(x: any, y: any);
}

/**
 * GradientStop
Stores gradient stop information.
 * @param offset - The offset of the gradient stop, in the range [0.0 to 1.0].
 * @param rgbColor - The color of the gradient at this point, an \c #RGBColor object.
 */
declare class GradientStop {
  constructor(offset: any, rgbColor: any);
}

/**
 * GradientColor
Stores gradient color information.
 * @param type - The gradient type, must be "linear".
 * @param direction - A \c #Direction object for the direction of the gradient
 * 				 (up, down, right, or left).
 * @param numStops - The number of stops in the gradient.
 * @param gradientStopList - An array of \c #GradientStop objects.
 */
declare class GradientColor {
  constructor(type: any, direction: any, numStops: any, gradientStopList: any);
}

/**
 * UIColor
Stores color information, including the type, anti-alias level, and specific color
values in a color object of an appropriate type.
 * @param type - The color type, 1 for "rgb" and 2 for "gradient".
 * 				 The supplied color object must correspond to this type.
 * @param antialiasLevel - The anti-alias level constant.
 * @param color - A \c #RGBColor or \c #GradientColor object containing specific color information.
 */
declare class UIColor {
  constructor(type: any, antialiasLevel: any, color: any);
}

/**
 * AppSkinInfo
Stores window-skin properties, such as color and font. All color parameter values are \c #UIColor objects except that systemHighlightColor is \c #RGBColor object.
 * @param baseFontFamily - The base font family of the application.
 * @param baseFontSize - The base font size of the application.
 * @param appBarBackgroundColor - The application bar background color.
 * @param panelBackgroundColor - The background color of the extension panel.
 * @param appBarBackgroundColorSRGB - The application bar background color, as sRGB.
 * @param panelBackgroundColorSRGB - The background color of the extension panel, as sRGB.
 * @param systemHighlightColor - The highlight color of the extension panel, if provided by the host application. Otherwise, the operating-system highlight color.
 */
declare class AppSkinInfo {
  constructor(
    baseFontFamily: any,
    baseFontSize: any,
    appBarBackgroundColor: any,
    panelBackgroundColor: any,
    appBarBackgroundColorSRGB: any,
    panelBackgroundColorSRGB: any,
    systemHighlightColor: any
  );
}

/**
 * HostEnvironment
Stores information about the environment in which the extension is loaded.
 * @param appName - The application's name.
 * @param appVersion - The application's version.
 * @param appLocale - The application's current license locale.
 * @param appUILocale - The application's current UI locale.
 * @param appId - The application's unique identifier.
 * @param isAppOnline - True if the application is currently online.
 * @param appSkinInfo - An \c #AppSkinInfo object containing the application's default color and font styles.
 */
declare class HostEnvironment {
  constructor(
    appName: any,
    appVersion: any,
    appLocale: any,
    appUILocale: any,
    appId: any,
    isAppOnline: any,
    appSkinInfo: any
  );
}

/**
 * HostCapabilities
Stores information about the host capabilities.
 * @param EXTENDED_PANEL_MENU - True if the application supports panel menu.
 * @param EXTENDED_PANEL_ICONS - True if the application supports panel icon.
 * @param DELEGATE_APE_ENGINE - True if the application supports delegated APE engine.
 * @param SUPPORT_HTML_EXTENSIONS - True if the application supports HTML extensions.
 * @param DISABLE_FLASH_EXTENSIONS - True if the application disables FLASH extensions.
 */
declare class HostCapabilities {
  constructor(
    EXTENDED_PANEL_MENU: any,
    EXTENDED_PANEL_ICONS: any,
    DELEGATE_APE_ENGINE: any,
    SUPPORT_HTML_EXTENSIONS: any,
    DISABLE_FLASH_EXTENSIONS: any
  );
}

/**
 * ApiVersion
Stores current api version.

Since 4.2.0
 * @param major - The major version
 * @param minor - The minor version.
 * @param micro - The micro version.
 */
declare class ApiVersion {
  constructor(major: any, minor: any, micro: any);
}

/**
 * MenuItemStatus
Stores flyout menu item status

Since 5.2.0
 * @param menuItemLabel - The menu item label.
 * @param enabled - True if user wants to enable the menu item.
 * @param checked - True if user wants to check the menu item.
 */
declare class MenuItemStatus {
  constructor(menuItemLabel: any, enabled: any, checked: any);
}

/**
 * ContextMenuItemStatus
Stores the status of the context menu item.

Since 5.2.0
 * @param menuItemID - The menu item id.
 * @param enabled - True if user wants to enable the menu item.
 * @param checked - True if user wants to check the menu item.
 */
declare class ContextMenuItemStatus {
  constructor(menuItemID: any, enabled: any, checked: any);
}

/**
 * CSInterface
This is the entry point to the CEP extensibility infrastructure.
Instantiate this object and use it to:
<ul>
<li>Access information about the host application in which an extension is running</li>
<li>Launch an extension</li>
<li>Register interest in event notifications, and dispatch events</li>
</ul>
 */

type RBGAColor = {
  alpha: number;
  green: number;
  blue: number;
  red: number;
};

export default class CSInterface {
  constructor();
  /**
     * User can add this event listener to handle native application theme color changes.
    Callback function gives extensions ability to fine-tune their theme color after the
    global theme color has been changed.
    The callback function should be like below:
     * @example
     * // event is a CSEvent object, but user can ignore it.
    function OnAppThemeColorChanged(event)
    {
       // Should get a latest HostEnvironment object from application.
       var skinInfo = JSON.parse(window.__adobe_cep__.getHostEnvironment()).appSkinInfo;
       // Gets the style information such as color info from the skinInfo,
       // and redraw all UI controls of your extension according to the style info.
    }
     */
  static THEME_COLOR_CHANGED_EVENT: any;
  /**
   * The host environment data object.
   */
  hostEnvironment: {
    appName: string;
    appVersion: string;
    appLocale: string;
    appUILocale: string;
    appId: string;
    isAppOnline: boolean;
    appSkinInfo: {
      baseFontFamily: string;
      baseFontSize: number;
      appBarBackgroundColor: {
        antialiasLevel: number;
        type: number;
        color: RBGAColor;
      };
      panelBackgroundColor: {
        antialiasLevel: number;
        type: number;
        color: RBGAColor;
      };
      appBarBackgroundColorSRGB: {
        antialiasLevel: number;
        type: number;
        color: RBGAColor;
      };
      panelBackgroundColorSRGB: {
        antialiasLevel: number;
        type: number;
        color: RBGAColor;
      };
      systemHighlightColor: RBGAColor;
    };
  };
  /**
     * Retrieves information about the host environment in which the
     extension is currently running.
     * @returns A \c #HostEnvironment object.
     */
  getHostEnvironment(): any;
  /**
     * Loads binary file created which is located at url asynchronously
     * @example
     * To create JS binary use command ./cep_compiler test.js test.bin
    To load JS binary asyncronously
      var CSLib = new CSInterface();
      CSLib.loadBinAsync(url, function () { });
     * @param urlName - url at which binary file is located. Local files should start with 'file://'
     * @param callback - Optional. A callback function that returns after binary is loaded
     */
  loadBinAsync(urlName: any, callback: any): void;
  /**
     * Loads binary file created synchronously
     * @example
     * To create JS binary use command ./cep_compiler test.js test.bin
    To load JS binary syncronously
      var CSLib = new CSInterface();
      CSLib.loadBinSync(path);
     * @param pathName - the local path at which binary file is located
     */
  loadBinSync(pathName: any): void;
  /**
   * Closes this extension.
   */
  closeExtension(): void;
  /**
   * Retrieves a path for which a constant is defined in the system.
   * @param pathType - The path-type constant defined in \c #SystemPath ,
   * @returns The platform-specific system path string.
   */
  getSystemPath(pathType: any): any;
  /**
     * Evaluates a JavaScript script, which can use the JavaScript DOM
    of the host application.
     * @param script - The JavaScript script.
     * @param callback - Optional. A callback function that receives the result of execution.
             If execution fails, the callback function receives the error message \c EvalScript_ErrMessage.
     */
  evalScript(script: any, callback: any): void;
  /**
     * Retrieves the unique identifier of the application.
    in which the extension is currently running.
     * @returns The unique ID string.
     */
  getApplicationID(): any;
  /**
     * Retrieves host capability information for the application
    in which the extension is currently running.
     * @returns A \c #HostCapabilities object.
     */
  getHostCapabilities(): any;
  /**
     * Triggers a CEP event programmatically. Yoy can use it to dispatch
    an event of a predefined type, or of a type you have defined.
     * @param event - A \c CSEvent object.
     */
  dispatchEvent(event: any): void;
  /**
     * Registers an interest in a CEP event of a particular type, and
    assigns an event handler.
    The event infrastructure notifies your extension when events of this type occur,
    passing the event object to the registered handler function.
     * @param type - The name of the event type of interest.
     * @param listener - The JavaScript handler function or method.
     * @param obj - Optional, the object containing the handler method, if any.
            Default is null.
     */
  addEventListener(type: any, listener: Function, obj?: any): void;
  /**
     * Removes a registered event listener.
     * @param type - The name of the event type of interest.
     * @param listener - The JavaScript handler function or method that was registered.
     * @param obj - Optional, the object containing the handler method, if any.
             Default is null.
     */
  removeEventListener(type: any, listener: any, obj?: any): void;
  /**
     * Loads and launches another extension, or activates the extension if it is already loaded.
     * @example
     * To launch the extension "help" with ID "HLP" from this extension, call:
    <code>requestOpenExtension("HLP", ""); </code>
     * @param extensionId - The extension's unique identifier.
     * @param startupParams - Not currently used, pass "".
     */
  requestOpenExtension(extensionId: any, startupParams: any): void;
  /**
     * Retrieves the list of extensions currently loaded in the current host application.
    The extension list is initialized once, and remains the same during the lifetime
    of the CEP session.
     * @param extensionIds - Optional, an array of unique identifiers for extensions of interest.
             If omitted, retrieves data for all extensions.
     * @returns Zero or more \c #Extension objects.
     */
  getExtensions(extensionIds: any): any;
  /**
   * Retrieves network-related preferences.
   * @returns A JavaScript object containing network preferences.
   */
  getNetworkPreferences(): any;
  /**
     * Initializes the resource bundle for this extension with property values
    for the current application and locale.
    To support multiple locales, you must define a property file for each locale,
    containing keyed display-string values for that locale.
    See localization documentation for Extension Builder and related products.
    
    Keys can be in the
    form <code>key.value="localized string"</code>, for use in HTML text elements.
    For example, in this input element, the localized \c key.value string is displayed
    instead of the empty \c value string:
    
    <code><input type="submit" value="" data-locale="key"/></code>
     * @returns An object containing the resource bundle information.
     */
  initResourceBundle(): any;
  /**
   * Writes installation information to a file.
   * @returns The file path.
   */
  dumpInstallationInfo(): any;
  /**
     * Retrieves version information for the current Operating System,
    See http://www.useragentstring.com/pages/Chrome/ for Chrome \c navigator.userAgent values.
     * @returns A string containing the OS version, or "unknown Operation System".
    If user customizes the User Agent by setting CEF command parameter "--user-agent", only
    "Mac OS X" or "Windows" will be returned.
     */
  getOSInformation(): any;
  /**
     * Opens a page in the default system browser.
    
    Since 4.2.0
     * @param url - The URL of the page/file to open, or the email address.
    Must use HTTP/HTTPS/file/mailto protocol. For example:
      "http://www.adobe.com"
      "https://github.com"
      "file:///C:/log.txt"
      "mailto:test@adobe.com"
     * @returns One of these error codes:\n
         <ul>\n
             <li>NO_ERROR - 0</li>\n
             <li>ERR_UNKNOWN - 1</li>\n
             <li>ERR_INVALID_PARAMS - 2</li>\n
             <li>ERR_INVALID_URL - 201</li>\n
         </ul>\n
     */
  openURLInDefaultBrowser(url: any): any;
  /**
     * Retrieves extension ID.
    
    Since 4.2.0
     * @returns extension ID.
     */
  getExtensionID(): any;
  /**
     * Retrieves the scale factor of screen.
    On Windows platform, the value of scale factor might be different from operating system's scale factor,
    since host application may use its self-defined scale factor.
    
    Since 4.2.0
     * @returns One of the following float number.
         <ul>\n
             <li> -1.0 when error occurs </li>\n
             <li> 1.0 means normal screen </li>\n
             <li> >1.0 means HiDPI screen </li>\n
         </ul>\n
     */
  getScaleFactor(): any;
  /**
     * Set a handler to detect any changes of scale factor. This only works on Mac.
    
    Since 4.2.0
     * @param handler - The function to be called when scale factor is changed.
     */
  setScaleFactorChangedHandler(handler: any): void;
  /**
     * Retrieves current API version.
    
    Since 4.2.0
     * @returns ApiVersion object.
     */
  getCurrentApiVersion(): {
    minor: string;
    micro: string;
    major: string;
  };
  /**
     * Set panel flyout menu by an XML.
    
    Since 5.2.0
    
    Register a callback function for "com.adobe.csxs.events.flyoutMenuClicked" to get notified when a
    menu item is clicked.
    The "data" attribute of event is an object which contains "menuId" and "menuName" attributes.
    
    Register callback functions for "com.adobe.csxs.events.flyoutMenuOpened" and "com.adobe.csxs.events.flyoutMenuClosed"
    respectively to get notified when flyout menu is opened or closed.
     * @param menu - A XML string which describes menu structure.
    An example menu XML:
    <Menu>
      <MenuItem Id="menuItemId1" Label="TestExample1" Enabled="true" Checked="false"/>
      <MenuItem Label="TestExample2">
        <MenuItem Label="TestExample2-1" >
          <MenuItem Label="TestExample2-1-1" Enabled="false" Checked="true"/>
        </MenuItem>
        <MenuItem Label="TestExample2-2" Enabled="true" Checked="true"/>
      </MenuItem>
      <MenuItem Label="---" />
      <MenuItem Label="TestExample3" Enabled="false" Checked="false"/>
    </Menu>
     */
  setPanelFlyoutMenu(menu: any): void;
  /**
     * Updates a menu item in the extension window's flyout menu, by setting the enabled
    and selection status.
    
    Since 5.2.0
     * @param menuItemLabel - The menu item label.
     * @param enabled - True to enable the item, false to disable it (gray it out).
     * @param checked - True to select the item, false to deselect it.
     * @returns false when the host application does not support this functionality (HostCapabilities.EXTENDED_PANEL_MENU is false).
            Fails silently if menu label is invalid.
     */
  updatePanelMenuItem(menuItemLabel: any, enabled: any, checked: any): any;
  /**
     * An example menu XML:
    <Menu>
      <MenuItem Id="menuItemId1" Label="TestExample1" Enabled="true" Checkable="true" Checked="false" Icon="./image/small_16X16.png"/>
      <MenuItem Id="menuItemId2" Label="TestExample2">
        <MenuItem Id="menuItemId2-1" Label="TestExample2-1" >
          <MenuItem Id="menuItemId2-1-1" Label="TestExample2-1-1" Enabled="false" Checkable="true" Checked="true"/>
        </MenuItem>
        <MenuItem Id="menuItemId2-2" Label="TestExample2-2" Enabled="true" Checkable="true" Checked="true"/>
      </MenuItem>
      <MenuItem Label="---" />
      <MenuItem Id="menuItemId3" Label="TestExample3" Enabled="false" Checkable="true" Checked="false"/>
    </Menu>
     * @param menu - A XML string which describes menu structure.
     * @param callback - The callback function which is called when a menu item is clicked. The only parameter is the returned ID of clicked menu item.
     */
  setContextMenu(menu: any, callback: any): void;
  /**
     * An example menu JSON:
    
    {
         "menu": [
             {
                 "id": "menuItemId1",
                 "label": "testExample1",
                 "enabled": true,
                 "checkable": true,
                 "checked": false,
                 "icon": "./image/small_16X16.png"
             },
             {
                 "id": "menuItemId2",
                 "label": "testExample2",
                 "menu": [
                     {
                         "id": "menuItemId2-1",
                         "label": "testExample2-1",
                         "menu": [
                             {
                                 "id": "menuItemId2-1-1",
                                 "label": "testExample2-1-1",
                                 "enabled": false,
                                 "checkable": true,
                                 "checked": true
                             }
                         ]
                     },
                     {
                         "id": "menuItemId2-2",
                         "label": "testExample2-2",
                         "enabled": true,
                         "checkable": true,
                         "checked": true
                     }
                 ]
             },
             {
                 "label": "---"
             },
             {
                 "id": "menuItemId3",
                 "label": "testExample3",
                 "enabled": false,
                 "checkable": true,
                 "checked": false
             }
         ]
     }
     * @param menu - A JSON string which describes menu structure.
     * @param callback - The callback function which is called when a menu item is clicked. The only parameter is the returned ID of clicked menu item.
     */
  setContextMenuByJSON(menu: any, callback: any): void;
  /**
     * Updates a context menu item by setting the enabled and selection status.
    
    Since 5.2.0
     * @param menuItemID - The menu item ID.
     * @param enabled - True to enable the item, false to disable it (gray it out).
     * @param checked - True to select the item, false to deselect it.
     */
  updateContextMenuItem(menuItemID: any, enabled: any, checked: any): void;
  /**
     * Get the visibility status of an extension window.
    
    Since 6.0.0
     * @returns true if the extension window is visible; false if the extension window is hidden.
     */
  isWindowVisible(): any;
  /**
     * Resize extension's content to the specified dimensions.
    1. Works with modal and modeless extensions in all Adobe products.
    2. Extension's manifest min/max size constraints apply and take precedence.
    3. For panel extensions
       3.1 This works in all Adobe products except:
           * Premiere Pro
           * Prelude
           * After Effects
       3.2 When the panel is in certain states (especially when being docked),
           it will not change to the desired dimensions even when the
           specified size satisfies min/max constraints.
    
    Since 6.0.0
     * @param width - The new width
     * @param height - The new height
     */
  resizeContent(width: any, height: any): void;
  /**
     * Register the invalid certificate callback for an extension.
    This callback will be triggered when the extension tries to access the web site that contains the invalid certificate on the main frame.
    But if the extension does not call this function and tries to access the web site containing the invalid certificate, a default error page will be shown.
    
    Since 6.1.0
     * @param callback - the callback function
     */
  registerInvalidCertificateCallback(callback: any): void;
  /**
     * Register an interest in some key events to prevent them from being sent to the host application.
    
    This function works with modeless extensions and panel extensions.
    Generally all the key events will be sent to the host application for these two extensions if the current focused element
    is not text input or dropdown,
    If you want to intercept some key events and want them to be handled in the extension, please call this function
    in advance to prevent them being sent to the host application.
    
    Since 6.1.0
     */
  registerKeyEventsInterest(keyEventsInterest: any): void;
  /**
     * Set the title of the extension window.
    This function works with modal and modeless extensions in all Adobe products, and panel extensions in Photoshop, InDesign, InCopy, Illustrator, Flash Pro and Dreamweaver.
    
    Since 6.1.0
     * @param title - The window title.
     */
  setWindowTitle(title: any): void;
  /**
     * Get the title of the extension window.
    This function works with modal and modeless extensions in all Adobe products, and panel extensions in Photoshop, InDesign, InCopy, Illustrator, Flash Pro and Dreamweaver.
    
    Since 6.1.0
     * @returns The window title.
     */
  getWindowTitle(): any;
}
