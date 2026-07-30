export const SERVICE_CATALOG_PAGE_SIZE = 1000

export async function fetchAllServiceCatalogPages(buildQuery, { pageSize = SERVICE_CATALOG_PAGE_SIZE } = {}) {
  const rows = []
  const safePageSize = Math.max(1, Number(pageSize || SERVICE_CATALOG_PAGE_SIZE))

  for (let from = 0; ; from += safePageSize) {
    const result = await buildQuery().range(from, from + safePageSize - 1)
    if (result?.error) return { data: null, error: result.error }

    const page = Array.isArray(result?.data) ? result.data : []
    rows.push(...page)

    if (page.length < safePageSize) {
      return { data: rows, error: null }
    }
  }
}
