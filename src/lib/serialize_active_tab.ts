import browser from "./browser";

export interface SerializedPage {
  url: string;
  html: string;
  // The tab the HTML came from, so the save step can inject back into the same
  // tab (Firefox Android download fallback) without a second tabs.query that
  // could resolve a different tab if the user switched mid-conversion.
  tabId: number;
}

// Injected into the active tab. Reads the live, already-rendered DOM so we never
// re-fetch the page (a re-fetch would lose auth/session state and re-run scripts).
// tabId is added by the caller, which is the only side that knows it.
function serializeCurrentDocument(): Omit<SerializedPage, "tabId"> {
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

  const result = results[0]?.result as
    | Omit<SerializedPage, "tabId">
    | undefined;
  if (!result?.html) {
    throw new Error(
      `Failed to serialize active tab ${tab.id}; executeScript result: ${JSON.stringify(results[0])}`,
    );
  }

  return { ...result, tabId: tab.id };
}
