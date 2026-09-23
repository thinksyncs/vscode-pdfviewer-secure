import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

import { runTests } from '@vscode/test-electron';

function resolveLocalVSCodeExecutablePath(): string | undefined {
  const explicitPath = process.env.VSCODE_EXECUTABLE_PATH;
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`VSCODE_EXECUTABLE_PATH does not exist: ${explicitPath}`);
    }
    return explicitPath;
  }

  if (process.env.VSCODE_VERSION) {
    return undefined;
  }

  const candidates = [
    '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
    '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
  ];

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      fs.existsSync(candidate),
  );
}

async function main(): Promise<void> {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = process.env
      .VSCODE_EXTENSION_DEVELOPMENT_PATH
      ? path.resolve(process.env.VSCODE_EXTENSION_DEVELOPMENT_PATH)
      : path.resolve(__dirname, '../../../');
    if (!fs.existsSync(path.join(extensionDevelopmentPath, 'package.json'))) {
      throw new Error(
        `Extension manifest not found: ${extensionDevelopmentPath}`,
      );
    }

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const testDataRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vscode-pdfviewer-test-'),
    );
    const workspaceDir = path.join(testDataRoot, 'workspace');
    const userDataDir = path.join(testDataRoot, 'user-data');
    const extensionsDir = path.join(testDataRoot, 'extensions');
    fs.mkdirSync(workspaceDir, { recursive: true });
    const settingsDir = path.join(userDataDir, 'User');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({
        'telemetry.telemetryLevel': 'off',
        'extensions.autoCheckUpdates': false,
        'extensions.autoUpdate': false,
        'update.mode': 'none',
        'workbench.enableExperiments': false,
      }),
    );
    const vscodeExecutablePath = resolveLocalVSCodeExecutablePath();
    if (process.env.PDF_PREVIEW_OFFLINE === '1' && !vscodeExecutablePath) {
      throw new Error(
        'Offline tests require an already downloaded VS Code executable.',
      );
    }
    console.log(`Testing extension: ${extensionDevelopmentPath}`);
    console.log(`Isolated test profile: ${testDataRoot}`);

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      version: process.env.VSCODE_VERSION,
      extensionTestsEnv: {
        PDF_PREVIEW_TEST_EXTENSION_PATH: extensionDevelopmentPath,
        PDF_PREVIEW_OFFLINE: process.env.PDF_PREVIEW_OFFLINE,
        PDF_PREVIEW_HOST_NETNS: process.env.PDF_PREVIEW_HOST_NETNS,
      },
      launchArgs: [
        workspaceDir,
        '--disable-extensions',
        '--disable-telemetry',
        '--force-disable-user-env',
        '--disable-updates',
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        '--user-data-dir',
        userDataDir,
        '--extensions-dir',
        extensionsDir,
      ],
    });
  } catch (error) {
    console.error('Failed to run tests', error);
    process.exit(1);
  }
}

main();
