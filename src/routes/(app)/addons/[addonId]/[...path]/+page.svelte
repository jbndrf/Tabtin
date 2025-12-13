<script lang="ts">
	import type { PageData } from './$types';
	import type { AddonContext } from '$lib/types/addon';

	let { data }: { data: PageData } = $props();

	// Build iframe URL using proxy endpoint to avoid localhost/network issues
	const iframeUrl = (() => {
		// Use proxy: /api/addons/proxy/[addonId]/[path]
		const ctx: AddonContext = {
			addonId: data.addon.manifestId,
			userId: data.userId
		};

		const ctxParam = encodeURIComponent(JSON.stringify(ctx));
		return `/api/addons/proxy/${data.addon.manifestId}${data.path}?ctx=${ctxParam}`;
	})();
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<div class="flex h-full flex-col">
	<iframe
		src={iframeUrl}
		title={data.title}
		class="h-full w-full flex-1 border-0"
		sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
	></iframe>
</div>

<style>
	div {
		height: calc(100vh - 4rem);
	}
</style>
