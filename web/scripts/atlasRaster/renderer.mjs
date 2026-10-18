// Playwright Chromium pool around render.html. Each worker is a browser
// context with its own MapLibre map; jobs are pulled from one shared list so
// styles switch rarely. Rendering happens in the same maplibre-gl build the
// web map ships, never in a native re-implementation.

import { chromium } from 'playwright';

export const ANGLE_BACKENDS = {
  metal: { args: ['--use-angle=metal', '--ignore-gpu-blocklist'], expect: /Metal/i },
  swiftshader: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], expect: /SwiftShader/i },
};

export function defaultAngle() {
  return process.platform === 'darwin' ? 'metal' : 'swiftshader';
}

export async function launchRenderer({ angle, workers, origin, timeoutMs, sizeCss, log = () => {} }) {
  const backend = ANGLE_BACKENDS[angle];
  if (!backend) throw new Error(`Unknown ANGLE backend "${angle}"; use ${Object.keys(ANGLE_BACKENDS).join(' or ')}.`);
  const browser = await chromium.launch({ args: backend.args });
  const pool = [];
  try {
    for (let index = 0; index < workers; index++) {
      const context = await browser.newContext({ viewport: { width: sizeCss, height: sizeCss }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const worker = { index, page, context, pageErrors: [], consoleErrors: 0 };
      page.on('pageerror', (error) => worker.pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          worker.consoleErrors++;
          log(`worker ${index} console: ${message.text()}`);
        }
      });
      await page.goto(`${origin}/render.html`, { waitUntil: 'load', timeout: timeoutMs });
      await page.waitForFunction(() => window.atlasRender?.ready === true, null, { timeout: timeoutMs });
      pool.push(worker);
    }
    const info = await pool[0].page.evaluate(() => window.atlasRender.probe());
    if (!backend.expect.test(info.webglRenderer)) {
      throw new Error(`Requested ANGLE backend ${angle} but WebGL reports "${info.webglRenderer}".`);
    }
  } catch (error) {
    await browser.close();
    throw error;
  }

  const evaluate = async (worker, task, argument) => {
    const result = await worker.page.evaluate(task, argument);
    if (worker.pageErrors.length) {
      throw new Error(`Render page ${worker.index} raised: ${worker.pageErrors.splice(0).join(' | ')}`);
    }
    return result;
  };

  return {
    browserVersion: browser.version(),
    angle,
    info: await pool[0].page.evaluate(() => window.atlasRender.probe()),
    workers: pool.length,
    consoleErrors: () => pool.reduce((sum, worker) => sum + worker.consoleErrors, 0),

    /** Run every job across the pool; `onResult` is awaited per job before the worker continues. */
    async run(jobs, onResult) {
      let next = 0;
      await Promise.all(pool.map(async (worker) => {
        for (;;) {
          const index = next++;
          if (index >= jobs.length) return;
          const job = jobs[index];
          const started = performance.now();
          const result = await evaluate(worker, (payload) => window.atlasRender.render(payload), job);
          await onResult(job, result, { seconds: (performance.now() - started) / 1000, worker: worker.index });
        }
      }));
    },

    assemble: (request) => evaluate(pool[0], (payload) => window.atlasRender.assemble(payload), request),
    close: () => browser.close(),
  };
}
