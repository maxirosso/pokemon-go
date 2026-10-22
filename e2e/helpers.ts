import { expect, type Page } from '@playwright/test';

/**
 * Clicks, then waits for the click's visible effect, retrying the click if nothing happened. React Native Web's press
 * responder occasionally drops a click that lands while the screen is still settling (no error, no state change), which
 * would make state-changing steps flaky. Only use for clicks that disappear or navigate once they have worked, so a
 * retry can never double-apply them.
 */
export async function clickUntil(click: () => Promise<unknown>, effect: () => Promise<unknown>, timeout = 60_000) {
  await expect(async () => {
    await click();
    await effect();
  }).toPass({ timeout, intervals: [0, 1_000, 2_000] });
}

export interface Trainer {
  nickname: string;
  level: string;
}

/** Walks the first-launch flow up to the "Bring in your Pokémon" step. */
export async function startOnboarding(page: Page, trainer: Trainer = { nickname: 'Tester', level: '45' }) {
  await page.goto('/');
  await expect(page.getByText('Your Pokémon collection.')).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByLabel(/trainer nickname/i).fill(trainer.nickname);
  await page.getByLabel(/trainer level/i).fill(trainer.level);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip — balanced advice' }).click();
  await expect(page.getByText('Bring in your Pokémon')).toBeVisible();
}

/** Finishes onboarding with the 16-Pokémon demo collection. */
export async function onboardWithDemo(page: Page, trainer?: Trainer) {
  await startOnboarding(page, trainer);
  // Seeding 16 Pokémon and the first analysis pass can be slow on a cold dev server.
  await clickUntil(
    () => page.getByLabel('Explore a demo collection').click({ timeout: 5_000 }),
    () => expect(page.getByText('demo Pokémon').first()).toBeVisible({ timeout: 15_000 }),
  );
}

/** Finishes onboarding with an empty collection. */
export async function onboardEmpty(page: Page, trainer?: Trainer) {
  await startOnboarding(page, trainer);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText('HOME', { exact: true })).toBeVisible();
}

/** Switches bottom tab. Tab buttons are labelled with the tab's name. */
export async function openTab(page: Page, name: 'Home' | 'Collection' | 'Advisor' | 'Battle' | 'Profile') {
  await page.getByLabel(name, { exact: true }).last().click();
}
