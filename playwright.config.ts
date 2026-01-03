import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	// Look for test files in the e2e directory
	testDir: 'tests/e2e',

	// Run tests in parallel within files, but files sequentially
	fullyParallel: false,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry failed tests once on CI
	retries: process.env.CI ? 1 : 0,

	// Limit parallel workers - E2E tests share state
	workers: 1,

	// Reporter
	reporter: process.env.CI ? 'github' : 'list',

	// Shared settings for all projects
	use: {
		// Base URL to use in tests
		baseURL: 'http://localhost:5173',

		// Collect trace when retrying failed test
		trace: 'on-first-retry',

		// Screenshot on failure
		screenshot: 'only-on-failure'
	},

	// Configure projects for major browsers
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
		// Add more browsers if needed:
		// { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		// { name: 'mobile', use: { ...devices['Pixel 5'] } },
	],

	// Run local dev server before starting tests
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 120000
	}
});
