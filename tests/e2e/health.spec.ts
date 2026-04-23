import { test, expect } from '@playwright/test';

test('health endpoint returns 200', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
});

test('login page loads', async ({ page }) => {
  await page.goto('/auth/signin');
  await expect(page).toHaveTitle(/FridAI|LikeAiSaid|Login|Accedi/i);
});

test('unauthenticated redirect to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/auth\/signin/);
});
