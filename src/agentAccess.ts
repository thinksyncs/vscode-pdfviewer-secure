import * as fs from 'fs';
import * as path from 'path';

export function assertAgentAccess(enabled: unknown, trusted: boolean): void {
  if (enabled !== true) {
    throw new Error('Enable pdf-preview.agent.enabled in User Settings first.');
  }
  if (!trusted) {
    throw new Error('PDF agent tools require a trusted workspace.');
  }
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isLocalAbsolutePath(value: string): boolean {
  return (
    path.isAbsolute(value) &&
    !value.startsWith('//') &&
    !value.startsWith('\\\\') &&
    !value.includes('\0')
  );
}

/** Resolve links before checking containment; never read PDF contents here. */
export async function resolveWorkspacePdfPath(
  input: unknown,
  workspacePaths: readonly string[],
): Promise<string> {
  if (
    typeof input !== 'string' ||
    !isLocalAbsolutePath(input) ||
    path.extname(input).toLowerCase() !== '.pdf'
  ) {
    throw new Error('Provide an absolute local path to a .pdf file.');
  }

  const roots: { original: string; real: string }[] = [];
  for (const root of workspacePaths) {
    if (!isLocalAbsolutePath(root)) {
      continue;
    }
    try {
      const real = await fs.promises.realpath(root);
      if (isLocalAbsolutePath(real)) {
        roots.push({ original: root, real });
      }
    } catch {
      // An unavailable workspace root cannot grant access.
    }
  }
  const denied = 'PDF must be inside an open local workspace folder.';
  if (
    !roots.some(
      (root) => isWithin(root.original, input) || isWithin(root.real, input),
    )
  ) {
    throw new Error(denied);
  }

  let resolved: string;
  try {
    resolved = await fs.promises.realpath(input);
  } catch {
    throw new Error('PDF file does not exist or cannot be accessed.');
  }
  if (
    !isLocalAbsolutePath(resolved) ||
    !roots.some((root) => isWithin(root.real, resolved))
  ) {
    throw new Error(denied);
  }
  if (path.extname(resolved).toLowerCase() !== '.pdf') {
    throw new Error('The resolved file must have a .pdf extension.');
  }
  if (!(await fs.promises.stat(resolved)).isFile()) {
    throw new Error('PDF path must refer to a regular file.');
  }
  return resolved;
}
