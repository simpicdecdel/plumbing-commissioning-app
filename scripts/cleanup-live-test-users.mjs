import { cleanupStaleLiveTestData } from '../tests/live/live-test-fixture.mjs';

if (!process.argv.includes('--confirm')) {
  throw new Error('Cleanup requires --confirm. It deletes only tagged plumbing live-test users and their verified test organisations.');
}

const result = await cleanupStaleLiveTestData();
console.log(`Removed ${result.users} tagged test user(s) and ${result.organisations} test organisation(s).`);
