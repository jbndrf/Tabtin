<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Settings, Image, BarChart3, Plus, Eye, Images, FolderKanban } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';

	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}

	// Check if we're on a project page
	let isOnProjectPage = $derived($page.url.pathname.startsWith('/projects/'));
	let projectId = $derived(
		isOnProjectPage ? $page.url.pathname.split('/')[2] : null
	);

	function navigateTo(path: string) {
		goto(path);
	}
</script>

{#if isOnProjectPage && projectId}
	<!-- Mobile Bottom Navigation -->
	<nav
		class="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden"
		aria-label="Mobile navigation"
	>
		<div class="flex items-center justify-around">
			<!-- Project Main Page -->
			<a
				href="/projects/{projectId}"
				class="flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs transition-colors hover:bg-accent"
				class:text-primary={$page.url.pathname === `/projects/${projectId}`}
				class:text-muted-foreground={$page.url.pathname !== `/projects/${projectId}`}
			>
				<FolderKanban class="h-5 w-5" />
				<span>{t('nav.projects')}</span>
			</a>

			<!-- Settings -->
			<a
				href="/projects/{projectId}/settings"
				class="flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs transition-colors hover:bg-accent"
				class:text-primary={isActive(`/projects/${projectId}/settings`)}
				class:text-muted-foreground={!isActive(`/projects/${projectId}/settings`)}
			>
				<Settings class="h-5 w-5" />
				<span>{t('nav.settings')}</span>
			</a>

			<!-- Images Dropdown -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							class="flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs transition-colors hover:bg-accent"
							class:text-primary={isActive(`/projects/${projectId}/images`)}
							class:text-muted-foreground={!isActive(`/projects/${projectId}/images`)}
						>
							<Image class="h-5 w-5" />
							<span>{t('nav.images')}</span>
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="w-72 mb-2" side="top" align="center">
					<DropdownMenu.Item
						class="py-4 text-base"
						onclick={() => {
							if ($page.url.pathname === `/projects/${projectId}/images/add`) {
								// Already on the page, just trigger camera without navigation
								window.dispatchEvent(new CustomEvent('trigger-camera'));
							} else {
								navigateTo(`/projects/${projectId}/images/add?autoCamera=true`);
							}
						}}
					>
						<Plus class="mr-3 h-6 w-6" />
						{t('nav.images_add')}
					</DropdownMenu.Item>
					<DropdownMenu.Item
						class="py-4 text-base"
						onclick={() => navigateTo(`/projects/${projectId}/images/review`)}
					>
						<Eye class="mr-3 h-6 w-6" />
						{t('nav.images_review')}
					</DropdownMenu.Item>
					<DropdownMenu.Item
						class="py-4 text-base"
						onclick={() => navigateTo(`/projects/${projectId}/images`)}
					>
						<Images class="mr-3 h-6 w-6" />
						{t('nav.images_all')}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<!-- Results -->
			<a
				href="/projects/{projectId}/results"
				class="flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs transition-colors hover:bg-accent"
				class:text-primary={isActive(`/projects/${projectId}/results`)}
				class:text-muted-foreground={!isActive(`/projects/${projectId}/results`)}
			>
				<BarChart3 class="h-5 w-5" />
				<span>{t('nav.results')}</span>
			</a>
		</div>
	</nav>

	<!-- Desktop Header Navigation (Horizontal) -->
	<nav class="hidden md:flex items-center gap-1" aria-label="Desktop navigation">
		<!-- Project Main Page -->
		<a
			href="/projects/{projectId}"
			class="flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent"
			class:text-primary={$page.url.pathname === `/projects/${projectId}`}
			class:bg-accent={$page.url.pathname === `/projects/${projectId}`}
			class:text-muted-foreground={$page.url.pathname !== `/projects/${projectId}`}
		>
			<FolderKanban class="h-4 w-4" />
			<span>{t('nav.projects')}</span>
		</a>

		<!-- Settings -->
		<a
			href="/projects/{projectId}/settings"
			class="flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent"
			class:text-primary={isActive(`/projects/${projectId}/settings`)}
			class:bg-accent={isActive(`/projects/${projectId}/settings`)}
			class:text-muted-foreground={!isActive(`/projects/${projectId}/settings`)}
		>
			<Settings class="h-4 w-4" />
			<span>{t('nav.settings')}</span>
		</a>

		<!-- Images Dropdown -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent"
						class:text-primary={isActive(`/projects/${projectId}/images`)}
						class:bg-accent={isActive(`/projects/${projectId}/images`)}
						class:text-muted-foreground={!isActive(`/projects/${projectId}/images`)}
					>
						<Image class="h-4 w-4" />
						<span>{t('nav.images')}</span>
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-72" side="bottom" align="start">
				<DropdownMenu.Item
					class="py-4 text-base"
					onclick={() => {
						if ($page.url.pathname === `/projects/${projectId}/images/add`) {
							// Already on the page, just trigger camera without navigation
							window.dispatchEvent(new CustomEvent('trigger-camera'));
						} else {
							navigateTo(`/projects/${projectId}/images/add?autoCamera=true`);
						}
					}}
				>
					<Plus class="mr-3 h-6 w-6" />
					{t('nav.images_add')}
				</DropdownMenu.Item>
				<DropdownMenu.Item
					class="py-4 text-base"
					onclick={() => navigateTo(`/projects/${projectId}/images/review`)}
				>
					<Eye class="mr-3 h-6 w-6" />
					{t('nav.images_review')}
				</DropdownMenu.Item>
				<DropdownMenu.Item
					class="py-4 text-base"
					onclick={() => navigateTo(`/projects/${projectId}/images`)}
				>
					<Images class="mr-3 h-6 w-6" />
					{t('nav.images_all')}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- Results -->
		<a
			href="/projects/{projectId}/results"
			class="flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent"
			class:text-primary={isActive(`/projects/${projectId}/results`)}
			class:bg-accent={isActive(`/projects/${projectId}/results`)}
			class:text-muted-foreground={!isActive(`/projects/${projectId}/results`)}
		>
			<BarChart3 class="h-4 w-4" />
			<span>{t('nav.results')}</span>
		</a>
	</nav>

	<!-- Spacer to prevent content from being hidden behind the nav on mobile -->
	<div class="h-16 md:hidden" aria-hidden="true"></div>
{/if}
