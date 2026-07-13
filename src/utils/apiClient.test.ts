import assert from 'node:assert/strict';
import test from 'node:test';

import { readErrorMessage } from '../services/apiClient.ts';

test('api client reads structured generation task errors', async () => {
  const response = new Response(JSON.stringify({
    error: {
      code: 'PROVIDER_TIMEOUT',
      message: 'Provider timed out',
      retryable: true
    }
  }), { status: 500, statusText: 'Internal Server Error' });

  assert.equal(await readErrorMessage(response), 'Provider timed out');
});
