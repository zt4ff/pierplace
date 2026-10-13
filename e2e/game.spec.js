import { test, expect } from '@playwright/test';
import { DEFAULT_PROFILE } from '../src/state.js';
const errors = page => { const list = []; page.on('pageerror', error => list.push(error.message)); return list; };
async function returningMember(page, floor = 1) {
  await page.addInitScript(({ profile, floor }) => localStorage.setItem('pierplace.v1', JSON.stringify({ profile, floor, admitted: true, chats: {}, lessons: [] })), { profile: { ...DEFAULT_PROFILE, name: 'Kayode' }, floor });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter your campus' }).click();
  await expect(page.getByRole('img', { name: `Interactive pixel-art campus, floor ${floor}`, exact: true })).toBeVisible();
}
async function explore(page, destination) {
  await page.getByRole('button', { name: 'Campus menu', exact: true }).click();
  await page.getByLabel('Explore a destination').selectOption(destination);
  await expect(page.getByRole('button', { name: 'Campus menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
}
async function toolkit(page) {
  const trigger = page.getByRole('button', { name: 'Your toolkit', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
}
test('welcome → character and photo ID → visual test → campus; progress persists', async ({ page }) => {
  const failures = errors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your people. Build your potential.' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/welcome.png', fullPage: true });
  await page.getByRole('button', { name: 'Take the test' }).click();
  await page.getByLabel('What should we call you?').fill('Kayode');
  await page.getByRole('button', { name: 'Shirt color: Lavender' }).click();
  await page.getByRole('button', { name: 'Next: campus ID' }).click();
  await page.locator('input[type=file]').setInputFiles('building.png');
  await expect(page.getByRole('img', { name: 'Your campus ID portrait' })).toBeVisible();
  await page.getByLabel('Wear my campus ID on my character').uncheck();
  await page.screenshot({ path: 'screenshots/campus-id.png', fullPage: true });
  await page.getByRole('button', { name: 'Next: a little curiosity' }).click();
  await page.getByRole('button', { name: 'Option 1: Sun' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText('Not quite—', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Option 2: Leaf' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: 'Option 3: Circle' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: 'Option 2: 4 blocks' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('button', { name: 'See my campus pass' }).click();
  await page.getByRole('button', { name: 'Enter campus' }).click();
  await expect(page.getByRole('img', { name: 'Interactive pixel-art campus, floor 1', exact: true })).toBeVisible();
  await page.screenshot({ path: 'screenshots/campus.png', fullPage: true });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pierplace.v1')));
  expect(saved.admitted).toBe(true); expect(saved.profile.wearId).toBe(false); expect(saved.profile.photo).toMatch(/^data:image\/jpeg/);
  await page.reload(); await expect(page.getByRole('button', { name: 'Enter your campus' })).toBeVisible();
  expect(failures).toEqual([]);
});
test('seating gates chat, each table is separate, NPCs speak, both floors work', async ({ page }) => {
  const failures = errors(page);
  await returningMember(page);
  const chat = page.getByRole('button', { name: 'Table chat', exact: true });
  await toolkit(page);
  await expect(chat).toBeDisabled();
  await explore(page, 'floor-1-west-1-chair-1-1');
  await page.getByRole('button', { name: 'Sit down', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open table chat', exact: true })).toBeVisible({ timeout: 15000 });
  await toolkit(page);
  await expect(chat).toBeEnabled();
  await chat.click();
  await page.getByLabel('Your message').fill('Hello from table A');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Hello from table A', { exact: true })).toBeVisible();
  await expect(page.getByText('Campus buddy · mock', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await toolkit(page);
  await page.getByRole('button', { name: 'Stretch your legs', exact: false }).click();
  await expect(chat).toBeDisabled();
  await explore(page, 'floor-1-npc-1');
  await page.getByRole('button', { name: 'Say hello', exact: true }).click();
  await expect(page.getByRole('region', { name: 'A conversation with Mr Jonathan' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Say hello', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Campus menu', exact: true }).click();
  await page.getByRole('button', { name: 'Floor 2', exact: true }).click();
  await expect(page.getByRole('region', { name: 'A conversation with Mr Jonathan' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Interactive pixel-art campus, floor 2', exact: true })).toBeVisible();
  await explore(page, 'floor-2-west-1-chair-1-1');
  await page.getByRole('button', { name: 'Sit down', exact: true }).click();
  await toolkit(page);
  await expect(chat).toBeEnabled({ timeout: 15000 });
  await chat.click();
  await expect(page.getByText('Every connection starts with hello.')).toBeVisible();
  await expect(page.getByText('Hello from table A', { exact: true })).toHaveCount(0);
  expect(failures).toEqual([]);
});
test('Ubuntu laptop opens functional lessons, notes, terminal and files', async ({ page }) => {
  const failures = errors(page);
  await returningMember(page);
  await toolkit(page);
  await page.getByRole('button', { name: /Open your laptop/ }).click();
  await page.screenshot({ path: 'screenshots/laptop.png', fullPage: true });
  await page.getByRole('button', { name: /Make yourself at home/ }).click();
  await page.getByRole('button', { name: /Mark.*complete/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pierplace.v1')).lessons)).toContain('welcome');
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.locator('textarea').fill('Build a little world.');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pierplace.laptop.notes.v1'))).toBe('Build a little world.');
  await page.getByRole('button', { name: 'Terminal · simulated', exact: true }).click();
  await page.locator('.terminal-form input').fill('whoami');
  await page.locator('.terminal-form input').press('Enter');
  await expect(page.locator('.terminal-output')).toContainText('Kayode');
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.getByText('web-basics.html', { exact: false })).toBeVisible();
  expect(failures).toEqual([]);
});
test('mobile layouts and keyboard modal focus stay usable', async ({ page }) => {
  const failures = errors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Take the test' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'screenshots/mobile-welcome.png', fullPage: true });
  await page.getByRole('button', { name: 'Take the test' }).click();
  await page.getByLabel('What should we call you?').fill('Ada');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role=dialog]')))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(failures).toEqual([]);
});

async function expectFullscreenMap(page) {
  const viewport = page.viewportSize();
  const map = page.getByRole('img', { name: /Interactive pixel-art campus/ });
  const box = await map.boundingBox();
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(viewport.width);
  expect(box.height).toBe(viewport.height);
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    x: window.scrollX,
    y: window.scrollY,
  }))).toEqual({ width: viewport.width, height: viewport.height, x: 0, y: 0 });
  await expect(page.locator('.site-header, .campus-sidebar, .site-footer')).toHaveCount(0);
}

async function expectPopoverFits(page, panel) {
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return box;
}

test('fullscreen HUD uses anchored popovers, Escape and accessible destinations', async ({ page }) => {
  const failures = errors(page);
  await returningMember(page);
  await expectFullscreenMap(page);
  await expect(page.getByLabel('Explore a destination')).toHaveCount(0);
  await page.getByRole('button', { name: 'Campus menu', exact: true }).click();
  const menu = await expectPopoverFits(page, page.getByRole('region', { name: 'Campus menu', exact: true }));
  const menuTrigger = await page.getByRole('button', { name: 'Campus menu', exact: true }).boundingBox();
  expect(menu.x).toBe(menuTrigger.x);
  expect(menu.y).toBeGreaterThan(menuTrigger.y + menuTrigger.height);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Campus menu', exact: true })).toBeFocused();
  await expect(page.getByLabel('Explore a destination')).toHaveCount(0);

  await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  const profile = await expectPopoverFits(page, page.getByRole('region', { name: 'Your profile', exact: true }));
  expect(profile.x).toBeGreaterThan(page.viewportSize().width / 2);
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your profile', exact: true })).toContainText('Kayode');
  await toolkit(page);
  await expect(page.getByRole('region', { name: 'Your profile', exact: true })).toHaveCount(0);
  const tools = await expectPopoverFits(page, page.getByRole('region', { name: 'Your campus toolkit' }));
  const toolsTrigger = await page.getByRole('button', { name: 'Your toolkit', exact: true }).boundingBox();
  expect(tools.x).toBe(toolsTrigger.x);
  expect(tools.y + tools.height).toBeLessThan(toolsTrigger.y);
  await expect(page.getByRole('button', { name: 'Table chat', exact: true })).toBeDisabled();

  await explore(page, 'floor-1-npc-1');
  const interaction = await expectPopoverFits(page, page.locator('.game-interaction'));
  expect(interaction.x).toBe(toolsTrigger.x);
  expect(interaction.y + interaction.height).toBeLessThan(toolsTrigger.y);
  await page.getByRole('button', { name: 'Campus menu', exact: true }).click();
  await page.getByRole('button', { name: 'Floor 2', exact: true }).click();
  await expect(page.locator('.game-interaction')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Interactive pixel-art campus, floor 2', exact: true })).toBeVisible();
  await expectFullscreenMap(page);
  expect(failures).toEqual([]);
});

test('camera zoom clamps, mouse edges pan independently and Find me restores the character', async ({ page }) => {
  const failures = errors(page);
  await returningMember(page);
  const campus = page.locator('.game-campus');
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
  const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
  for (let step = 0; step < 6 && await zoomIn.isEnabled(); step++) await zoomIn.click();
  await expect(campus).toHaveAttribute('data-camera-zoom', '2.5');
  await expect(zoomIn).toBeDisabled();
  await page.getByRole('button', { name: 'Find my character', exact: true }).click();
  await expect(campus).toHaveAttribute('data-player-visible', 'true');
  const startY = Number(await campus.getAttribute('data-camera-y'));
  await page.mouse.move(page.viewportSize().width / 2, 2);
  await expect.poll(async () => Number(await campus.getAttribute('data-camera-y'))).toBeLessThan(startY);
  await expect(campus).toHaveAttribute('data-player-visible', 'false');
  await page.mouse.move(page.viewportSize().width / 2, page.viewportSize().height / 2);
  await expect(page.locator('.game-camera-status')).toContainText('Character off screen');
  await page.getByRole('button', { name: 'Find my character', exact: true }).click();
  await expect(campus).toHaveAttribute('data-player-visible', 'true');
  await expect(campus).toHaveAttribute('data-camera-zoom', '2.5');

  await page.getByRole('button', { name: 'Look around', exact: true }).click();
  await expectPopoverFits(page, page.getByRole('region', { name: 'Camera controls', exact: true }));
  const startX = Number(await campus.getAttribute('data-camera-x'));
  await page.getByRole('button', { name: 'Pan left', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => Number(await campus.getAttribute('data-camera-x'))).toBeLessThan(startX);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Look around', exact: true })).toBeFocused();
  for (let step = 0; step < 6 && await zoomOut.isEnabled(); step++) await zoomOut.click();
  await expect(campus).toHaveAttribute('data-camera-zoom', '1');
  await expect(zoomOut).toBeDisabled();
  await expectFullscreenMap(page);
  expect(failures).toEqual([]);
});

test('390 × 844 campus stays fullscreen and every corner flyout fits without scrolling', async ({ page }) => {
  const failures = errors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await returningMember(page);
  await expectFullscreenMap(page);
  await page.screenshot({ path: 'screenshots/mobile-campus.png', fullPage: true });
  for (const [trigger, region] of [
    ['Campus menu', 'Campus menu'],
    ['Your profile', 'Your profile'],
    ['Your toolkit', 'Your campus toolkit'],
    ['Look around', 'Camera controls'],
  ]) {
    await page.getByRole('button', { name: trigger, exact: true }).click();
    await expectPopoverFits(page, page.getByRole('region', { name: region, exact: true }));
    await expectFullscreenMap(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: trigger, exact: true })).toBeFocused();
  }
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const campus = page.locator('.game-campus');
  const startY = Number(await campus.getAttribute('data-camera-y'));
  await page.getByRole('button', { name: 'Look around', exact: true }).click();
  await page.getByRole('button', { name: 'Pan up', exact: true }).click();
  await expect.poll(async () => Number(await campus.getAttribute('data-camera-y'))).toBeLessThan(startY);
  await page.getByRole('button', { name: 'Find my character', exact: true }).click();
  await expect(campus).toHaveAttribute('data-player-visible', 'true');
  await explore(page, 'floor-1-west-1-chair-1-1');
  await expectPopoverFits(page, page.locator('.game-interaction'));
  await expectFullscreenMap(page);
  expect(failures).toEqual([]);
});
