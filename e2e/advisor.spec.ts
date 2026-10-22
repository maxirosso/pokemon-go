import { expect, test, type Page } from '@playwright/test';
import { onboardEmpty, onboardWithDemo, openTab } from './helpers';

const HORIZONS = [/^Today \(\d+\)$/, /^This week \(\d+\)$/, /^Long term \(\d+\)$/];

async function openAdvisorWithRoadmap(page: Page) {
  await onboardWithDemo(page);
  await openTab(page, 'Advisor');
  await expect(page.getByText('ROADMAP', { exact: true })).toBeVisible({ timeout: 60_000 });
}

test.describe('advisor', () => {
  test('shows an empty state when there are no Pokémon', async ({ page }) => {
    await onboardEmpty(page);
    await openTab(page, 'Advisor');
    await expect(page.getByText('Nothing to advise on yet')).toBeVisible();
  });

  test('with the demo collection it ranks a roadmap and explains each task', async ({ page }) => {
    await openAdvisorWithRoadmap(page);
    await expect(page.getByText('YOUR RESOURCES', { exact: true })).toBeVisible();
    await expect(page.getByText('Stardust not entered')).toBeVisible();
    for (const horizon of HORIZONS) await expect(page.getByText(horizon)).toBeVisible();
  });

  test('switching the horizon changes the task list', async ({ page }) => {
    await openAdvisorWithRoadmap(page);
    await page.getByText(HORIZONS[2]).click();
    await expect(page.getByText(/PRIORITY \d/).first().or(page.getByText('Nothing here yet.'))).toBeVisible();
  });

  test('a task can be marked done and undone', async ({ page }) => {
    await openAdvisorWithRoadmap(page);
    for (const horizon of HORIZONS) {
      await page.getByText(horizon).click();
      if ((await page.getByRole('checkbox').count()) > 0) break;
    }
    const box = page.getByRole('checkbox').first();
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await box.click();
    await expect(page.getByText('Task completed — nice!')).toBeVisible();
    await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('checkbox').first().click();
    await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'false');
  });

  test('home recommendation is deterministic and labelled as AI-free', async ({ page }) => {
    await onboardWithDemo(page);
    await expect(page.getByText('YOUR NEXT BEST MOVE')).toBeVisible();
    await expect(page.getByText('AI-FREE · DETERMINISTIC')).toBeVisible();
  });
});
