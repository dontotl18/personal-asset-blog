const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const withBase = (path = '/') => {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return `${base}${normalizedPath}`;
};
