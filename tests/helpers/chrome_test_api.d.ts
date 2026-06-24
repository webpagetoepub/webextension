// Minimal chrome.downloads surface used only inside Playwright `page.evaluate`
// blocks (the download-integration spec), which run in the extension page where
// `chrome` is native. Merges (declaration merging) with the production
// src/types/chrome_offscreen.d.ts. Production code never touches this — it goes
// through webextension-polyfill.

declare namespace chrome {
  namespace downloads {
    interface DownloadItem {
      id: number;
      state: string;
      filename: string;
    }
    function search(query: {
      id?: number;
      limit?: number;
    }): Promise<DownloadItem[]>;
  }
  namespace runtime {
    // Used by service_worker_registers.spec.ts inside worker.evaluate to confirm
    // the background module reached its top-level onMessage registration.
    const onMessage: {
      hasListeners(): boolean;
    };
  }
}
