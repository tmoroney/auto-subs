export declare interface cep_node {
  global: any;
  process: any;
  buffer: any;
  require: any;
}
export declare interface cep {
  encoding: {
    Base64: "Base64" | string;
    UTF8: "UTF-8" | string;
    convertion: {
      utf8_to_b64: (...params: any) => {};
      b64_to_utf8: (...params: any) => {};
      binary_to_b64: (...params: any) => {};
      b64_to_binary: (...params: any) => {};
      ascii_to_b64: (...params: any) => {};
    };
  };
  fs: {
    ERR_CANT_READ: number;
    ERR_CANT_WRITE: number;
    ERR_FILE_EXISTS: number;
    ERR_INVALID_PARAMS: number;
    ERR_NOT_DIRECTORY: number;
    ERR_NOT_FILE: number;
    ERR_NOT_FOUND: number;
    ERR_OUT_OF_SPACE: number;
    ERR_UNKNOWN: number;
    ERR_UNSUPPORTED_ENCODING: number;
    NO_ERROR: number;
    chmod: (...params: any) => {};
    deleteFile: (...params: any) => {};
    makedir: (...params: any) => {};
    readFile: (...params: any) => {};
    readdir: (...params: any) => {};
    rename: (...params: any) => {};
    showOpenDialog: (...params: any) => {};
    showOpenDialogEx: (...params: any) => {};
    showSaveDialogEx: (...params: any) => {};
    stat: (...params: any) => {};
    writeFile: (...params: any) => {};
  };
  process: {
    ERR_EXCEED_MAX_NUM_PROCESS: number;
    createProcess: (...params: any) => {};
    getWorkingDirectory: (...params: any) => {};
    isRunning: (...params: any) => {};
    onquit: (...params: any) => {};
    stderr: (...params: any) => {};
    stdin: (...params: any) => {};
    stdout: (...params: any) => {};
    terminate: (...params: any) => {};
    waitfor: (...params: any) => {};
  };
  util: {
    DEPRECATED_API: number;
    ERR_INVALID_URL: number;
    openURLInDefaultBrowser: (...params: any) => {};
    registerExtensionUnloadCallback: (...params: any) => {};
    storeProxyCredentials: (...params: any) => {};
  };
}

export interface __adobe_cep__ {
  addEventListener: (...params: any) => {};
  analyticsLogging: (...params: any) => {};
  autoThemeColorChange: (...params: any) => {};
  closeExtension: (...params: any) => {};
  dispatchEvent: (...params: any) => {};
  dumpInstallationInfo: (...params: any) => {};
  evalScript: (...params: any) => {};
  getCurrentApiVersion: (...params: any) => {};
  getCurrentImsUserId: (...params: any) => {};
  getExtensionId: (...params: any) => {};
  getExtensions: (...params: any) => {};
  getHostCapabilities: (...params: any) => {};
  getHostEnvironment: (...params: any) => {};
  getMonitorScaleFactor: (...params: any) => {};
  getNetworkPreferences: (...params: any) => {};
  getScaleFactor: (...params: any) => {};
  getSystemPath: (...params: any) => {};
  imsConnect: (...params: any) => {};
  imsDisconnect: (...params: any) => {};
  imsFetchAccessToken: (...params: any) => {};
  imsFetchAccounts: (...params: any) => {};
  imsSetProxyCredentials: (...params: any) => {};
  initResourceBundle: (...params: any) => {};
  invokeAsync: (...params: any) => {};
  invokeSync: (...params: any) => {};
  nglImsFetchAccessToken: (...params: any) => {};
  nglImsFetchProfile: (...params: any) => {};
  registerInvalidCertificateCallback: (...params: any) => {};
  registerKeyEventsInterest: (...params: any) => {};
  removeEventListener: (...params: any) => {};
  requestOpenExtension: (...params: any) => {};
  resizeContent: (...params: any) => {};
  setScaleFactorChangedHandler: (...params: any) => {};
  showAAM: (...params: any) => {};
}
