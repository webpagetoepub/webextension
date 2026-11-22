import { ConversionStatus } from "./messages";

// Pure error-handling seam for the background's conversion catch block. It lives
// outside background_core.ts (which imports ./lib/browser at module top, and so
// throws when imported outside an extension) specifically so it can be unit-tested
// in plain Node. It depends only on the ConversionStatus type — no browser APIs.

/**
 * Report a failed conversion: publish the error status (desktop popup renders it)
 * and, when supplied, hand the message to a browser-specific notifier. The notifier
 * is how Firefox Android surfaces the failure in-page, since it has no popup to show
 * the published status (see src/firefox/notify_error_in_page.ts).
 *
 * @example
 *   reportConversionError(err, publishStatus, notifyErrorInPage);
 */
export default function reportConversionError(
  error: unknown,
  publish: (status: ConversionStatus) => void,
  onConversionError?: (message: string) => void,
): void {
  const message = error instanceof Error ? error.message : String(error);
  publish({ state: "error", message });
  onConversionError?.(message);
}
