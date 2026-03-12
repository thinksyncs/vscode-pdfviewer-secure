import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

import { runTests } from '@vscode/test-electron';

function resolveLocalVSCodeExecutablePath(): string | undefined {
  const candidates = [
    process.env.VSCODE_EXECUTABLE_PATH,
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
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

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
    const vscodeExecutablePath = resolveLocalVSCodeExecutablePath();

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      launchArgs: [
        workspaceDir,
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
