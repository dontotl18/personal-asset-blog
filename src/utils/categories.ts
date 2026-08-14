import type { BlogPost } from './posts';

export const categoryDefinitions = [
	{ label: '개발기', slug: 'devlog' },
	{ label: '개념 정리', slug: 'concepts' },
	{ label: '기술 문제 해결', slug: 'troubleshooting' },
] as const;

export type CategoryDefinition = (typeof categoryDefinitions)[number];

export function getAvailableCategories(posts: BlogPost[]): CategoryDefinition[] {
	const availableLabels = new Set(posts.map((post) => post.data.category));

	return categoryDefinitions.filter((category) => availableLabels.has(category.label));
}

export function getPostsByCategory(posts: BlogPost[], category: CategoryDefinition): BlogPost[] {
	return posts.filter((post) => post.data.category === category.label);
}
