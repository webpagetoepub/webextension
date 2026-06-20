import browser from "./browser";

// Characters Chrome/Firefox reject in download filenames (path separators and
// reserved characters), collapsed to a single hyphen.
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]+/g;

function toEpubFilename(title: string): string {
  const base = title
    .trim()
    .replace(ILLEGAL_FILENAME_CHARS, "-")
    .replace(/\s+/g, " ");
  return `${base || "page"}.epub`;
}

// Revoke the object URL only once the download has reached a terminal state, so
// we never pull the blob out from under an in-flight write.
function revokeWhenDownloadSettles(
  downloadId: number,
  objectUrl: string,
): void {
  const onChanged = (delta: browser.Downloads.OnChangedDownloadDeltaType) => {
    if (delta.id !== downloadId || !delta.state) {
      return;
    }
    if (
      delta.state.current === "complete" ||
      delta.state.current === "interrupted"
    ) {
      URL.revokeObjectURL(objectUrl);
      browser.downloads.onChanged.removeListener(onChanged);
    }
  };
  browser.downloads.onChanged.addListener(onChanged);
}

/**
 * Save an EPUB blob to the user's Downloads folder.
 *
 * @example
 *   await downloadEpub(epubBlob, 'My Article');
 */
export default async function downloadEpub(
  epub: Blob,
  title: string,
): Promise<number> {
  const objectUrl = URL.createObjectURL(epub);
  const downloadId = await browser.downloads.download({
    url: objectUrl,
    filename: toEpubFilename(title),
    saveAs: false,
  });

  revokeWhenDownloadSettles(downloadId, objectUrl);

  return downloadId;
}
