import * as path from 'path';
import * as Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    timeout: 40000,
  });
  // Unit tests run separately; integration can target an unpacked VSIX.
  mocha.addFile(path.join(__dirname, 'pdfPreview.test.js'));

  return new Promise<void>((resolve, reject) => {
    try {
      const runner = mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
      runner.on('fail', (test, error) => {
        console.error(`${test.fullTitle()}: ${error.message}`);
      });
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
}
