<script lang="ts">
	import { SidebarProvider, SidebarInset, SidebarTrigger } from '$lib/components/ui/sidebar';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import MobileNav from '$lib/components/app/mobile-nav.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { currentUser } from '$lib/stores/auth';
	import { onMount } from 'svelte';
	import { pageActions } from '$lib/stores/page-actions';
	import { projectsStore } from '$lib/stores/projects.svelte';

	let { children }: { children: any } = $props();

	// Load projects when authenticated (auth is already verified server-side)
	onMount(() => {
		if ($currentUser?.id) {
			projectsStore.loadProjects($currentUser.id);
		}
	});

	// Derive page title from URL
	let pageTitle = $derived(() => {
		const pathname = $page.url.pathname;
		if (pathname === '/dashboard') return 'Dashboard';
		if (pathname.startsWith('/projects/')) {
			if (pathname.endsWith('/settings')) {
				const project = projectsStore.projects?.find((p) => pathname.includes(p.id));
				return project ? `${project.name} - Settings` : 'Project Settings';
			}
			const project = projectsStore.projects?.find((p) => pathname.includes(p.id));
			return project?.name || 'Project';
		}
		return 'App';
	});

	// Check if we're on the review page (hide UI chrome)
	let isReviewPage = $derived($page.url.pathname.includes('/review'));
</script>

{#if isReviewPage}
	<!-- Fullscreen review mode - no sidebar or navigation -->
	{@render children()}
{:else}
	<SidebarProvider>
		<AppSidebar projects={projectsStore.projects} />
		<SidebarInset>
			<header
				class="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4"
			>
				<SidebarTrigger class="-ml-1 md:inline-flex" />
				<Separator orientation="vertical" class="h-6 hidden md:block" />
				<h1 class="text-lg font-semibold flex-1 md:flex-initial">{pageTitle()}</h1>

				<!-- Desktop Navigation -->
				<div class="hidden md:flex flex-1">
					<MobileNav />
				</div>

				{#if $pageActions.length > 0}
					<div class="flex gap-2">
						{#each $pageActions as action}
							<Button
								variant={action.variant || 'default'}
								size={action.size || 'default'}
								disabled={action.disabled}
								onclick={action.onclick}
								class={action.class}
							>
								{#if action.icon}
									{@const Icon = action.icon}
									<Icon class="h-5 w-5" />
								{:else}
									{action.label}
								{/if}
							</Button>
						{/each}
					</div>
				{/if}
			</header>
			<main class="flex flex-1 flex-col pb-16 md:pb-0">
				{@render children()}
			</main>
			<!-- Mobile Bottom Navigation (only visible on mobile) -->
			<div class="md:hidden">
				<MobileNav />
			</div>
		</SidebarInset>
	</SidebarProvider>
{/if}
