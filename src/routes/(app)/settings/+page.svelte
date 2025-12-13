<script lang="ts">
	import { Card, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Package } from 'lucide-svelte';
</script>

<div class="flex flex-col gap-6 p-4">
	<!-- Header -->
	<div>
		<h2 class="text-2xl font-bold tracking-tight">Settings</h2>
		<p class="text-muted-foreground">Manage your application settings and integrations</p>
	</div>

	<!-- Settings Grid -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		<!-- Addons -->
		<a href="/settings/addons" class="block">
			<Card class="h-full transition-colors hover:bg-muted/50">
				<CardHeader>
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
							<Package class="h-5 w-5 text-primary" />
						</div>
						<div>
							<CardTitle class="text-base">Addons</CardTitle>
							<CardDescription>Manage Docker-based addons</CardDescription>
						</div>
					</div>
				</CardHeader>
			</Card>
		</a>
	</div>
</div>
