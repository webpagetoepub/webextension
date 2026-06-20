import browser from "./browser";

export interface SerializedPage {
  url: string;
  html: string;
}

// Injected into the active tab. Reads the live, already-rendered DOM so we never
// re-fetch the page (a re-fetch would lose auth/session state and re-run scripts).
function serializeCurrentDocument(): SerializedPage {
  return { url: location.href, html: document.documentElement.outerHTML };
}

/**
 * Serialize the currently active tab's loaded DOM.
 *
 * @example
 *   const { url, html } = await serializeActiveTab();
 */
export default async function serializeActiveTab(): Promise<SerializedPage> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error(
      `No active tab to convert (got tab: ${JSON.stringify(tab)})`,
    );
  }

  const results = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: serializeCurrentDocument,
  });

  const page = results[0]?.result as SerializedPage | undefined;
  if (!page?.html) {
    throw new Error(
      `Failed to serialize active tab ${tab.id}; executeScript result: ${JSON.stringify(results[0])}`,
    );
  }

  return page;
}
