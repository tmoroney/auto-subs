// FOR REFERENCE ONLY -- THIS FILE IS NOT BUNDLED

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

// This is the JavaScript code for bridging to native functionality
// See CEPEngine_extensions.cpp for implementation of native methods.
//
// Note: So far all native file i/o functions are synchronous, and aynchronous file i/o is TBD.

/** Version v11.0.0 */

/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true, indent: 4, forin: true, maxerr: 50, regexp: true */
/*global define, native */

var cep;
if (!cep) {
   cep = {};
}
if (!cep.fs) {
    cep.fs = {};
}
if (!cep.process) {
    cep.process = {};
}
if (!cep.encoding) {
    cep.encoding = {};
}
if (!cep.util) {
    cep.util = {};
}
(function () {
    // Internal function to get the last error code.
    native function GetLastError();
    function getLastError() {
        return GetLastError();
    }

    function getErrorResult(){
        var result = {err: getLastError()};
        return result;
    }

    // Error values. These MUST be in sync with the error values
    // at the top of CEPEngine_extensions.cpp

    /**
     * @constant No error.
     */
    cep.fs.NO_ERROR                    = 0;

    /**
     * @constant Unknown error occurred.
     */
    cep.fs.ERR_UNKNOWN                 = 1;

    /**
     * @constant Invalid parameters passed to function.
     */
    cep.fs.ERR_INVALID_PARAMS          = 2;

    /**
     * @constant File or directory was not found.
     */
    cep.fs.ERR_NOT_FOUND               = 3;

    /**
     * @constant File or directory could not be read.
     */
    cep.fs.ERR_CANT_READ               = 4;

    /**
     * @constant An unsupported encoding value was specified.
     */
    cep.fs.ERR_UNSUPPORTED_ENCODING    = 5;

    /**
     * @constant File could not be written.
     */
    cep.fs.ERR_CANT_WRITE              = 6;

    /**
     * @constant Target directory is out of space. File could not be written.
     */
    cep.fs.ERR_OUT_OF_SPACE            = 7;

    /**
     * @constant Specified path does not point to a file.
     */
    cep.fs.ERR_NOT_FILE                = 8;

    /**
     * @constant Specified path does not point to a directory.
     */
    cep.fs.ERR_NOT_DIRECTORY           = 9;

    /**
     * @constant Specified file already exists.
     */
    cep.fs.ERR_FILE_EXISTS             = 10;

    /**
     * @constant The maximum number of processes has been exceeded.
     */
    cep.process.ERR_EXCEED_MAX_NUM_PROCESS  = 101;

    /**
     * @constant Invalid URL.
     */
    cep.util.ERR_INVALID_URL = 201;
    
    /**
     * @constant deprecated API.
     */         
     cep.util.DEPRECATED_API = 202;

    /**
     * @constant UTF8 encoding type.
     */
    cep.encoding.UTF8                   = "UTF-8";

    /**
     * @constant Base64 encoding type.
     */
    cep.encoding.Base64                 = "Base64";

    /**
     * Displays the OS File Open dialog, allowing the user to select files or directories.
     *
     * @param allowMultipleSelection {boolean} When true, multiple files/folders can be selected.
     * @param chooseDirectory {boolean} When true, only folders can be selected. When false, only
     *        files can be selected.
     * @param title {string} Title of the open dialog.
     * @param initialPath {string} Initial path to display in the dialog. Pass NULL or "" to
     *        display the last path chosen.
     * @param fileTypes {Array.<string>} The file extensions (without the dot) for the types
     *      of files that can be selected. Ignored when chooseDirectory=true.
     *
     * @return An object with these properties:
     *      <ul><li>"data": An array of the full names of the selected files.</li>
     *          <li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_INVALID_PARAMS </li>
     *      </ul>
     **/
    native function ShowOpenDialog();
    cep.fs.showOpenDialog = function (allowMultipleSelection, chooseDirectory, title, initialPath, fileTypes) {
           var resultString = ShowOpenDialog(allowMultipleSelection, chooseDirectory,
                                             title || 'Open', initialPath || '',
                                             fileTypes ? fileTypes.join(' ') : '');

           var result = {data: JSON.parse(resultString || '[]'), err: getLastError() };
           return result;
    };

    /**
     * Displays the OS File Open dialog, allowing the user to select files or directories.
     *
     * @param allowMultipleSelection {boolean} When true, multiple files/folders can be selected.
     * @param chooseDirectory {boolean} When true, only folders can be selected. When false, only
     *        files can be selected.
     * @param title {string} Title of the open dialog.
     * @param initialPath {string} Initial path to display in the dialog. Pass NULL or "" to
     *        display the last path chosen.
     * @param fileTypes {Array.<string>} The file extensions (without the dot) for the types
     *      of files that can be selected. Ignored when chooseDirectory=true.
     * @param friendlyFilePrefix {string} String to put in front of the extensions
     *      of files that can be selected. Ignored when chooseDirectory=true. (win only)
     *      For example: 
     *          fileTypes = ["gif", "jpg", "jpeg", "png", "bmp", "webp", "svg"];
     *          friendlyFilePrefix = "Images (*.gif;*.jpg;*.jpeg;*.png;*.bmp;*.webp;*.svg)";
     * @param prompt {string} String for OK button (mac only, default is "Open" on mac, "Open" or "Select Folder" on win).
     *
     * @return An object with these properties:
     *      <ul><li>"data": An array of the full names of the selected files.</li>
     *          <li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_INVALID_PARAMS </li>
     *      </ul>
     **/
    native function ShowOpenDialogEx();
    cep.fs.showOpenDialogEx = function (allowMultipleSelection, chooseDirectory, title, initialPath, fileTypes,
                                        friendlyFilePrefix, prompt) {
           var resultString = ShowOpenDialogEx(allowMultipleSelection, chooseDirectory,
                                               title || 'Open', initialPath || '',
                                               fileTypes ? fileTypes.join(' ') : '', friendlyFilePrefix || '',
                                               prompt || '');

           var result = {data: JSON.parse(resultString || '[]'), err: getLastError() };
           return result;
    };

    /**
     * Displays the OS File Save dialog, allowing the user to type in a file name.
     *
     * @param title {string} Title of the save dialog.
     * @param initialPath {string} Initial path to display in the dialog. Pass NULL or "" to
     *        display the last path chosen.
     * @param fileTypes {Array.<string>} The file extensions (without the dot) for the types
     *      of files that can be selected.
     * @param defaultName {string} String to start with for the file name.
     * @param friendlyFilePrefix {string} String to put in front of the extensions of files that can be selected. (win only)
     *      For example: 
     *          fileTypes = ["gif", "jpg", "jpeg", "png", "bmp", "webp", "svg"];
     *          friendlyFilePrefix = "Images (*.gif;*.jpg;*.jpeg;*.png;*.bmp;*.webp;*.svg)";
     * @param prompt {string} String for Save button (mac only, default is "Save" on mac and win).
     * @param nameFieldLabel {string} String displayed in front of the file name text field (mac only, "File name:" on win).
     *
     * @return An object with these properties:
     *      <ul><li>"data": The file path selected to save at or "" if canceled</li>
     *          <li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_INVALID_PARAMS </li>
     *      </ul>
     **/
    native function ShowSaveDialogEx();
    cep.fs.showSaveDialogEx = function (title, initialPath, fileTypes, defaultName, friendlyFilePrefix, prompt, nameFieldLabel) {
           var resultString = ShowSaveDialogEx(title || '', initialPath || '',
                                               fileTypes ? fileTypes.join(' ') : '', defaultName || '',
                                               friendlyFilePrefix || '', prompt || '', nameFieldLabel || '');

           var result = {data: resultString || '', err: getLastError() };
           return result;
    };

    /**
     * Reads the contents of a folder.
     *
     * @param path {string} The path of the folder to read.
     *
     * @return An object with these properties:
     *      <ul><li>"data": An array of the names of the contained files (excluding '.' and '..'.</li>
     *          <li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_NOT_FOUND
     *          <br>ERR_CANT_READ </li></ul>
     **/
    native function ReadDir();
    cep.fs.readdir = function (path) {
        var resultString = ReadDir(path);
        var result = {data: JSON.parse(resultString || '[]'), err: getLastError() };
         return result;
    };

    /**
     * Creates a new folder.
     *
     * @param path {string} The path of the folder to create.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS</li></ul>
     **/
     native function MakeDir();
    cep.fs.makedir = function (path) {
        MakeDir(path);
        return getErrorResult();
    };

    /**
     * Renames a file or folder.
     *
     * @param oldPath {string}  The old name of the file or folder.
     * @param newPath {string}  The new name of the file or folder.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_NOT_FOUND
     *          <br>ERR_FILE_EXISTS </li></ul>
     **/
     native function Rename();
    cep.fs.rename = function(oldPath, newPath) {
        Rename(oldPath, newPath);
        return getErrorResult();
    };

    /**
     * Reports whether an item is a file or folder.
     *
     * @param path {string} The path of the file or folder.
     *
     * @return An object with these properties:
     *      <ul><li>"data": An object with properties
     *          <br>isFile (boolean)
     *          <br>isDirectory (boolean)
     *          <br>mtime (modification DateTime) </li>
     *          <li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_NOT_FOUND  </li>
     *      </ul>
     **/
    native function IsDirectory();
    native function GetFileModificationTime();
    cep.fs.stat = function (path) {
        var isDir = IsDirectory(path);
        var modtime = GetFileModificationTime(path);
        var result = {
        data: {
            isFile: function () {
                return !isDir;
            },
            isDirectory: function () {
                return isDir;
            },
            mtime: modtime
        },
        err: getLastError()
        };

        return result;
    };

    /**
     * Reads the entire contents of a file.
     *
     * @param path {string}  The path of the file to read.
     * @param encoding {string}  The encoding of the contents of file, one of
     *      UTF8 (the default) or Base64.
     *
     * @return An object with these properties:
     *      <ul><li>"data": The file contents. </li>
     *          <li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_NOT_FOUND
     *          <br>ERR_CANT_READ
     *          <br>ERR_UNSUPPORTED_ENCODING </li>
     *      </ul>
     **/
    native function ReadFile();
    cep.fs.readFile = function (path, encoding) {
        encoding = encoding ? encoding : cep.encoding.UTF8;
        var contents = ReadFile(path, encoding);
        var result = {data: contents, err: getLastError() };
        return result;
    };

    /**
     * Writes data to a file, replacing the file if it already exists.
     *
     * @param path {string}  The path of the file to write.
     * @param data {string}  The data to write to the file.
     * @param encoding {string}  The encoding of the contents of file, one of
     *      UTF8 (the default) or Base64.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_UNSUPPORTED_ENCODING
     *          <br>ERR_CANT_WRITE
     *          <br>ERR_OUT_OF_SPACE </li></ul>
     **/
    native function WriteFile();
    cep.fs.writeFile = function (path, data, encoding) {
        encoding = encoding ? encoding : cep.encoding.UTF8;
        WriteFile(path, data, encoding);
        return getErrorResult();
    };

    /**
     * Sets permissions for a file or folder.
     *
     * @param path {string}  The path of the file or folder.
     * @param mode {number}  The permissions in numeric format (for example, 0777).
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_CANT_WRITE </li></ul>
     **/
    native function SetPosixPermissions();
    cep.fs.chmod = function (path, mode) {
        SetPosixPermissions(path, mode);
        return getErrorResult();
    };

    /**
     * Deletes a file.
     *
     * @param path {string}  The path of the file to delete.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_NOT_FOUND
     *          <br>ERR_NOT_FILE </li></ul>
     **/
    native function DeleteFileOrDirectory();
    native function IsDirectory();
    cep.fs.deleteFile = function (path) {
        if (IsDirectory(path)) {
            var result = {err: cep.fs.ERR_NOT_FILE};
            return result;
        }
        DeleteFileOrDirectory(path);
        return getErrorResult();
    };

    /**
     * Creates a process.
     *
     * @param arguments {list} The arguments to create process. The first one is the full path of the executable,
     *                         followed by the arguments of the executable.
     *
     * @return An object with these properties:
     *      <ul><li>"data": The pid of the process, or -1 on error. </li>
     *          <li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_EXCEED_MAX_NUM_PROCESS
     *          <br>ERR_NOT_FOUND
     *          <br>ERR_NOT_FILE</li>
     *      </ul>
     **/
    native function CreateProcess();
    cep.process.createProcess = function () {
        var args = Array.prototype.slice.call(arguments);
        var pid = CreateProcess(args);
        var result = {data: pid, err: getLastError()};
        return result;
    };

    /**
     * Registers a standard-output handler for a process.
     *
     * @param pid {int} The pid of the process.
     * @param callback {function}  The handler function for the standard output callback.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_INVALID_PROCESS_ID </li></ul>
     **/
    native function SetupStdOutHandler();
    cep.process.stdout = function (pid, callback) {
        SetupStdOutHandler(pid, callback);
        return getErrorResult();
    };

    /**
     * Registers up a standard-error handler for a process.
     *
     * @param pid {int} The pid of the process.
     * @param callback {function}  The handler function for the standard error callback.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_INVALID_PROCESS_ID </li></ul>
     **/
    native function SetupStdErrHandler();
    cep.process.stderr = function (pid, callback) {
        SetupStdErrHandler(pid, callback);
        return getErrorResult();
    };

    /**
     * Writes data to the standard input of a process.
     *
     * @param pid {int}  The pid of the process
     * @param data {string} The data to write.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_INVALID_PROCESS_ID </li></ul>
     **/
    native function WriteStdIn();
    cep.process.stdin = function (pid, data) {
        WriteStdIn(pid, data);
        return getErrorResult();
    };

    /**
     * Retrieves the working directory of a process.
     *
     * @param pid {int} The pid of the process.
     *
     * @return An object with these properties:
     *      <ul><li>"data": The path of the working directory. </li>
     *          <li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_INVALID_PROCESS_ID </li></ul>
     **/
    native function GetWorkingDirectory();
    cep.process.getWorkingDirectory = function (pid) {
        var wd = GetWorkingDirectory(pid);
        var result = {data: wd, err: getLastError()};
        return result;
    };

    /**
     * Waits for a process to quit.
     *
     * @param pid {int} The pid of the process.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_INVALID_PROCESS_ID </li></ul>
     **/
    native function WaitFor();
    cep.process.waitfor = function (pid) {
        WaitFor(pid);
        return getErrorResult();
    };

    /**
     * Registers a handler for the onquit callback of a process.
     *
     * @param pid {int}  The pid of the process.
     * @param callback {function}  The handler function.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_INVALID_PROCESS_ID </li></ul>
     **/
    native function OnQuit();
    cep.process.onquit = function (pid, callback) {
        OnQuit(pid, callback);
        return getErrorResult();
    };

    /**
     * Reports whether a process is currently running.
     *
     * @param pid {int} The pid of the process.
     *
     * @return An object with these properties:
     *      <ul><li>"data": True if the process is running, false otherwise. </li>
     *          <li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_INVALID_PROCESS_ID </li></ul>
     **/
    native function IsRunning();
    cep.process.isRunning = function (pid) {
        var isRunning = IsRunning(pid);
        var result = {data: isRunning, err: getLastError()};
        return result;
    };

    /**
     * Terminates a process.
     *
     * @param pid {int} The pid of the process
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS
     *          <br>ERR_INVALID_PROCESS_ID </li></ul>
     **/
    native function Terminate();
    cep.process.terminate = function (pid) {
        Terminate(pid);
        return getErrorResult();
    };

   /**
    * Encoding conversions.
    *
    */
    cep.encoding.convertion =
    {
        utf8_to_b64: function(str) {
            return window.btoa(unescape(encodeURIComponent(str)));
        },

        b64_to_utf8: function(base64str) {
            // If a base64 string contains any whitespace character, DOM Exception 5 occurs during window.atob, please see
			// http://stackoverflow.com/questions/14695988/dom-exception-5-invalid-character-error-on-valid-base64-image-string-in-javascri
            base64str = base64str.replace(/\s/g, '');
            return decodeURIComponent(escape(window.atob(base64str)));
        },

        binary_to_b64: function(binary) {
            return window.btoa(binary);
        },

        b64_to_binary: function(base64str) {
            return window.atob(base64str);
        },

        ascii_to_b64: function(ascii) {
            return window.btoa(binary);
        },

        b64_to_ascii: function(base64str) {
            return window.atob(base64str);
        }
    };

    /**
     * Opens a page in the default system browser.
     *
     * @param url {string} The URL of the page/file to open, or the email address.
     * Must use HTTP/HTTPS/file/mailto. For example:
     *  "http://www.adobe.com"
     *  "https://github.com"
     *  "file:///C:/log.txt"
     *  "mailto:test@adobe.com"
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_UNKNOWN
     *          <br>ERR_INVALID_PARAMS</li></ul>
     **/
    native function OpenURLInDefaultBrowser();
    cep.util.openURLInDefaultBrowser = function (url) {
        if (url && (url.indexOf("http://") === 0 || 
                    url.indexOf("https://") === 0 || 
                    url.indexOf("file://") === 0 || 
                    url.indexOf("mailto:") === 0)) {
            OpenURLInDefaultBrowser(url);
            return getErrorResult();
        } else {
            return { err : cep.util.ERR_INVALID_URL };
        }
    };

    /**
     * Registers a callback function for extension unload. If called more than once,
     * the last callback that is successfully registered is used.
     *
     * @deprecated since version 6.0.0
     *
     * @param callback {function}  The handler function.
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of:
     *          <br>NO_ERROR
     *          <br>ERR_INVALID_PARAMS</li></ul>
     **/
    native function RegisterExtensionUnloadCallback();
    cep.util.registerExtensionUnloadCallback = function (callback) {
        return { err : cep.util.DEPRECATED_API };
    };
    
    /**
     * Stores the user's proxy credentials
     *
     * @param username {string}  proxy username
     * @param password {string}  proxy password
     *
     * @return An object with this property:
     *      <ul><li>"err": The status of the operation, one of
     *          <br>NO_ERROR
     *          <br>ERR_INVALID_PARAMS </li>
     *      </ul>
     **/
    native function StoreProxyCredentials();
    cep.util.storeProxyCredentials = function (username, password) {
           StoreProxyCredentials(username, password);
           return getErrorResult();
    };
    
})();