import * as fs from 'fs';
import * as path from 'path';
import * as Mocha from 'mocha';

function collectTestFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
  });
  // mocha.useColors(true);

  const testsRoot = path.resolve(__dirname, '..');

  return Promise.resolve(collectTestFiles(testsRoot)).then((files) => {
    files.forEach((file) => mocha.addFile(file));

    return new Promise<void>((resolve, reject) => {
      try {
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (error) {
        console.error(error);
        reject(error);
      }
    });
  });
}
