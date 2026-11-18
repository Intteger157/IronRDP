/**
 * Reads and writes the local clipboard for the component instead of `navigator.clipboard`, for hosts where the
 * browser's clipboard API can't be polled (WebKit shows a "Paste" menu on every read), e.g. a desktop app that has
 * native clipboard access. Keys are MIME types: `text/*` values are strings, `image/*` values are bytes.
 */
export interface ClipboardProvider {
    /** The clipboard content if it changed since the previous `read` or `write`, otherwise `null`. */
    read(): Promise<Record<string, string | Uint8Array> | null>;

    /** Replaces the clipboard content with what the server copied. */
    write(items: Record<string, string | Uint8Array>): Promise<void>;
}
