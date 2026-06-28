// html2epub ships raw TypeScript as its entry (main: src/index.ts). esbuild
// bundles that source directly, but `tsc` would otherwise descend into it and
// flag the dependency's own code under our stricter compiler flags. The typecheck
// config maps the `html2epub` import to this stub (see tsconfig.typecheck.json),
// pinning the public signature we rely on (node_modules/html2epub/src/index.ts)
// and keeping type-checking scoped to our own code.
export interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
}

export default function convertDocumentToEPub(
  url: string,
  htmlContent: Promise<string>,
  loadImageFrom: (url: string) => Promise<Blob>,
  callbackStepCompleted: () => void,
  callbackLength: (length: number) => void,
  logger: Logger,
): Promise<{ title: string; epub: Blob }>;
