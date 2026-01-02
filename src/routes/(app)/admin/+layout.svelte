<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import Settings from 'lucide-svelte/icons/settings';
	import Users from 'lucide-svelte/icons/users';
	import Server from 'lucide-svelte/icons/server';
	import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';

	let { children }: { children: any } = $props();

	const navItems = [
		{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/admin/settings', label: 'Settings', icon: Settings },
		{ href: '/admin/endpoints', label: 'Endpoints', icon: Server },
		{ href: '/admin/users', label: 'Users', icon: Users }
	];

	function isActive(href: string) {
		if (href === '/admin') {
			return $page.url.pathname === '/admin';
		}
		return $page.url.pathname.startsWith(href);
	}
</script>

<div class="flex flex-col h-full">
	<!-- Admin sub-navigation -->
	<div class="border-b bg-muted/40 px-4 py-2">
		<nav class="flex gap-2 overflow-x-auto">
			{#each navItems as item}
				{@const Icon = item.icon}
				<Button
					variant={isActive(item.href) ? 'secondary' : 'ghost'}
					size="sm"
					href={item.href}
					class="shrink-0"
				>
					<Icon class="h-4 w-4 mr-2" />
					{item.label}
				</Button>
			{/each}
		</nav>
	</div>

	<!-- Admin content -->
	<div class="flex-1 overflow-auto">
		{@render children()}
	</div>
</div>
