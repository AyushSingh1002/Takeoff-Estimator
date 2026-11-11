import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../config';

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test('anonymous visitors are redirected to sign in', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/review');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/admin/jobs');
  await expect(page).toHaveURL(/\/login$/);
});

test('reviewers and administrators cannot enter each other’s areas', async ({ browser }) => {
  const reviewerContext = await browser.newContext();
  const reviewerPage = await reviewerContext.newPage();
  await signIn(reviewerPage, E2E.reviewerEmail, E2E.password);
  await expect(reviewerPage).toHaveURL(/\/review$/);
  await reviewerPage.goto('/admin/jobs');
  await expect(
    reviewerPage.getByRole('heading', { name: 'Administrator area only' }),
  ).toBeVisible();
  await reviewerContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, E2E.adminEmail, E2E.password);
  await expect(adminPage).toHaveURL(/\/admin\/jobs$/);
  await adminPage.goto('/dashboard');
  await expect(adminPage.getByRole('heading', { name: 'Customer area only' })).toBeVisible();
  await adminContext.close();
});
