import { Link } from "react-router";
import "./Brand.css";

export default function Brand({ to = "/", onClick }) {
  return <Link className="brand" to={to} aria-label="Reclaim home" onClick={onClick}>
    <img src="/assets/icons/reclaim_logo.png" width="40" height="40" alt="" />
    <span>Reclaim</span>
  </Link>;
}
