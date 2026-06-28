// html2epub's convertDocumentToEPub takes a logger matching this shape
// (see node_modules/html2epub/src/logger.ts). We back it with the console so
// conversion progress and errors surface in the popup's devtools.

export interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
}

/** Console-backed logger passed into html2epub. */
export const consoleLogger: Logger = {
  log: (message) => console.log(`[webpage2epub] ${message}`),
  error: (message) => console.error(`[webpage2epub] ${message}`),
};
