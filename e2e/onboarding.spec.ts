import { expect, test } from '@playwright/test';
import { onboardEmpty, onboardWithDemo, startOnboarding } from './helpers';

test.describe('onboarding', () => {
  test('first launch shows the welcome screen with honest messaging', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Your Pokémon collection.')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Smarter decisions.')).toBeVisible();
    await expect(page.getByText(/not affiliated with, endorsed by or sponsored by Nintendo/i)).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('trainer step cannot continue until a valid nickname and level are entered', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Get started' }).click({ timeout: 90_000 });
    const next = page.getByRole('button', { name: 'Continue' });
    await expect(next).toBeDisabled();
    await page.getByLabel(/trainer nickname/i).fill('Ash');
    await page.getByLabel(/trainer level/i).fill('99'); // above the level cap of 50
    await expect(next).toBeDisabled();
    await page.getByLabel(/trainer level/i).fill('40');
    await expect(next).toBeEnabled();
  });

  test('explore the demo collection lands on a populated, clearly-labelled home screen', async ({ page }) => {
    await onboardWithDemo(page, { nickname: 'Tester', level: '45' });
    await expect(page.getByText('Trainer Tester')).toBeVisible();
    await expect(page.getByText('LVL 45')).toBeVisible();
    await expect(page.getByText('16 POKÉMON')).toBeVisible();
    await expect(page.getByText('You are viewing 16 demo Pokémon — not your real collection.')).toBeVisible();
    await expect(page.getByText('YOUR NEXT BEST MOVE')).toBeVisible();
    await expect(page.getByText('ACCOUNT READINESS')).toBeVisible();
  });

  test('skipping the collection step gives an empty but working app', async ({ page }) => {
    await onboardEmpty(page);
    await expect(page.getByText('Trainer Tester')).toBeVisible();
    await expect(page.getByText('You are viewing 16 demo Pokémon')).toHaveCount(0);
  });

  test('onboarding is not shown again after completing it (state persists across reloads)', async ({ page }) => {
    await onboardWithDemo(page);
    await page.reload();
    await expect(page.getByText('Trainer Tester')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Your Pokémon collection.')).toHaveCount(0);
  });

  test('back navigation works between onboarding steps', async ({ page }) => {
    await startOnboarding(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('Bring in your Pokémon')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Continue|Skip — balanced advice)$/ })).toBeVisible();
  });
});
