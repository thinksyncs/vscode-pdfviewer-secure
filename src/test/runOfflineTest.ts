import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main(): Promise<void> {
  if (process.platform !== 'linux' || process.getuid?.() === 0) {
    throw new Error(
      'Offline tests require Linux and a non-root user with sudo.',
    );
  }
  // Download the editor before disconnecting. Every test profile is still new.
  const executable =
    process.env.VSCODE_EXECUTABLE_PATH ||
    (await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || 'stable'));
  const root = path.resolve(__dirname, '../../..');
  const result = spawnSync(
    'sudo',
    [
      '-n',
      '--preserve-env=VSCODE_EXTENSION_DEVELOPMENT_PATH,VSCODE_VERSION',
      'unshare',
      '--net',
      '--',
      'bash',
      path.join(root, 'scripts/run-offline-tests.sh'),
      os.userInfo().username,
      process.execPath,
      path.resolve(executable),
      fs.readlinkSync('/proc/self/ns/net'),
      path.join(__dirname, 'runTest.js'),
    ],
    { stdio: 'inherit' },
  );
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
