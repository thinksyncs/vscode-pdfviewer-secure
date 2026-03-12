import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  PREVIEW_FEATURE_DEFAULTS,
  PREVIEW_FEATURE_NAMES,
  PREVIEW_RUNTIME_VALUES,
  getPreviewFeatureSettingKey,
  resolvePreviewFeatures,
} from '../../config';

suite('runtime bootstrap', () => {
  test('resolves preview features from shared defaults', () => {
    const features = resolvePreviewFeatures((settingName) => {
      if (settingName === 'features.print') {
        return true;
      }
      if (settingName === 'features.forms') {
        return true;
      }
      return undefined;
    });

    assert.deepStrictEqual(features, {
      ...PREVIEW_FEATURE_DEFAULTS,
      print: true,
      forms: true,
    });
  });

  test('ships feature flags as opt-in settings with safe defaults', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../../../package.json'),
        'utf8',
      ),
    ) as {
      contributes?: {
        configuration?: {
          properties?: Record<string, { default?: unknown }>;
        };
      };
    };

    const properties = manifest.contributes?.configuration?.properties ?? {};

    for (const featureName of PREVIEW_FEATURE_NAMES) {
      const key = getPreviewFeatureSettingKey(featureName);
      assert.strictEqual(
        properties[key]?.default,
        PREVIEW_FEATURE_DEFAULTS[featureName],
        `${key} should match the shared default`,
      );
    }
  });

  test('injects the compiled webview runtime rather than the legacy lib runtime', () => {
    const templateSource = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/viewerTemplate.ts'),
      'utf8',
    );

    assert.ok(
      templateSource.includes(
        "path.posix.join('out', 'src', 'webview', 'main.js')",
      ),
    );
    assert.ok(!templateSource.includes("path.posix.join('lib', 'main.js')"));
  });

  test('keeps shared PDF.js mode values in a single source of truth', () => {
    assert.deepStrictEqual(PREVIEW_RUNTIME_VALUES, {
      annotationEditorModeDisable: -1,
      annotationEditorModeNone: 0,
      annotationModeEnable: 1,
      annotationModeEnableForms: 2,
    });

    const webviewSource = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/webview/main.ts'),
      'utf8',
    );

    assert.ok(
      webviewSource.includes('config.runtime.annotationEditorModeDisable'),
    );
    assert.ok(
      webviewSource.includes('config.runtime.annotationModeEnableForms'),
    );
    assert.ok(
      !webviewSource.includes('annotationMode: config.features.forms ? 2 : 1'),
    );
  });
});
