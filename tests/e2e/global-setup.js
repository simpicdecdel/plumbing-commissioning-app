import { once } from 'node:events';

export default async function globalSetup() {
  process.env.PLUMBING_REMOTE_DISABLED = '1';
  const { server } = await import('../../scripts/serve.mjs');

  if (!server.listening) await once(server, 'listening');

  return async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  };
}
