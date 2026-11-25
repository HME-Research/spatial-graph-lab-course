/**
 * Web Worker entry for uploaded analyses (Programme P4, item I). One worker per request: the host
 * (`uploadedAnalyses.ts`) posts one `UploadRequest`, receives one `UploadReply` and terminates the
 * worker, or terminates it after the timeout. See `uploadSandbox.ts`.
 */
import { handleUploadRequest, lockDownWorkerGlobals, type UploadRequest } from './uploadSandbox';

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
// Kept before the lock-down and before any uploaded code runs.
const reply = scope.postMessage.bind(scope);
lockDownWorkerGlobals(globalThis);

scope.onmessage = (event) => {
  reply(handleUploadRequest(event.data as UploadRequest));
};
