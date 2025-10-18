# Voice Evaluation CLI

This guide replaces the legacy `voice-test.ts` helper. The CLI lets QA and support teams replay voice-evaluation payloads without loading the deprecated workspace.

## Installation

```bash
npm install
chmod +x scripts/voice-evaluation-cli.mjs
```

## Usage

```bash
node scripts/voice-evaluation-cli.mjs   --audio path/to/audio.wav   --question route_security_issues   --municipality nezahualcoyotl   --context qa_smoke
```

Environment variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `VOICE_BFF_URL` | Target BFF endpoint | `http://localhost:3000` |
| `VOICE_API_TOKEN` | Optional bearer token | (none) |

Pass `--dry-run` to print the payload without sending a request.

## Output

The script dumps the JSON response from the BFF. Combine it with the `OfflineService` queue logs for end-to-end diagnostics.

## Browser Interop

To expose the helper in the browser (similar to the legacy console script):

```ts
import { testVoiceEvaluation } from '@services/utils/voice-testing';
window.testVoiceEvaluation = testVoiceEvaluation;
```

The CLI can run in CI pipelines where sample audio files are available.
