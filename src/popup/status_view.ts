import { ConversionStatus } from "../lib/messages";

export interface StatusView {
  text: string;
  isError: boolean;
  busy: boolean;
}

/**
 * Map a background conversion status to what the popup should render. Pure so it
 * can be unit-tested without the extension runtime.
 *
 * @example
 *   statusView({ state: "done", title: "Hi" }); // { text: 'Saved “Hi”.', … }
 */
export default function statusView(status: ConversionStatus): StatusView {
  switch (status.state) {
    case "idle":
      return { text: "", isError: false, busy: false };
    case "converting":
      return {
        text: status.title
          ? `Converting “${status.title}” to ePub…`
          : "Converting to ePub…",
        isError: false,
        busy: true,
      };
    case "done":
      return { text: `Saved “${status.title}”.`, isError: false, busy: false };
    case "error":
      return { text: status.message, isError: true, busy: false };
  }
}
