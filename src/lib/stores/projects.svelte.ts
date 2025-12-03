import { pb } from '$lib/stores/auth';
import type { ProjectsResponse } from '$lib/pocketbase-types';

let projects = $state<ProjectsResponse[]>([]);
let isLoading = $state(false);
let error = $state<string | null>(null);

export const projectsStore = {
	get projects() {
		return projects;
	},
	get isLoading() {
		return isLoading;
	},
	get error() {
		return error;
	},

	async loadProjects(userId: string) {
		if (!userId) {
			projects = [];
			return;
		}

		isLoading = true;
		error = null;

		try {
			// Use getList with high perPage instead of getFullList to avoid skipTotal parameter issue
			// Note: Sort by -id instead of -created since created field may not exist in older schemas
			const result = await pb.collection('projects').getList<ProjectsResponse>(1, 500, {
				sort: '-id',
				filter: `user = '${userId}'`
			});
			projects = result.items;
		} catch (err) {
			console.error('Failed to load projects:', err);
			error = err instanceof Error ? err.message : 'Failed to load projects';
			projects = [];
		} finally {
			isLoading = false;
		}
	},

	addProject(project: ProjectsResponse) {
		projects = [project, ...projects];
	},

	updateProject(projectId: string, updates: Partial<ProjectsResponse>) {
		const index = projects.findIndex((p) => p.id === projectId);
		if (index !== -1) {
			projects[index] = { ...projects[index], ...updates };
			projects = [...projects];
		}
	},

	removeProject(projectId: string) {
		projects = projects.filter((p) => p.id !== projectId);
	},

	clear() {
		projects = [];
		error = null;
	}
};
