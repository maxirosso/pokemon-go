import { expect, test, type Page, type Route } from '@playwright/test';
import { onboardWithDemo } from './helpers';

const FAKE_KEY = 'AIzaFAKE-e2e-test-key-0123456789abcdef';
const GOOGLE = 'https://generativelanguage.googleapis.com/**';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

interface Seen {
  url: string;
  key: string | undefined;
}

/** Mocks Google's API (no real key or network is used). `handler` decides the response for each POST. */
async function mockGoogle(page: Page, handler: (body: Record<string, unknown>, route: Route) => Promise<void> | void): Promise<Seen[]> {
  const seen: Seen[] = [];
  await page.route(GOOGLE, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    seen.push({ url: req.url(), key: req.headers()['x-goog-api-key'] });
    return handler(req.postDataJSON() as Record<string, unknown>, route);
  });
  return seen;
}

const ok = (route: Route, text: string) =>
  route.fulfill({
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] }),
  });

async function openKeySettings(page: Page) {
  await onboardWithDemo(page);
  await page.goto('/settings/cloud');
  await expect(page.getByText('NO GEMINI KEY')).toBeVisible({ timeout: 60_000 });
}

async function saveKey(page: Page, key = FAKE_KEY) {
  await page.getByTestId('gemini-key-input').fill(key);
  await page.getByTestId('gemini-key-save').click();
}

test.describe('Gemini key on the device', () => {
  test('a working key is tested against the lite model, saved, and survives a reload', async ({ page }) => {
    const seen = await mockGoogle(page, (_b, route) => ok(route, 'OK'));
    await openKeySettings(page);
    await saveKey(page);

    await expect(page.getByText(/Key works \(gemini-2\.5-flash-lite\)/)).toBeVisible();
    await expect(page.getByText('GEMINI KEY SAVED ON THIS DEVICE')).toBeVisible();
    await expect(page.getByTestId('gemini-key-input')).toHaveValue(''); // the key is not left on screen
    expect(seen[0].url).toContain('/models/gemini-2.5-flash-lite:generateContent');
    expect(seen[0].url).not.toContain(FAKE_KEY); // never in the URL
    expect(seen[0].key).toBe(FAKE_KEY);

    await page.reload();
    await expect(page.getByText('GEMINI KEY SAVED ON THIS DEVICE')).toBeVisible({ timeout: 90_000 });
  });

  test('a key Google rejects is not kept', async ({ page }) => {
    await mockGoogle(page, (_b, route) =>
      route.fulfill({
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }),
      }),
    );
    await openKeySettings(page);
    await saveKey(page);

    await expect(page.getByText(/Google rejected your Gemini API key/)).toBeVisible();
    await expect(page.getByText('NO GEMINI KEY')).toBeVisible();
    await expect(page.getByText('GEMINI KEY SAVED ON THIS DEVICE')).toHaveCount(0);
  });

  test('the key can be removed again', async ({ page }) => {
    await mockGoogle(page, (_b, route) => ok(route, 'OK'));
    await openKeySettings(page);
    await saveKey(page);
    await expect(page.getByText('GEMINI KEY SAVED ON THIS DEVICE')).toBeVisible();

    page.once('dialog', (d) => void d.accept()); // web confirms destructive actions with window.confirm
    await page.getByTestId('gemini-key-remove').click();
    await expect(page.getByText('NO GEMINI KEY')).toBeVisible({ timeout: 10_000 });
  });

  test('the assistant uses the saved key to answer, and explains how to enable the coach when there is none', async ({ page }) => {
    const seen = await mockGoogle(page, (body, route) => {
      const cfg = body.generationConfig as { responseSchema?: unknown };
      if (cfg.responseSchema) {
        return ok(route, JSON.stringify({ answer: 'Power up Lucario first.', cards: [], followUps: [], usedTools: [], confidence: 'high' }));
      }
      return ok(route, 'Draft: power up Lucario.');
    });
    await onboardWithDemo(page);

    await page.goto('/assistant');
    await expect(page.getByText(/needs your Gemini API key/)).toBeVisible({ timeout: 60_000 });

    await page.goto('/settings/cloud');
    await expect(page.getByText('NO GEMINI KEY')).toBeVisible({ timeout: 60_000 });
    await saveKey(page);
    await expect(page.getByText('GEMINI KEY SAVED ON THIS DEVICE')).toBeVisible();

    await page.goto('/assistant');
    await expect(page.getByText(/needs your Gemini API key/)).toHaveCount(0);
    await page.getByLabel('Message').fill('What should I power up first?');
    await page.getByLabel('Send').click();
    await expect(page.getByText('Power up Lucario first.')).toBeVisible({ timeout: 30_000 });
    expect(seen.length).toBeGreaterThanOrEqual(2); // a chat round and the final formatted answer
    expect(seen.every((s) => s.key === FAKE_KEY && s.url.includes('gemini-2.5-flash-lite'))).toBe(true);
  });
});
