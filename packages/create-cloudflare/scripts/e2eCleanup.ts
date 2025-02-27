import { fetch } from "undici";

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.error("CLOUDFLARE_API_TOKEN must be set");
	process.exit(1);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.error("CLOUDFLARE_ACCOUNT_ID must be set");
	process.exit(1);
}

type ApiErrorBody = {
	errors: string[];
};

type ApiSuccessBody = {
	result: any[];
};

type Project = {
	name: string;
};

const apiFetch = async (
	path: string,
	init = { method: "GET" },
	queryParams = {}
) => {
	const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}`;
	const queryString = queryParams
		? `?${new URLSearchParams(queryParams).toString()}`
		: "";
	const url = `${baseUrl}${path}${queryString}`;

	const response = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
		},
	});

	if (response.status >= 400) {
		console.error(`REQUEST ERROR: ${url}`);
		console.error(`(${response.status}) ${response.statusText}`);
		const body = (await response.json()) as ApiErrorBody;
		console.error(body.errors);

		// Returning null instead of throwing an error here allows the caller to decide whether
		// to continue on fail or not. A failure to list projects should end the script, whereas
		// a failure to delete a project may happen due to concurrent runs of this script, and should
		// be tolerated.
		return null;
	}

	const json = (await response.json()) as ApiSuccessBody;

	return json.result;
};

const listC3Projects = async () => {
	const pageSize = 10;
	let page = 1;

	const projects = [];
	while (projects.length % pageSize === 0) {
		const res = await apiFetch(
			`/pages/projects`,
			{ method: "GET" },
			{
				per_page: pageSize,
				page,
			}
		);

		if (res === null) {
			console.error("Failed to fetch project list");
			process.exit(1);
		}

		projects.push(...res);
		page++;
		if (res.length < pageSize) {
			break;
		}
	}

	return projects.filter((p) => p.name.startsWith("c3-e2e-"));
};

export const deleteProject = async (project: string) => {
	console.log(`Deleting project: ${project}`);
	await apiFetch(`/pages/projects/${project}`, {
		method: "DELETE",
	});
};

const run = async () => {
	const projectsToDelete = (await listC3Projects()) as Project[];

	for (const project of projectsToDelete) {
		await deleteProject(project.name);
	}

	if (projectsToDelete.length === 0) {
		console.log(`No projects to delete.`);
	} else {
		console.log(`Successfully deleted ${projectsToDelete.length} projects`);
	}
};

run();
