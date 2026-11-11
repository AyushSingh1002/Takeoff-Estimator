import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { E2E } from '../config';

const CUSTOMER = {
  name: 'E2E Customer',
  company: 'E2E Construction',
  email: `customer-${Date.now()}@e2e.test`,
  password: E2E.password,
};

const PROJECT_NAME = `E2E Riverside ${Date.now()}`;

let projectPath = '';
let projectId = '';
let projectReference = '';
let jobId = '';

async function fixturePdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  page.drawText('E2E fixture drawing');
  return Buffer.from(await document.save());
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe.serial('customer, admin and reviewer delivery journey', () => {
  test('customer registers, creates a project and submits a clean drawing', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Name', { exact: true }).fill(CUSTOMER.name);
    await page.getByLabel('Company (optional)').fill(CUSTOMER.company);
    await page.getByLabel('Email').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill(CUSTOMER.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    await page.getByRole('link', { name: 'New takeoff' }).first().click();
    await expect(page.getByRole('heading', { name: 'New takeoff' })).toBeVisible();
    await page.getByLabel('Project name').fill(PROJECT_NAME);
    await page.getByLabel('Conversion region').selectOption('US');
    await page.getByRole('button', { name: 'Create draft' }).click();

    await expect(page).toHaveURL(/\/projects\/[0-9a-f]{24}$/);
    projectPath = new URL(page.url()).pathname;
    projectId = projectPath.split('/').pop() ?? '';
    expect(projectId).toMatch(/^[0-9a-f]{24}$/);

    const meta = await page.locator('p.font-mono').first().innerText();
    const reference = /TK-[0-9A-F]{8}/.exec(meta);
    expect(reference).not.toBeNull();
    projectReference = reference?.[0] ?? '';

    const pdf = await fixturePdf();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'fixture-clean.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });

    await expect(page.getByText('Uploaded', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Intake review' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('1:100', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Scale missing')).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Include' }).first()).toBeChecked();

    // The file row must pass the API's real file id to the remove action; an
    // undefined id would request /files/undefined. Stub the DELETE so the
    // journey keeps its drawing while we assert the request target.
    let deletePath = '';
    await page.route('**/api/v1/projects/*/files/*', async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.continue();
        return;
      }
      deletePath = new URL(route.request().url()).pathname;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(() => deletePath).toMatch(/\/files\/[0-9a-f]{24}$/);
    await page.unroute('**/api/v1/projects/*/files/*');

    const submit = page.getByRole('button', { name: 'Submit takeoff' });
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    await submit.click();

    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
    await expect(page.locator('[aria-live="polite"]')).toHaveText('Quality review', {
      timeout: 60_000,
    });
    await expect(page.getByText(/Test data .* fixture provider/)).toBeVisible();
  });

  test('administrator assigns the reviewer and can open every admin screen', async ({ page }) => {
    await login(page, E2E.adminEmail, E2E.password);
    await expect(page).toHaveURL(/\/admin\/jobs$/);
    await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: projectReference });
    await expect(row).toHaveCount(1);
    const rowText = await row.innerText();
    const idMatch = /[0-9a-f]{24}/.exec(rowText);
    expect(idMatch).not.toBeNull();
    jobId = idMatch?.[0] ?? '';

    await row.getByLabel(`Reviewer for ${projectReference}`).selectOption({
      label: E2E.reviewerName,
    });
    await row.getByRole('button', { name: 'Assign' }).click();
    await expect(row.getByText(E2E.reviewerEmail)).toBeVisible();

    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await page.goto('/admin/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(page.getByText(PROJECT_NAME)).toBeVisible();
    await page.goto('/admin/pricing');
    await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();
    await page.goto('/admin/rules');
    await expect(page.getByRole('heading', { name: 'Rule packs' })).toBeVisible();
    await page.goto('/admin/claims');
    await expect(page.getByRole('heading', { name: 'Accuracy claims' })).toBeVisible();
  });

  test('reviewer opens the assigned job, approves it and compiles deliverables', async ({
    page,
  }) => {
    await login(page, E2E.reviewerEmail, E2E.password);
    await expect(page).toHaveURL(/\/review$/);
    await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: projectReference });
    await expect(row).toHaveCount(1);
    await row.getByRole('link', { name: 'Open job' }).click();

    await expect(page).toHaveURL(new RegExp(`/review/${jobId}$`));
    await expect(page.getByRole('heading', { name: projectReference })).toBeVisible();
    await expect(page.getByText(/Test data .* fixture provider/)).toBeVisible();
    await expect(page.getByText(CUSTOMER.email)).toHaveCount(0);

    await page.getByRole('button', { name: 'Approve job' }).click();
    await expect(page).toHaveURL(/\/review$/);
    await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: projectReference })).toHaveCount(0);
  });

  test('customer sees the delivered BOQ, deliverables and signed downloads', async ({ page }) => {
    await login(page, CUSTOMER.email, CUSTOMER.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('link', { name: PROJECT_NAME }).click();

    await expect(page.getByRole('heading', { name: PROJECT_NAME })).toBeVisible();
    await expect(page.locator('[aria-live="polite"]')).toHaveText('Ready');
    await expect(page.getByText('Excel bill of quantities')).toBeVisible();
    await expect(page.getByText('Annotated drawing PDF')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(2);

    const listResponse = await page.request.get(`/api/v1/projects/${projectId}/deliverables`);
    expect(listResponse.status()).toBe(200);
    const list = (await listResponse.json()) as {
      deliverables: Array<{ _id: string; status: string }>;
    };
    const ready = list.deliverables.find((deliverable) => deliverable.status === 'ready');
    expect(ready).toBeDefined();
    if (ready !== undefined) {
      const linkResponse = await page.request.get(`/api/v1/deliverables/${ready._id}/download`);
      expect(linkResponse.status()).toBe(200);
      const link = (await linkResponse.json()) as { url: string };
      const fileResponse = await page.request.get(link.url);
      expect(fileResponse.status()).toBe(200);
    }

    await page.getByRole('link', { name: 'View bill of quantities' }).click();
    await expect(page.getByRole('heading', { name: 'Bill of quantities' })).toBeVisible();
    await expect(page.getByText(/Test data .* fixture provider/)).toBeVisible();
    const lineCount = await page.locator('table tbody tr').count();
    expect(lineCount).toBeGreaterThan(0);

    await page.goto('/admin/jobs');
    await expect(page.getByRole('heading', { name: 'Administrator area only' })).toBeVisible();
  });
});
