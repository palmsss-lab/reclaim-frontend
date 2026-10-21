import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

export function useQueueFilters(defaultStatus) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const applied = { q: params.get("q") || "", status: params.has("status") ? params.get("status") : defaultStatus };
  const pageNumber = Math.max(1, Number(params.get("page")) || 1);
  const [filters, setFilters] = useState(applied);
  useEffect(() => { setFilters({ q: params.get("q") || "", status: params.has("status") ? params.get("status") : defaultStatus }); }, [params.toString(), defaultStatus]);
  function apply(event) { event.preventDefault(); setParams({ ...filters, page: "1" }); }
  function setPageNumber(page) { setParams({ ...applied, page: String(page) }); }
  function clear() { setParams({ q: "", status: "", page: "1" }); }
  return { filters, setFilters, applied, pageNumber, setPageNumber, apply, clear, reviewFrom: location.pathname + location.search };
}
