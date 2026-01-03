/**
 * URL Validation Utility - SSRF Protection
 *
 * Blocks requests to internal network ranges to prevent Server-Side Request Forgery.
 * Used for validating user-provided URLs before making server-side requests.
 */

import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

/**
 * Check if an IP address is in a private/internal range
 */
function isPrivateIP(ip: string): boolean {
	// Handle IPv4
	const ipv4Parts = ip.split('.');
	if (ipv4Parts.length === 4) {
		const [a, b, c, d] = ipv4Parts.map(Number);

		// 127.0.0.0/8 - Loopback
		if (a === 127) return true;

		// 10.0.0.0/8 - Private Class A
		if (a === 10) return true;

		// 172.16.0.0/12 - Private Class B
		if (a === 172 && b >= 16 && b <= 31) return true;

		// 192.168.0.0/16 - Private Class C
		if (a === 192 && b === 168) return true;

		// 169.254.0.0/16 - Link-local (including cloud metadata at 169.254.169.254)
		if (a === 169 && b === 254) return true;

		// 0.0.0.0/8 - Current network
		if (a === 0) return true;

		// 224.0.0.0/4 - Multicast
		if (a >= 224 && a <= 239) return true;

		// 240.0.0.0/4 - Reserved
		if (a >= 240) return true;
	}

	// Handle IPv6
	const normalizedIp = ip.toLowerCase();

	// ::1 - IPv6 loopback
	if (normalizedIp === '::1' || normalizedIp === '0:0:0:0:0:0:0:1') return true;

	// :: - IPv6 unspecified
	if (normalizedIp === '::' || normalizedIp === '0:0:0:0:0:0:0:0') return true;

	// fe80::/10 - IPv6 link-local
	if (normalizedIp.startsWith('fe80:')) return true;

	// fc00::/7 - IPv6 unique local (private)
	if (normalizedIp.startsWith('fc') || normalizedIp.startsWith('fd')) return true;

	// ::ffff:127.0.0.1 - IPv4-mapped IPv6 loopback
	if (normalizedIp.startsWith('::ffff:')) {
		const ipv4Part = normalizedIp.replace('::ffff:', '');
		return isPrivateIP(ipv4Part);
	}

	return false;
}

/**
 * Validate that a URL is safe to fetch (not pointing to internal resources)
 *
 * @param urlString - The URL to validate
 * @returns Object with allowed: boolean and optional reason for rejection
 */
export async function validateExternalUrl(urlString: string): Promise<{
	allowed: boolean;
	reason?: string;
}> {
	try {
		const url = new URL(urlString);

		// Only allow http and https
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return { allowed: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
		}

		const hostname = url.hostname;

		// Block localhost variations
		if (
			hostname === 'localhost' ||
			hostname === 'localhost.localdomain' ||
			hostname.endsWith('.localhost')
		) {
			return { allowed: false, reason: 'Localhost is not allowed' };
		}

		// Check if hostname is already an IP
		const ipMatch = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
		if (ipMatch) {
			if (isPrivateIP(hostname)) {
				return { allowed: false, reason: 'Private IP addresses are not allowed' };
			}
			return { allowed: true };
		}

		// DNS rebinding protection: resolve the hostname and check the IP
		try {
			const { address } = await dnsLookup(hostname);
			if (isPrivateIP(address)) {
				return {
					allowed: false,
					reason: `Hostname resolves to private IP address (${address})`
				};
			}
		} catch (dnsError: any) {
			// DNS resolution failed - could be:
			// - Invalid hostname
			// - Network issue
			// - Intentional to bypass checks
			// We reject to be safe
			return {
				allowed: false,
				reason: `Could not resolve hostname: ${dnsError.code || dnsError.message}`
			};
		}

		return { allowed: true };
	} catch (parseError: any) {
		return { allowed: false, reason: `Invalid URL: ${parseError.message}` };
	}
}

