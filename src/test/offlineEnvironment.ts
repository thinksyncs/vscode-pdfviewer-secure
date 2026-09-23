import * as assert from 'assert';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';

async function blockedConnection(host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: 443 });
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(
        new Error('Expected an unreachable route, not a timed-out connection.'),
      );
    });
    socket.once('connect', () => {
      socket.destroy();
      reject(
        new Error('An external address was reachable during offline tests.'),
      );
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (
        ['ENETUNREACH', 'EHOSTUNREACH', 'EAFNOSUPPORT'].includes(
          error.code ?? '',
        )
      ) {
        resolve(error.code!);
      } else {
        reject(error);
      }
    });
  });
}

async function checkLoopback(): Promise<void> {
  const server = net.createServer((socket) => socket.end());
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as net.AddressInfo;
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port: address.port });
      socket.setTimeout(3000, () =>
        socket.destroy(new Error('Loopback control timed out.')),
      );
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Check inside the actual extension host, before and after rendering tests. */
export async function verifyOfflineEnvironment(): Promise<void> {
  if (process.env.PDF_PREVIEW_OFFLINE !== '1') {
    return;
  }
  assert.strictEqual(process.platform, 'linux');
  assert.notStrictEqual(process.getuid?.(), 0, 'editor must not run as root');
  const hostNamespace = process.env.PDF_PREVIEW_HOST_NETNS;
  assert.ok(hostNamespace, 'host network namespace must be recorded');
  const namespace = fs.readlinkSync('/proc/self/ns/net');
  assert.notStrictEqual(namespace, hostNamespace, 'network must be isolated');
  const interfaces = os.networkInterfaces();
  assert.deepStrictEqual(
    Object.keys(interfaces),
    ['lo'],
    'only loopback is allowed',
  );
  assert.ok(interfaces.lo?.every((address) => address.internal));
  await checkLoopback();
  // Documentation-only addresses; no request is sent on the host network.
  const ipv4 = await blockedConnection('192.0.2.1');
  const ipv6 = await blockedConnection('2001:db8::1');
  console.log(
    'OFFLINE_NETWORK_VERIFIED',
    JSON.stringify({
      namespace,
      hostNamespace,
      interfaces: Object.keys(interfaces),
      loopback: 'reachable',
      ipv4,
      ipv6,
    }),
  );
}
