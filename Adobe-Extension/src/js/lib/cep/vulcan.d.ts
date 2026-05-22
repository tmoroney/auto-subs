/**
 * Vulcan

The singleton instance, <tt>VulcanInterface</tt>, provides an interface
to the Vulcan. Allows you to launch CC applications
and discover information about them.
 */
export default class Vulcan {
  constructor();

  /**
   * Gets all available application SAPCode-Specifiers on the local machine.
   *
   * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
   * Changes : New getTargetSpecifiersEx returns productSAPCodeSpecifiers
   *
   * @return The array of all available application SAPCode-Specifiers.
   */
  getTargetSpecifiersEx(): any;

  /**
   * Launches a CC application on the local machine, if it is not already running.
   *
   * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
   * Changes : New launchAppEx uses productSAPCodeSpecifiers
   *
   * @param productSAPCodeSpecifier The application specifier; for example "ILST-25.2.3", "ILST-25", "ILST-25.2.3-en_US" and "ILST. Refer to `Documentation/CEP 11.1 HTML Extension Cookbook.md#applications-integrated-with-cep` for product SAPCode.
   * @param focus           True to launch in foreground, or false to launch in the background.
   * @param cmdLine         Optional, command-line parameters to supply to the launch command.
   * @return True if the app can be launched, false otherwise.
   */
  launchAppEx(
    productSAPCodeSpecifier: string,
    focus: boolean,
    cmdLine?: string,
  ): boolean;

  /**
   * Checks whether a CC application is running on the local machine.
   *
   * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
   * Changes : New isAppRunningEx uses productSAPCodeSpecifiers
   *
   * @param productSAPCodeSpecifier The application specifier; for example "ILST-25.2.3", "ILST-25", "ILST-25.2.3-en_US" and "ILST. Refer to `Documentation/CEP 11.1 HTML Extension Cookbook.md#applications-integrated-with-cep` for product SAPCode.
   * @return True if the app is running, false otherwise.
   */
  isAppRunningEx(productSAPCodeSpecifier: string): boolean;

  /**
   * Checks whether a CC application is installed on the local machine.
   *
   * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
   * Changes : New isAppInstalledEx uses productSAPCodeSpecifiers
   *
   * @param productSAPCodeSpecifier The application specifier; for example "ILST-25.2.3", "ILST-25", "ILST-25.2.3-en_US" and "ILST. Refer to `Documentation/CEP 11.1 HTML Extension Cookbook.md#applications-integrated-with-cep` for product SAPCode.
   * @return True if the app is installed, false otherwise.
   */
  isAppInstalledEx(productSAPCodeSpecifier: string): any;

  /**s
   * Retrieves the local install path of a CC application.
   *
   * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
   * Changes : New getAppPathEx uses productSAPCodeSpecifiers
   *
   * @param productSAPCodeSpecifier The application specifier; for example "ILST-25.2.3", "ILST-25", "ILST-25.2.3-en_US" and "ILST. Refer to `Documentation/CEP 11.1 HTML Extension Cookbook.md#applications-integrated-with-cep` for product SAPCode.
   * @return The path string if the application is found, "" otherwise.
   */
  getAppPathEx(): any;

  //   OLD FUNCTIONS
  //   OLD FUNCTIONS
  //   OLD FUNCTIONS
  //   OLD FUNCTIONS

  /**
   * Gets all available application specifiers on the local machine.
   * @returns The array of all available application specifiers.
   */
  getTargetSpecifiers(): any;
  /**
     * Launches a CC application on the local machine, if it is not already running.
     * @param targetSpecifier - The application specifier; for example "indesign".
    
           Note: In Windows 7 64-bit or Windows 8 64-bit system, some target applications (like Photoshop and Illustrator) have both 32-bit version
           and 64-bit version. Therefore, we need to specify the version by this parameter with "photoshop-70.032" or "photoshop-70.064". If you
           installed Photoshop 32-bit and 64-bit on one Windows 64-bit system and invoke this interface with parameter "photoshop-70.032", you may
           receive wrong result.
           The specifiers for Illustrator is "illustrator-17.032", "illustrator-17.064", "illustrator-17" and "illustrator".
    
           In other platforms there is no such issue, so we can use "photoshop" or "photoshop-70" as specifier.
     * @param focus - True to launch in foreground, or false to launch in the background.
     * @param cmdLine - Optional, command-line parameters to supply to the launch command.
     * @returns True if the app can be launched, false otherwise.
     */
  launchApp(targetSpecifier: any, focus: any, cmdLine: any): any;
  /**
     * Checks whether a CC application is running on the local machine.
     * @param targetSpecifier - The application specifier; for example "indesign".
    
           Note: In Windows 7 64-bit or Windows 8 64-bit system, some target applications (like Photoshop and Illustrator) have both 32-bit version
           and 64-bit version. Therefore, we need to specify the version by this parameter with "photoshop-70.032" or "photoshop-70.064". If you
           installed Photoshop 32-bit and 64-bit on one Windows 64-bit system and invoke this interface with parameter "photoshop-70.032", you may
           receive wrong result.
           The specifiers for Illustrator is "illustrator-17.032", "illustrator-17.064", "illustrator-17" and "illustrator".
    
           In other platforms there is no such issue, so we can use "photoshop" or "photoshop-70" as specifier.
     * @returns True if the app is running, false otherwise.
     */
  isAppRunning(targetSpecifier: any): any;
  /**
     * Checks whether a CC application is installed on the local machine.
     * @param targetSpecifier - The application specifier; for example "indesign".
    
           Note: In Windows 7 64-bit or Windows 8 64-bit system, some target applications (like Photoshop and Illustrator) have both 32-bit version
           and 64-bit version. Therefore, we need to specify the version by this parameter with "photoshop-70.032" or "photoshop-70.064". If you
           installed Photoshop 32-bit and 64-bit on one Windows 64-bit system and invoke this interface with parameter "photoshop-70.032", you may
           receive wrong result.
           The specifiers for Illustrator is "illustrator-17.032", "illustrator-17.064", "illustrator-17" and "illustrator".
    
           In other platforms there is no such issue, so we can use "photoshop" or "photoshop-70" as specifier.
     * @returns True if the app is installed, false otherwise.
     */
  isAppInstalled(targetSpecifier: any): any;
  /**
     * Retrieves the local install path of a CC application.
     * @param targetSpecifier - The application specifier; for example "indesign".
    
           Note: In Windows 7 64-bit or Windows 8 64-bit system, some target applications (like Photoshop and Illustrator) have both 32-bit version
           and 64-bit version. Therefore, we need to specify the version by this parameter with "photoshop-70.032" or "photoshop-70.064". If you
           installed Photoshop 32-bit and 64-bit on one Windows 64-bit system and invoke this interface with parameter "photoshop-70.032", you may
           receive wrong result.
           The specifiers for Illustrator is "illustrator-17.032", "illustrator-17.064", "illustrator-17" and "illustrator".
    
           In other platforms there is no such issue, so we can use "photoshop" or "photoshop-70" as specifier.
     * @returns The path string if the application is found, "" otherwise.
     */
  getAppPath(targetSpecifier: any): any;
  /**
     * Registers a message listener callback function for a Vulcan message.
     * @param type - The message type.
     * @param callback - The callback function that handles the message.
                           Takes one argument, the message object.
     * @param obj - Optional, the object containing the callback method, if any.
                           Default is null.
     */
  addMessageListener(type: any, callback: any, obj: any): void;
  /**
     * Removes a registered message listener callback function for a Vulcan message.
     * @param type - The message type.
     * @param callback - The callback function that was registered.
                           Takes one argument, the message object.
     * @param obj - Optional, the object containing the callback method, if any.
                           Default is null.
     */
  removeMessageListener(type: any, callback: any, obj: any): void;
  /**
   * Dispatches a Vulcan message.
   * @param vulcanMessage - The message object.
   */
  dispatchMessage(vulcanMessage: any): void;
  /**
   * Retrieves the message payload of a Vulcan message for the registered message listener callback function.
   * @param vulcanMessage - The message object.
   * @returns A string containing the message payload.
   */
  getPayload(vulcanMessage: any): any;
  /**
     * Gets all available endpoints of the running Vulcan-enabled applications.
    
    Since 7.0.0
     * @returns The array of all available endpoints.
    An example endpoint string:
    <endPoint>
      <appId>PHXS</appId>
      <appVersion>16.1.0</appVersion>
    </endPoint>
     */
  getEndPoints(): any;
  /**
     * Gets the endpoint for itself.
    
    Since 7.0.0
     * @returns The endpoint string for itself.
     */
  getSelfEndPoint(): any;
}

/**
 * Singleton instance of Vulcan
 */
declare var VulcanInterface: any;

/**
 * VulcanMessage
Message type for sending messages between host applications.
A message of this type can be sent to the designated destination
when appId and appVersion are provided and valid. Otherwise,
the message is broadcast to all running Vulcan-enabled applications.

To send a message between extensions running within one
application, use the <code>CSEvent</code> type in CSInterface.js.
 * @param type - The message type.
 * @param appId - The peer appId.
 * @param appVersion - The peer appVersion.
 */
export declare class VulcanMessage {
  static TYPE_PREFIX: string;
  static SCOPE_SUITE: string;
  static DEFAULT_APP_ID: string;
  static DEFAULT_APP_VERSION: string;
  static DEFAULT_DATA: string;
  static dataTemplate: string;
  static payloadTemplate: string;
  constructor(type: any, appId: any, appVersion: any);
  /**
   * Initializes this message instance.
   * @param message - A \c message instance to use for initialization.
   */
  initialize(message: any): void;
  /**
   * Retrieves the message data.
   * @returns A data string in XML format.
   */
  xmlData(): any;
  /**
   * Sets the message payload of this message.
   * @param payload - A string containing the message payload.
   */
  setPayload(payload: any): void;
  /**
   * Retrieves the message payload of this message.
   * @returns A string containing the message payload.
   */
  getPayload(): any;
  /**
   * Converts the properties of this instance to a string.
   * @returns The string version of this instance.
   */
  toString(): any;
}

/**
 * Retrieves the content of an XML element.
 * @param xmlStr - The XML string.
 * @param key - The name of the tag.
 * @returns The content of the tag, or the empty string
                 if such tag is not found or the tag has no content.
 */
declare function GetValueByKey(xmlStr: any, key: any): any;

/**
 * Reports whether required parameters are valid.
 * @returns True if all required parameters are valid,
           false if any of the required parameters are invalid.
 */
declare function requiredParamsValid(): any;

/**
 * Reports whether a string has a given prefix.
 * @param str - The target string.
 * @param prefix - The specific prefix string.
 * @returns True if the string has the prefix, false if not.
 */
declare function strStartsWith(str: any, prefix: any): any;
