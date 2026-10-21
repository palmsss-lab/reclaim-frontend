import { allPages } from "../api/client";
import { ErrorNotice, Field, useApiResource } from "./ui";

export function PublicCategorySelect({ value, onChange, label = "Category (optional)", id = "category_id", all = false, error }) {
  const resource = useApiResource("public-categories", () => allPages("public/categories"));
  const empty = !resource.loading && !resource.error && !resource.rows.length;
  return <div className="category-select"><Field label={label} name={id} error={error} hint={empty ? (all ? "Category filtering is unavailable. You can still search all items." : "No categories are available yet. You can submit without a category.") : undefined}>
    <select id={id} value={value} onChange={onChange} disabled={resource.loading || Boolean(resource.error) || empty} aria-busy={resource.loading}>
      <option value="">{resource.loading ? "Loading categories..." : all ? "All categories" : "No category selected"}</option>
      {resource.rows.map(category => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}
    </select>
  </Field>{resource.error && <><ErrorNotice error={resource.error} title="Categories could not be loaded" retry={false} /><button className="text-button" type="button" onClick={resource.reload}>Retry categories</button></>}</div>;
}
