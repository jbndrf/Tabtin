import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// Include integration tests from tests/integration
		include: ['tests/integration/**/*.{test,spec}.ts'],
		// Use node environment for API tests
		environment: 'node',
		// Setup files run before each test file
		setupFiles: ['tests/setup.ts'],
		// Increase timeout for integration tests that hit real services
		testTimeout: 10000,
		// Run tests sequentially to avoid race conditions with shared state
		pool: 'forks',
		poolOptions: {
			forks: {
				singleFork: true
			}
		}
	},
	resolve: {
		alias: {
			$lib: '/home/jan/svelte-pocketbase-template-backup-20251103-000241/src/lib'
		}
	}
});
