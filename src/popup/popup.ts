import serializeActiveTab from "../lib/serialize_active_tab";
import convertPageToEpub from "../lib/convert_page_to_epub";
import downloadEpub from "../lib/download_epub";

// The popup window hosts the conversion, so it must stay open until the download
// starts — closing it tears down the in-flight work. We reflect progress in the
// button/status instead of auto-closing.

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
  setStatus("Reading page…");

  try {
    const { url, html } = await serializeActiveTab();
    setStatus("Converting to ePub…");
    const { title, epub } = await convertPageToEpub(url, html);
    await downloadEpub(epub, title);
    setStatus(`Saved “${title}”.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
  }
}

button.addEventListener("click", convertActivePage);
