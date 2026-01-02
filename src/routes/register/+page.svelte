<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod/v4';
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/theme/theme-toggle.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const registerSchema = z
		.object({
			name: z.string().min(2, 'Name must be at least 2 characters'),
			email: z.string().email('Please enter a valid email address'),
			password: z.string().min(8, 'Password must be at least 8 characters'),
			passwordConfirm: z.string().min(8, 'Password must be at least 8 characters')
		})
		.refine((data) => data.password === data.passwordConfirm, {
			message: 'Passwords do not match',
			path: ['passwordConfirm']
		});

	const form = superForm(data.form, {
		validators: zod4Client(registerSchema),
		dataType: 'json'
	});

	const { form: formData, enhance, errors } = form;
</script>

<div class="relative flex min-h-screen items-center justify-center bg-background p-4">
	<div class="absolute right-4 top-4">
		<ThemeToggle />
	</div>
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl">
				{#if data.isFirstUser}
					Setup Admin Account
				{:else}
					Create Account
				{/if}
			</Card.Title>
			<Card.Description>
				{#if data.isFirstUser}
					Create the first admin account to get started
				{:else if !data.registrationAllowed}
					Registration is currently disabled
				{:else}
					Get started by creating a new account
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if !data.registrationAllowed && !data.isFirstUser}
				<div class="space-y-4">
					<p class="text-sm text-muted-foreground">
						New user registration has been disabled by the administrator.
						Please contact an admin if you need access.
					</p>
					<a href="/login" class="block">
						<Button variant="outline" class="w-full">Back to Login</Button>
					</a>
				</div>
			{:else}
			<form method="POST" use:enhance class="space-y-4">
				<Form.Field {form} name="name">
					{#snippet children({ constraints, errors, tainted, value })}
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Name</Form.Label>
								<Input
									{...props}
									type="text"
									placeholder="Your name"
									bind:value={$formData.name}
									autocomplete="name"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					{/snippet}
				</Form.Field>

				<Form.Field {form} name="email">
					{#snippet children({ constraints, errors, tainted, value })}
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Email</Form.Label>
								<Input
									{...props}
									type="email"
									placeholder="name@example.com"
									bind:value={$formData.email}
									autocomplete="email"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					{/snippet}
				</Form.Field>

				<Form.Field {form} name="password">
					{#snippet children({ constraints, errors, tainted, value })}
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Password</Form.Label>
								<Input
									{...props}
									type="password"
									placeholder="Choose a strong password"
									bind:value={$formData.password}
									autocomplete="new-password"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					{/snippet}
				</Form.Field>

				<Form.Field {form} name="passwordConfirm">
					{#snippet children({ constraints, errors, tainted, value })}
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Confirm Password</Form.Label>
								<Input
									{...props}
									type="password"
									placeholder="Re-enter your password"
									bind:value={$formData.passwordConfirm}
									autocomplete="new-password"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					{/snippet}
				</Form.Field>

				{#if data.error}
					<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
						{data.error}
					</div>
				{/if}

				<Form.Button class="w-full">
					{#if data.isFirstUser}
						Create Admin Account
					{:else}
						Create Account
					{/if}
				</Form.Button>
			</form>

			{#if !data.isFirstUser}
			<div class="mt-4 text-center text-sm">
				<span class="text-muted-foreground">Already have an account?</span>
				<a href="/login" class="ml-1 text-primary hover:underline">Sign in here</a>
			</div>
			{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
