import test from 'node:test';
import assert from 'node:assert/strict';

type CanvasWheelModule = {
  CANVAS_WHEEL_LISTENER_OPTIONS?: AddEventListenerOptions;
  preventCanvasWheelDefault?: (event: { preventDefault: () => void }) => void;
};

async function loadCanvasWheel(): Promise<CanvasWheelModule> {
  try {
    return await import('./canvasWheel.ts') as CanvasWheelModule;
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

test('uses a non-passive native wheel handler to prevent browser scrolling', async () => {
  const canvasWheel = await loadCanvasWheel();
  assert.deepEqual(canvasWheel.CANVAS_WHEEL_LISTENER_OPTIONS, { passive: false });
  assert.equal(typeof canvasWheel.preventCanvasWheelDefault, 'function');

  let preventDefaultCalls = 0;
  canvasWheel.preventCanvasWheelDefault!({
    preventDefault: () => {
      preventDefaultCalls += 1;
    }
  });

  assert.equal(preventDefaultCalls, 1);
});
