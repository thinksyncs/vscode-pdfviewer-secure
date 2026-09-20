import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertAgentAccess, resolveWorkspacePdfPath } from '../../agentAccess';

suite('agent access', () => {
  let root: string;
  let workspace: string;
  let pdf: string;

  setup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-agent-access-'));
    workspace = path.join(root, 'workspace');
    fs.mkdirSync(workspace);
    pdf = path.join(workspace, 'example.PDF');
    fs.writeFileSync(pdf, 'fixture');
  });

  teardown(() => fs.rmSync(root, { recursive: true, force: true }));

  test('requires explicit opt-in and trust', () => {
    for (const enabled of [undefined, false, 'true', 1, {}]) {
      assert.throws(() => assertAgentAccess(enabled, true), /User Settings/);
    }
    assert.throws(() => assertAgentAccess(true, false), /trusted workspace/);
    assert.doesNotThrow(() => assertAgentAccess(true, true));
  });

  test('accepts a local PDF in any open workspace folder', async () => {
    assert.strictEqual(
      await resolveWorkspacePdfPath(pdf, [
        path.join(root, 'missing'),
        workspace,
      ]),
      fs.realpathSync(pdf),
    );
  });

  test('rejects URLs, relative paths, network paths, NUL, and non-PDF inputs', async () => {
    for (const input of [
      undefined,
      null,
      1,
      {},
      'example.pdf',
      'file:///tmp/a.pdf',
      'https://example.com/a.pdf',
      '//server/share/a.pdf',
      '\\\\server\\share\\a.pdf',
      `${pdf}\0.pdf`,
      path.join(workspace, 'a.txt'),
    ]) {
      await assert.rejects(
        resolveWorkspacePdfPath(input, [workspace]),
        /absolute local path/,
      );
    }
  });

  test('denies access without a local workspace', async () => {
    await assert.rejects(
      resolveWorkspacePdfPath(pdf, []),
      /inside an open local workspace/,
    );
  });

  test('rejects sibling-prefix and traversal escapes', async () => {
    const sibling = path.join(root, 'workspace-other');
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, 'outside.pdf'), 'fixture');
    for (const input of [
      path.join(sibling, 'outside.pdf'),
      path.join(workspace, '..', 'workspace-other', 'outside.pdf'),
    ]) {
      await assert.rejects(
        resolveWorkspacePdfPath(input, [workspace]),
        /inside an open local workspace/,
      );
    }
  });

  test('rejects missing files and directories named .pdf', async () => {
    await assert.rejects(
      resolveWorkspacePdfPath(path.join(workspace, 'missing.pdf'), [workspace]),
      /does not exist/,
    );
    const directory = path.join(workspace, 'directory.pdf');
    fs.mkdirSync(directory);
    await assert.rejects(
      resolveWorkspacePdfPath(directory, [workspace]),
      /regular file/,
    );
  });

  test('rejects symlink directory escapes', async () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'outside.pdf'), 'fixture');
    const link = path.join(workspace, 'link');
    fs.symlinkSync(outside, link, 'junction');
    await assert.rejects(
      resolveWorkspacePdfPath(path.join(link, 'outside.pdf'), [workspace]),
      /inside an open local workspace/,
    );
  });

  test('supports workspace roots and internal directories that are symlinks', async () => {
    const rootLink = path.join(root, 'workspace-link');
    fs.symlinkSync(workspace, rootLink, 'junction');
    assert.strictEqual(
      await resolveWorkspacePdfPath(path.join(rootLink, 'example.PDF'), [
        rootLink,
      ]),
      fs.realpathSync(pdf),
    );
    assert.strictEqual(
      await resolveWorkspacePdfPath(fs.realpathSync(pdf), [rootLink]),
      fs.realpathSync(pdf),
    );
    const inner = path.join(workspace, 'inner');
    fs.mkdirSync(inner);
    const innerPdf = path.join(inner, 'inner.pdf');
    fs.writeFileSync(innerPdf, 'fixture');
    const innerLink = path.join(workspace, 'inner-link');
    fs.symlinkSync(inner, innerLink, 'junction');
    assert.strictEqual(
      await resolveWorkspacePdfPath(path.join(innerLink, 'inner.pdf'), [
        workspace,
      ]),
      fs.realpathSync(innerPdf),
    );
  });
});
