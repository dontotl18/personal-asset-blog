import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export async function getVisiblePosts(): Promise<BlogPost[]> {
	const posts = await getCollection('blog', ({ data }) =>
		import.meta.env.PROD ? !data.draft : true,
	);

	return posts.sort((a, b) => {
		const dateDifference = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

		return dateDifference || b.id.localeCompare(a.id, 'en');
	});
}

export const formatPostDate = (date: Date) =>
	new Intl.DateTimeFormat('ko-KR', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	}).format(date);
