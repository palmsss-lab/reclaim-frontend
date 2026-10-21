import { Link } from "react-router";
import { PublicImages } from "./Images";
import { formatDate } from "./ui";

export function ItemGlyph({ category = "" }) {
  const icons = { accessories: "accessories", "personal items": "personal", electronics: "electronics", bags: "bags", identification: "identity" };
  return <img className="category-icon" src={"/assets/icons/" + (icons[String(category).toLowerCase()] || "other") + ".svg"} alt="" />;
}

export function PublicItemCard({ item }) {
  const titleId = "public-item-" + item.item_id;
  return <article className="public-item-card" aria-labelledby={titleId}>
    <div className="public-item-art">
      <PublicImages item={item} firstOnly fallback={<div className="item-photo-fallback"><ItemGlyph category={item.category_name} /><span>No public photo</span></div>} />
    </div>
    <span className="category-pill">{item.category_name}</span>
    <div className="public-item-copy">
      <h3 id={titleId}>{item.public_description}</h3>
      <p className="item-received">Received <time dateTime={item.received_at}>{formatDate(item.received_at)}</time></p>
    </div>
    <Link className="button button-soft item-view-link" to={"/items/" + item.item_id} aria-describedby={titleId}>View details</Link>
  </article>;
}
