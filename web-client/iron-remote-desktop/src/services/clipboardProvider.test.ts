import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteDesktopService } from './remote-desktop.service';
import { ClipboardService } from './clipboard.service';
import type { RemoteDesktopModule } from '../interfaces/RemoteDesktopModule';
import type { ClipboardData } from '../interfaces/ClipboardData';
import type { ClipboardProvider } from '../interfaces/ClipboardProvider';

/**
 * A host's clipboard provider replaces `navigator.clipboard`: it is polled while the page has the focus, only its
 * changes go to the server, and what the server copies is written to it.
 */

class FakeClipboardData {
    entries: [string, string | Uint8Array][] = [];
    addText(mime: string, value: string) {
        this.entries.push([mime, value]);
    }
    addBinary(mime: string, value: Uint8Array) {
        this.entries.push([mime, value]);
    }
    isEmpty() {
        return this.entries.length === 0;
    }
    items() {
        return this.entries.map(([mime, value]) => ({ mimeType: () => mime, value: () => value }));
    }
}

const module = { ClipboardData: FakeClipboardData } as unknown as RemoteDesktopModule;

describe('clipboard provider', () => {
    let service: RemoteDesktopService;
    let sent: ReturnType<typeof vi.fn>;
    let provider: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };

    async function started() {
        service = new RemoteDesktopService(module);
        sent = vi.fn(async () => {});
        service.onClipboardChanged = sent as unknown as RemoteDesktopService['onClipboardChanged'];
        const clipboard = new ClipboardService(service, module);
        await clipboard.initClipboard();
        clipboard.setProvider(provider as unknown as ClipboardProvider);
        service.sessionStartedObservable.publish(null);
        return clipboard;
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        vi.spyOn(document, 'hasFocus').mockReturnValue(true);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        // Without a secure context the browser's clipboard is never set up; the provider still works.
        vi.stubGlobal('isSecureContext', false);
        provider = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('sends text and images the provider reports', async () => {
        await started();
        const png = new Uint8Array([137, 80, 78, 71]);
        provider.read.mockResolvedValueOnce({ 'text/plain': 'hello', 'image/png': png, 'text/html': '' });

        await vi.advanceTimersByTimeAsync(150);

        expect(sent).toHaveBeenCalledTimes(1);
        const data = sent.mock.calls[0][0] as FakeClipboardData;
        expect(data.entries).toEqual([
            ['text/plain', 'hello'],
            ['image/png', png],
        ]);
    });

    it('sends nothing while the content is unchanged or the page has no focus', async () => {
        await started();
        await vi.advanceTimersByTimeAsync(350);
        expect(provider.read).toHaveBeenCalled();
        expect(sent).not.toHaveBeenCalled();

        vi.mocked(document.hasFocus).mockReturnValue(false);
        provider.read.mockClear();
        await vi.advanceTimersByTimeAsync(350);
        expect(provider.read).not.toHaveBeenCalled();
    });

    it('writes what the server copied to the provider', async () => {
        await started();
        const remote = new FakeClipboardData();
        remote.addText('text/plain', 'from server');
        const callback = (service as unknown as { onRemoteClipboardChanged: (d: ClipboardData) => void })
            .onRemoteClipboardChanged;

        callback(remote as unknown as ClipboardData);

        expect(provider.write).toHaveBeenCalledWith({ 'text/plain': 'from server' });
    });

    it('stops polling when the session ends', async () => {
        await started();
        service.sessionEndedObservable.publish(null);
        provider.read.mockClear();
        await vi.advanceTimersByTimeAsync(350);
        expect(provider.read).not.toHaveBeenCalled();
    });
});
