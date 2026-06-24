import browser from "../lib/browser";
import {
  ConvertActiveTabMessage,
  ConvertResponse,
  isFailure,
} from "../lib/messages";

// The popup is now a thin trigger: it hands the work to the background context
// (Chrome service worker / Firefox background page), which converts and saves
// independently. So closing the popup mid-conversion no longer aborts it — the
// download still completes. If the popup is still open we reflect the result.

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} element in popup.html`);
  }
  return element as T;
}

const button = requireElement<HTMLButtonElement>("convert");
const status = requireElement<HTMLParagraphElement>("status");

function setStatus(message: string, isError = false): void {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function convertActivePage(): Promise<void> {
  button.disabled = true;
  setStatus("Converting to ePub…");

  try {
    const message: ConvertActiveTabMessage = { type: "convert-active-tab" };
    const response = (await browser.runtime.sendMessage(
      message,
    )) as ConvertResponse;
    if (isFailure(response)) {
      throw new Error(response.error);
    }
    setStatus(`Saved “${response.title}”.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
  }
}

button.addEventListener("click", convertActivePage);
