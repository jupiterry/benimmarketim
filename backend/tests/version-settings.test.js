import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import Settings from '../models/settings.model.js';
import { checkVersion } from '../controllers/version.controller.js';

// Isolate unrelated order/Redis integrations; exercise the real settings controller.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './cart.controller.js' && context.parentURL?.endsWith('/settings.controller.js')) {
      return { url: 'data:text/javascript,export const refreshOrderHoursCache = async () => {};', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { updateSettings, getSettings } = await import('../controllers/settings.controller.js');
hooks.deregister();

function response() {
  return {
    code: 200, headers: {},
    status(code) { this.code = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('saved version settings survive reload and feed both mobile platforms', async (t) => {
  let stored = new Settings({ name: 'default' }).toObject();
  t.mock.method(Settings, 'getSettings', async () => {
    const document = new Settings(stored);
    document.save = async () => { await document.validate(); stored = document.toObject(); };
    return document;
  });
  const appVersion = {
    latestVersion: '3.2.0', minimumVersion: '3.1.0', forceUpdate: true,
    androidStoreUrl: 'https://play.google.com/store/apps/details?id=test',
    iosStoreUrl: 'https://apps.apple.com/app/id123',
  };
  const saved = response();
  await updateSettings({ body: { appVersion } }, saved);
  assert.equal(saved.code, 200);
  const reloaded = response();
  await getSettings({}, reloaded);
  assert.deepEqual(reloaded.body.appVersion.toObject(), appVersion);
  for (const platform of ['android', 'ios']) {
    const live = response();
    await checkVersion({ query: { platform } }, live);
    assert.deepEqual(live.body, {
      latest_version: '3.2.0', minimum_version: '3.1.0', force_update: true,
      url: platform === 'ios' ? appVersion.iosStoreUrl : appVersion.androidStoreUrl,
    });
    assert.equal(live.headers['Cache-Control'], 'no-store');
  }
  await updateSettings({ body: { appVersion: { forceUpdate: false } } }, response());
  const live = response();
  await checkVersion({ query: {} }, live);
  assert.equal(live.body.force_update, false);
  assert.equal(live.body.latest_version, '3.2.0');
  await updateSettings({ body: { minimumOrderAmount: 300 } }, response());
  assert.equal(stored.appVersion.latestVersion, '3.2.0');
});

test('invalid version settings are rejected without saving', async (t) => {
  const document = new Settings();
  const save = t.mock.method(document, 'save', async () => {});
  t.mock.method(Settings, 'getSettings', async () => document);
  const res = response();
  await updateSettings({ body: { appVersion: null } }, res);
  assert.equal(res.code, 400);
  assert.equal(save.mock.callCount(), 0);
});
