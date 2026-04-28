/**************************************************************************************************
 *
 * ADOBE SYSTEMS INCORPORATED
 * Copyright 2020 Adobe Systems Incorporated
 * All Rights Reserved.
 *
 * NOTICE:  Adobe permits you to use, modify, and distribute this file in accordance with the
 * terms of the Adobe license agreement accompanying it.  If you have received this file from a
 * source other than Adobe, then your use, modification, or distribution of it requires the prior
 * written permission of Adobe.
 *
 **************************************************************************************************/

/** Vulcan - v11.2.0 */

/**
 * @class Vulcan
 *
 * The singleton instance, <tt>VulcanInterface</tt>, provides an interface
 * to the Vulcan. Allows you to launch CC applications
 * and discover information about them.
 */
function Vulcan() {}

/**
 * Gets all available application SAPCode-Specifiers on the local machine.
 *
 * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
 * Changes : New getTargetSpecifiersEx returns productSAPCodeSpecifiers
 *
 * @return The array of all available application SAPCode-Specifiers.
 */
Vulcan.prototype.getTargetSpecifiersEx = function () {
  var params = {};
  return JSON.parse(
    window.__adobe_cep__.invokeSync(
      "vulcanGetTargetSpecifiersEx",
      JSON.stringify(params)
    )
  );
};

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
Vulcan.prototype.launchAppEx = function (
  productSAPCodeSpecifier,
  focus,
  cmdLine
) {
  if (!requiredParamsValid(productSAPCodeSpecifier)) {
    return false;
  }

  var params = {};
  params.productSAPCodeSpecifier = productSAPCodeSpecifier;
  params.focus = focus ? "true" : "false";
  params.cmdLine = requiredParamsValid(cmdLine) ? cmdLine : "";

  return JSON.parse(
    window.__adobe_cep__.invokeSync("vulcanLaunchAppEx", JSON.stringify(params))
  ).result;
};

/**
 * Checks whether a CC application is running on the local machine.
 *
 * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
 * Changes : New isAppRunningEx uses productSAPCodeSpecifiers
 *
 * @param productSAPCodeSpecifier The application specifier; for example "ILST-25.2.3", "ILST-25", "ILST-25.2.3-en_US" and "ILST. Refer to `Documentation/CEP 11.1 HTML Extension Cookbook.md#applications-integrated-with-cep` for product SAPCode.
 * @return True if the app is running, false otherwise.
 */
Vulcan.prototype.isAppRunningEx = function (productSAPCodeSpecifier) {
  if (!requiredParamsValid(productSAPCodeSpecifier)) {
    return false;
  }

  var params = {};
  params.productSAPCodeSpecifier = productSAPCodeSpecifier;

  return JSON.parse(
    window.__adobe_cep__.invokeSync(
      "vulcanIsAppRunningEx",
      JSON.stringify(params)
    )
  ).result;
};

/**
 * Checks whether a CC application is installed on the local machine.
 *
 * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
 * Changes : New isAppInstalledEx uses productSAPCodeSpecifiers
 *
 * @param productSAPCodeSpecifier The application specifier; for example "ILST-25.2.3", "ILST-25", "ILST-25.2.3-en_US" and "ILST. Refer to `Documentation/CEP 11.1 HTML Extension Cookbook.md#applications-integrated-with-cep` for product SAPCode.
 * @return True if the app is installed, false otherwise.
 */
Vulcan.prototype.isAppInstalledEx = function (productSAPCodeSpecifier) {
  if (!requiredParamsValid(productSAPCodeSpecifier)) {
    return false;
  }

  var params = {};
  params.productSAPCodeSpecifier = productSAPCodeSpecifier;

  return JSON.parse(
    window.__adobe_cep__.invokeSync(
      "vulcanIsAppInstalledEx",
      JSON.stringify(params)
    )
  ).result;
};

/**s
 * Retrieves the local install path of a CC application.
 *
 * Vulcan Control New 6.x APIs, and Deprecating older Vulcan Control APIs.
 * Changes : New getAppPathEx uses productSAPCodeSpecifiers
 *
 * @param productSAPCodeSpecifier The application specifier; for example "ILST-25.2.3", "ILST-25", "ILST-25.2.3-en_US" and "ILST. Refer to `Documentation/CEP 11.1 HTML Extension Cookbook.md#applications-integrated-with-cep` for product SAPCode.
 * @return The path string if the application is found, "" otherwise.
 */
Vulcan.prototype.getAppPathEx = function (productSAPCodeSpecifier) {
  if (!requiredParamsValid(productSAPCodeSpecifier)) {
    return "";
  }

  var params = {};
  params.productSAPCodeSpecifier = productSAPCodeSpecifier;

  return JSON.parse(
    window.__adobe_cep__.invokeSync(
      "vulcanGetAppPathEx",
      JSON.stringify(params)
    )
  ).result;
};

/**
 * DEPRECATED API:: use getTargetSpecifiersEx
 * Gets all available application specifiers on the local machine.
 *
 * @return The array of all available application specifiers.
 */
Vulcan.prototype.getTargetSpecifiers = function () {
  console.warn(
    "WARNING! Function 'getTargetSpecifiers' has been deprecated, please use the new 'getTargetSpecifiersEx' function instead!"
  );
  var params = {};
  return JSON.parse(
    window.__adobe_cep__.invokeSync(
      "vulcanGetTargetSpecifiers",
      JSON.stringify(params)
    )
  );
};

/**
 * DEPRECATED API:: use launchAppEx
 * Launches a CC application on the local machine, if it is not already running.
 *
 * @param targetSpecifier The application specifier; for example "indesign".
 *
 *        Note: In Windows 7 64-bit or Windows 8 64-bit system, some target applications (like Photoshop and Illustrator) have both 32-bit version
 *        and 64-bit version. Therefore, we need to specify the version by this parameter with "photoshop-70.032" or "photoshop-70.064". If you
 *        installed Photoshop 32-bit and 64-bit on one Windows 64-bit system and invoke this interface with parameter "photoshop-70.032", you may
 *        receive wrong result.
 *        The specifiers for Illustrator is "illustrator-17.032", "illustrator-17.064", "illustrator-17" and "illustrator".
 *
 *        In other platforms there is no such issue, so we can use "photoshop" or "photoshop-70" as specifier.
 * @param focus           True to launch in foreground, or false to launch in the background.
 * @param cmdLine         Optional, command-line parameters to supply to the launch command.
 * @return True if the app can be launched, false otherwise.
 */
Vulcan.prototype.launchApp = function (targetSpecifier, focus, cmdLine) {
  console.warn(
    "WARNING! Function 'launchApp' has been deprecated, please use the new 'launchAppEx' function instead!"
  );
  if (!requiredParamsValid(targetSpecifier)) {
    return false;
  }

  var params = {};
  params.targetSpecifier = targetSpecifier;
  params.focus = focus ? "true" : "false";
  params.cmdLine = requiredParamsValid(cmdLine) ? cmdLine : "";

  return JSON.parse(
    window.__adobe_cep__.invokeSync("vulcanLaunchApp", JSON.stringify(params))
  ).result;
};

/**
 * DEPRECATED API:: use isAppRunningEx
 * Checks whether a CC application is running on the local machine.
 *
 * @param targetSpecifier The application specifier; for example "indesign".
 *
 *        Note: In Windows 7 64-bit or Windows 8 64-bit system, some target applications (like Photoshop and Illustrator) have both 32-bit version
 *        and 64-bit version. Therefore, we need to specify the version by this parameter with "photoshop-70.032" or "photoshop-70.064". If you
 *        installed Photoshop 32-bit and 64-bit on one Windows 64-bit system and invoke this interface with parameter "photoshop-70.032", you may
 *        receive wrong result.
 *        The specifiers for Illustrator is "illustrator-17.032", "illustrator-17.064", "illustrator-17" and "illustrator".
 *
 *        In other platforms there is no such issue, so we can use "photoshop" or "photoshop-70" as specifier.
 * @return True if the app is running, false otherwise.
 */
Vulcan.prototype.isAppRunning = function (targetSpecifier) {
  console.warn(
    "WARNING! Function 'isAppRunning' has been deprecated, please use the new 'isAppRunningEx' function instead!"
  );
  if (!requiredParamsValid(targetSpecifier)) {
    return false;
  }

  var params = {};
  params.targetSpecifier = targetSpecifier;

  return JSON.parse(
    window.__adobe_cep__.invokeSync(
      "vulcanIsAppRunning",
      JSON.stringify(params)
    )
  ).result;
};

/**
 * DEPRECATED API:: use isAppInstalledEx
 * Checks whether a CC application is installed on the local machine.
 *
 * @param targetSpecifier The application specifier; for example "indesign".
 *
 *        Note: In Windows 7 64-bit or Windows 8 64-bit system, some target applications (like Photoshop and Illustrator) have both 32-bit version
 *        and 64-bit version. Therefore, we need to specify the version by this parameter with "photoshop-70.032" or "photoshop-70.064". If you
 *        installed Photoshop 32-bit and 64-bit on one Windows 64-bit system and invoke this interface with parameter "photoshop-70.032", you may
 *        receive wrong result.
 *        The specifiers for Illustrator is "illustrator-17.032", "illustrator-17.064", "illustrator-17" and "illustrator".
 *
 *        In other platforms there is no such issue, so we can use "photoshop" or "photoshop-70" as specifier.
 * @return True if the app is installed, false otherwise.
 */
Vulcan.prototype.isAppInstalled = function (targetSpecifier) {
  console.warn(
    "WARNING! Function 'isAppInstalled' has been deprecated, please use the new 'isAppInstalledEx' function instead!"
  );
  if (!requiredParamsValid(targetSpecifier)) {
    return false;
  }

  var params = {};
  params.targetSpecifier = targetSpecifier;

  return JSON.parse(
    window.__adobe_cep__.invokeSync(
      "vulcanIsAppInstalled",
      JSON.stringify(params)
    )
  ).result;
};

/**
 * DEPRECATED API:: use getAppPathEx
 * Retrieves the local install path of a CC application.
 *
 * @param targetSpecifier The application specifier; for example "indesign".
 *
 *        Note: In Windows 7 64-bit or Windows 8 64-bit system, some target applications (like Photoshop and Illustrator) have both 32-bit version
 *        and 64-bit version. Therefore, we need to specify the version by this parameter with "photoshop-70.032" or "photoshop-70.064". If you
 *        installed Photoshop 32-bit and 64-bit on one Windows 64-bit system and invoke this interface with parameter "photoshop-70.032", you may
 *        receive wrong result.
 *        The specifiers for Illustrator is "illustrator-17.032", "illustrator-17.064", "illustrator-17" and "illustrator".
 *
 *        In other platforms there is no such issue, so we can use "photoshop" or "photoshop-70" as specifier.
 * @return The path string if the application is found, "" otherwise.
 */
Vulcan.prototype.getAppPath = function (targetSpecifier) {
  console.warn(
    "WARNING! Function 'getAppPath' has been deprecated, please use the new 'getAppPathEx' function instead!"
  );
  if (!requiredParamsValid(targetSpecifier)) {
    return "";
  }

  var params = {};
  params.targetSpecifier = targetSpecifier;

  return JSON.parse(
    window.__adobe_cep__.invokeSync("vulcanGetAppPath", JSON.stringify(params))
  ).result;
};

/**
 * Registers a message listener callback function for a Vulcan message.
 *
 * @param type            The message type.
 * @param callback        The callback function that handles the message.
 *                        Takes one argument, the message object.
 * @param obj             Optional, the object containing the callback method, if any.
 *                        Default is null.
 */
Vulcan.prototype.addMessageListener = function (type, callback, obj) {
  if (
    !requiredParamsValid(type, callback) ||
    !strStartsWith(type, VulcanMessage.TYPE_PREFIX)
  ) {
    return;
  }

  var params = {};
  params.type = type;

  window.__adobe_cep__.invokeAsync(
    "vulcanAddMessageListener",
    JSON.stringify(params),
    callback,
    obj
  );
};

/**
 * Removes a registered message listener callback function for a Vulcan message.
 *
 * @param type            The message type.
 * @param callback        The callback function that was registered.
 *                        Takes one argument, the message object.
 * @param obj             Optional, the object containing the callback method, if any.
 *                        Default is null.
 */
Vulcan.prototype.removeMessageListener = function (type, callback, obj) {
  if (
    !requiredParamsValid(type, callback) ||
    !strStartsWith(type, VulcanMessage.TYPE_PREFIX)
  ) {
    return;
  }

  var params = {};
  params.type = type;

  window.__adobe_cep__.invokeAsync(
    "vulcanRemoveMessageListener",
    JSON.stringify(params),
    callback,
    obj
  );
};

/**
 * Dispatches a Vulcan message.
 *
 * @param vulcanMessage   The message object.
 */
Vulcan.prototype.dispatchMessage = function (vulcanMessage) {
  if (
    !requiredParamsValid(vulcanMessage) ||
    !strStartsWith(vulcanMessage.type, VulcanMessage.TYPE_PREFIX)
  ) {
    return;
  }

  var params = {};
  var message = new VulcanMessage(vulcanMessage.type);
  message.initialize(vulcanMessage);
  params.vulcanMessage = message;

  window.__adobe_cep__.invokeSync(
    "vulcanDispatchMessage",
    JSON.stringify(params)
  );
};

/**
 * Retrieves the message payload of a Vulcan message for the registered message listener callback function.
 *
 * @param vulcanMessage   The message object.
 * @return                A string containing the message payload.
 */
Vulcan.prototype.getPayload = function (vulcanMessage) {
  if (
    !requiredParamsValid(vulcanMessage) ||
    !strStartsWith(vulcanMessage.type, VulcanMessage.TYPE_PREFIX)
  ) {
    return null;
  }

  var message = new VulcanMessage(vulcanMessage.type);
  message.initialize(vulcanMessage);
  return message.getPayload();
};

/**
 * Gets all available endpoints of the running Vulcan-enabled applications.
 *
 * Since 7.0.0
 *
 * @return                The array of all available endpoints.
 * An example endpoint string:
 * <endPoint>
 *   <appId>PHXS</appId>
 *   <appVersion>16.1.0</appVersion>
 * </endPoint>
 */
Vulcan.prototype.getEndPoints = function () {
  var params = {};
  return JSON.parse(
    window.__adobe_cep__.invokeSync(
      "vulcanGetEndPoints",
      JSON.stringify(params)
    )
  );
};

/**
 * Gets the endpoint for itself.
 *
 * Since 7.0.0
 *
 * @return                The endpoint string for itself.
 */
Vulcan.prototype.getSelfEndPoint = function () {
  var params = {};
  return window.__adobe_cep__.invokeSync(
    "vulcanGetSelfEndPoint",
    JSON.stringify(params)
  );
};

/** Singleton instance of Vulcan **/
var VulcanInterface = new Vulcan();

//--------------------------------- Vulcan Message ------------------------------

/**
 * @class VulcanMessage
 * Message type for sending messages between host applications.
 * A message of this type can be sent to the designated destination
 * when appId and appVersion are provided and valid. Otherwise,
 * the message is broadcast to all running Vulcan-enabled applications.
 *
 * To send a message between extensions running within one
 * application, use the <code>CSEvent</code> type in CSInterface.js.
 *
 * @param type            The message type.
 * @param appId           The peer appId.
 * @param appVersion      The peer appVersion.
 *
 */
function VulcanMessage(type, appId, appVersion) {
  this.type = type;
  this.scope = VulcanMessage.SCOPE_SUITE;
  this.appId = requiredParamsValid(appId)
    ? appId
    : VulcanMessage.DEFAULT_APP_ID;
  this.appVersion = requiredParamsValid(appVersion)
    ? appVersion
    : VulcanMessage.DEFAULT_APP_VERSION;
  this.data = VulcanMessage.DEFAULT_DATA;
}

VulcanMessage.TYPE_PREFIX = "vulcan.SuiteMessage.";
VulcanMessage.SCOPE_SUITE = "GLOBAL";
VulcanMessage.DEFAULT_APP_ID = "UNKNOWN";
VulcanMessage.DEFAULT_APP_VERSION = "UNKNOWN";
VulcanMessage.DEFAULT_DATA = "<data><payload></payload></data>";
VulcanMessage.dataTemplate = "<data>{0}</data>";
VulcanMessage.payloadTemplate = "<payload>{0}</payload>";

/**
 * Initializes this message instance.
 *
 * @param message         A \c message instance to use for initialization.
 */
VulcanMessage.prototype.initialize = function (message) {
  this.type = message.type;
  this.scope = message.scope;
  this.appId = message.appId;
  this.appVersion = message.appVersion;
  this.data = message.data;
};

/**
 * Retrieves the message data.
 *
 * @return A data string in XML format.
 */
VulcanMessage.prototype.xmlData = function () {
  if (this.data === undefined) {
    var str = "";
    str = String.format(VulcanMessage.payloadTemplate, str);
    this.data = String.format(VulcanMessage.dataTemplate, str);
  }
  return this.data;
};

/**
 * Sets the message payload of this message.
 *
 * @param payload         A string containing the message payload.
 */
VulcanMessage.prototype.setPayload = function (payload) {
  var str = cep.encoding.convertion.utf8_to_b64(payload);
  str = String.format(VulcanMessage.payloadTemplate, str);
  this.data = String.format(VulcanMessage.dataTemplate, str);
};

/**
 * Retrieves the message payload of this message.
 *
 * @return                A string containing the message payload.
 */
VulcanMessage.prototype.getPayload = function () {
  var str = GetValueByKey(this.data, "payload");
  if (str !== null) {
    return cep.encoding.convertion.b64_to_utf8(str);
  }
  return null;
};

/**
 * Converts the properties of this instance to a string.
 *
 * @return The string version of this instance.
 */
VulcanMessage.prototype.toString = function () {
  var str = "type=" + this.type;
  str += ", scope=" + this.scope;
  str += ", appId=" + this.appId;
  str += ", appVersion=" + this.appVersion;
  str += ", data=" + this.xmlData();
  return str;
};

//--------------------------------------- Util --------------------------------

/**
 * Formats a string based on a template.
 *
 * @param src The format template.
 *
 * @return The formatted string
 */
String.format = function (src) {
  if (arguments.length === 0) {
    return null;
  }

  var args = Array.prototype.slice.call(arguments, 1);
  return src.replace(/\{(\d+)\}/g, function (m, i) {
    return args[i];
  });
};

/**
 * Retrieves the content of an XML element.
 *
 * @param xmlStr    The XML string.
 * @param key       The name of the tag.
 *
 * @return          The content of the tag, or the empty string
 *                  if such tag is not found or the tag has no content.
 */
function GetValueByKey(xmlStr, key) {
  if (window.DOMParser) {
    var parser = new window.DOMParser();
    try {
      var xmlDoc = parser.parseFromString(xmlStr, "text/xml");
      var node = xmlDoc.getElementsByTagName(key)[0];
      if (node && node.childNodes[0]) {
        return node.childNodes[0].nodeValue;
      }
    } catch (e) {
      //log the error
    }
  }
  return "";
}

/**
 * Reports whether required parameters are valid.
 *
 * @return    True if all required parameters are valid,
 *            false if any of the required parameters are invalid.
 */
function requiredParamsValid() {
  for (var i = 0; i < arguments.length; i++) {
    var argument = arguments[i];
    if (argument === undefined || argument === null) {
      return false;
    }
  }
  return true;
}

/**
 * Reports whether a string has a given prefix.
 *
 * @param str       The target string.
 * @param prefix    The specific prefix string.
 *
 * @return          True if the string has the prefix, false if not.
 */
function strStartsWith(str, prefix) {
  if (typeof str != "string") {
    return false;
  }
  return str.indexOf(prefix) === 0;
}

// Boilerplate Added Export
export { VulcanMessage };
export default Vulcan;
