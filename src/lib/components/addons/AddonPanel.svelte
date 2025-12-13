<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { addonPanel, closeAddonPanel, getAddonByManifestId } from '$lib/stores/addons';
	import { currentUser } from '$lib/stores/auth';
	import type { AddonContext, AddonPanelSize } from '$lib/types/addon';
	import { X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	// Map size to CSS class
	function getSizeClass(size: AddonPanelSize): string {
		switch (size) {
			case 'sm':
				return 'max-w-md';
			case 'md':
				return 'max-w-lg';
			case 'lg':
				return 'max-w-2xl';
			case 'xl':
				return 'max-w-4xl';
			case 'full':
				return 'max-w-[95vw] w-[95vw]';
			default:
				return 'max-w-2xl';
		}
	}

	// Build iframe URL with context using proxy (addonId here is the manifest ID)
	function buildIframeUrl(manifestId: string, path: string): string | null {
		const addon = getAddonByManifestId(manifestId);
		if (!addon) return null;

		const ctx: AddonContext = {
			addonId: addon.manifest?.id || addon.id,
			userId: $currentUser?.id || ''
		};

		// Use proxy endpoint to avoid localhost/network issues
		const ctxParam = encodeURIComponent(JSON.stringify(ctx));
		return `/api/addons/proxy/${manifestId}${path}?ctx=${ctxParam}`;
	}

	// Handle close
	function handleClose() {
		closeAddonPanel();
	}

	// Reactive open state
	let open = $derived($addonPanel !== null);
</script>

<Dialog.Root
	{open}
	onOpenChange={(value) => {
		if (!value) handleClose();
	}}
>
	{#if $addonPanel}
		{@const iframeUrl = buildIframeUrl($addonPanel.addonId, $addonPanel.path)}
		{@const addon = getAddonByManifestId($addonPanel.addonId)}

		<Dialog.Content class="{getSizeClass($addonPanel.size)} h-[80vh] flex flex-col p-0">
			<Dialog.Header class="flex flex-row items-center justify-between border-b px-4 py-3">
				<Dialog.Title class="text-lg font-semibold">
					{$addonPanel.title || addon?.name || 'Addon'}
				</Dialog.Title>
				<Button variant="ghost" size="icon" onclick={handleClose}>
					<X class="h-4 w-4" />
				</Button>
			</Dialog.Header>

			<div class="flex-1 overflow-hidden">
				{#if iframeUrl}
					<iframe
						src={iframeUrl}
						title={$addonPanel.title || 'Addon Panel'}
						class="h-full w-full border-0"
						sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
					></iframe>
				{:else}
					<div class="flex h-full items-center justify-center text-muted-foreground">
						Addon not available
					</div>
				{/if}
			</div>
		</Dialog.Content>
	{/if}
</Dialog.Root>
