<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import Save from 'lucide-svelte/icons/save';
	import Loader2 from 'lucide-svelte/icons/loader-2';

	interface AppSettings {
		id: string;
		allow_registration: boolean;
		require_email_verification: boolean;
		allow_custom_endpoints: boolean;
	}

	let settings: AppSettings | null = $state(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	// Local form state (defaults match secure server defaults)
	let allowRegistration = $state(false);
	let requireEmailVerification = $state(true);
	let allowCustomEndpoints = $state(true);

	async function loadSettings() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/admin/settings');
			if (!res.ok) {
				throw new Error('Failed to load settings');
			}
			const data = await res.json();
			settings = data.settings;
			allowRegistration = settings?.allow_registration ?? false;
			requireEmailVerification = settings?.require_email_verification ?? true;
			allowCustomEndpoints = settings?.allow_custom_endpoints ?? true;
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	async function saveSettings() {
		saving = true;
		error = null;
		success = null;
		try {
			const res = await fetch('/api/admin/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					allow_registration: allowRegistration,
					require_email_verification: requireEmailVerification,
					allow_custom_endpoints: allowCustomEndpoints
				})
			});
			if (!res.ok) {
				throw new Error('Failed to save settings');
			}
			const data = await res.json();
			settings = data.settings;
			success = 'Settings saved successfully';
			setTimeout(() => (success = null), 3000);
		} catch (e: any) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		loadSettings();
	});
</script>

<div class="p-6 space-y-6 max-w-2xl">
	<div>
		<h2 class="text-2xl font-bold">Application Settings</h2>
		<p class="text-muted-foreground">Configure registration and user settings</p>
	</div>

	{#if loading}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin" />
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Registration</Card.Title>
				<Card.Description>Control how users can register for the application</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label for="allow-registration">Allow Registration</Label>
						<p class="text-sm text-muted-foreground">
							When disabled, new users cannot create accounts
						</p>
					</div>
					<Switch id="allow-registration" bind:checked={allowRegistration} />
				</div>

				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label for="require-verification">Require Email Verification</Label>
						<p class="text-sm text-muted-foreground">
							Users must verify their email before accessing the app
						</p>
					</div>
					<Switch id="require-verification" bind:checked={requireEmailVerification} />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Endpoints</Card.Title>
				<Card.Description>Control endpoint configuration options</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label for="allow-custom">Allow Custom Endpoints</Label>
						<p class="text-sm text-muted-foreground">
							Let users configure their own API endpoints in projects
						</p>
					</div>
					<Switch id="allow-custom" bind:checked={allowCustomEndpoints} />
				</div>
			</Card.Content>
		</Card.Root>

		{#if error}
			<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{/if}

		{#if success}
			<div class="rounded-md bg-green-500/10 p-3 text-sm text-green-600">
				{success}
			</div>
		{/if}

		<div class="flex justify-end">
			<Button onclick={saveSettings} disabled={saving}>
				{#if saving}
					<Loader2 class="h-4 w-4 mr-2 animate-spin" />
				{:else}
					<Save class="h-4 w-4 mr-2" />
				{/if}
				Save Settings
			</Button>
		</div>
	{/if}
</div>
