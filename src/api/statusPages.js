import { api, pageInfo } from "./client.js";

// Every badge is the server's full filtered total, never the current page length.
export async function statusPages(path, { query = {}, statuses, active, page = 1, perPage = 20 }) {
  const pages = await Promise.all(statuses.map(status => api(path, { query: {
    ...query, status, per_page: status === active ? perPage : 1, page: status === active ? page : 1,
  } })));
  return { ...pages[statuses.indexOf(active)], tabCounts: Object.fromEntries(statuses.map((status, index) => [status, pageInfo(pages[index]).total])) };
}
