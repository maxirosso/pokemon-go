import { expect, test, type Page } from '@playwright/test';
import { clickUntil, onboardEmpty, openTab } from './helpers';

async function saveAndExpectAssessment(page: Page) {
  await clickUntil(
    () => page.getByTestId('save-pokemon').click({ timeout: 5_000 }),
    () => expect(page.getByText('TACTICAL ASSESSMENT')).toBeVisible({ timeout: 15_000 }),
  );
}

test.describe('add a Pokémon manually', () => {
  test('search the Pokédex, enter details, save, and see the assessment', async ({ page }) => {
    await onboardEmpty(page);
    await page.goto('/pokemon/add');

    await expect(page.getByText('STEP 1 · SPECIES')).toBeVisible({ timeout: 60_000 });
    await page.getByPlaceholder(/Search name/).fill('Lucario');
    await page.getByLabel(/^Lucario/).first().click();

    await expect(page.getByText('STEP 2 · DETAILS')).toBeVisible();
    await page.getByLabel('CP', { exact: true }).fill('2100');
    await page.getByLabel('NICKNAME').fill('Aura');
    await saveAndExpectAssessment(page);
    await expect(page).toHaveURL(/\/pokemon\//);
  });

  test('the saved Pokémon appears in the collection', async ({ page }) => {
    await onboardEmpty(page);
    await page.goto('/pokemon/add?speciesId=448'); // Lucario, species picker skipped by deep link
    await expect(page.getByText('STEP 2 · DETAILS')).toBeVisible({ timeout: 60_000 });
    await page.getByLabel('NICKNAME').fill('Aura');
    await saveAndExpectAssessment(page);

    await page.goto('/');
    await expect(page.getByText('Trainer Tester')).toBeVisible({ timeout: 90_000 });
    await openTab(page, 'Collection');
    await expect(page.getByLabel(/^(Aura|Lucario)/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('invalid values are rejected and nothing is saved', async ({ page }) => {
    await onboardEmpty(page);
    await page.goto('/pokemon/add?speciesId=448');
    await expect(page.getByText('STEP 2 · DETAILS')).toBeVisible({ timeout: 60_000 });
    await page.getByLabel('CP', { exact: true }).fill('5'); // below the minimum of 10
    await page.getByTestId('save-pokemon').click();
    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible();
    await expect(page.getByText('TACTICAL ASSESSMENT')).toHaveCount(0);
    await expect(page.getByText('STEP 2 · DETAILS')).toBeVisible();
  });

  test('editing a valid CP into an invalid one does not silently save the old value', async ({ page }) => {
    await onboardEmpty(page);
    await page.goto('/pokemon/add?speciesId=448');
    await expect(page.getByText('STEP 2 · DETAILS')).toBeVisible({ timeout: 60_000 });
    const cp = page.getByLabel('CP', { exact: true });
    await cp.fill('2100');
    await cp.fill('8'); // regression: the previous in-range value (2100) used to be kept and saved
    await page.getByTestId('save-pokemon').click();
    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible();
    await expect(page.getByText('TACTICAL ASSESSMENT')).toHaveCount(0);
  });

  test('searching for a species that does not exist shows an empty state', async ({ page }) => {
    await onboardEmpty(page);
    await page.goto('/pokemon/add');
    await page.getByPlaceholder(/Search name/).fill('zzzzzz');
    await expect(page.getByText('No species found')).toBeVisible({ timeout: 60_000 });
  });
});
