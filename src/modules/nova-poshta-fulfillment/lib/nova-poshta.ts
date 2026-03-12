const NP_API_URL = "https://api.novaposhta.ua/v2.0/json/"

function getApiKey(): string {
  return process.env.NOVAPOSHTA_API_KEY ?? ""
}

export function isConfigured(): boolean {
  return !!getApiKey()
}

// Types
export interface NpCity {
  ref: string // DeliveryCity ref — pass to getWarehouses
  name: string
  fullName: string
  area: string
  settlementRef: string
  warehouseCount: number
}

export interface NpWarehouse {
  ref: string
  number: string
  description: string
  shortAddress: string
  cityRef: string
  typeRef: string
}

interface NpApiResponse<T> {
  success: boolean
  data: T[]
  errors: string[]
  warnings: string[]
}

async function npFetch<T>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, unknown>
): Promise<T[]> {
  const apiKey = getApiKey()
  if (!apiKey) return []

  const response = await fetch(NP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      modelName,
      calledMethod,
      methodProperties,
    }),
  })

  if (!response.ok) {
    console.error(
      `[NovaPoshta] HTTP ${response.status} for ${modelName}.${calledMethod}`
    )
    return []
  }

  const json = (await response.json()) as NpApiResponse<T>
  if (!json.success) {
    console.error(`[NovaPoshta] API error:`, json.errors)
    return []
  }

  return json.data
}

export async function searchCities(
  query: string,
  limit = 20
): Promise<NpCity[]> {
  if (!query || query.length < 2) return []

  interface RawSettlement {
    TotalCount: number
    Addresses: Array<{
      Present: string
      Warehouses: number
      MainDescription: string
      Area: string
      Region: string
      SettlementTypeCode: string
      Ref: string
      DeliveryCity: string
    }>
  }

  const data = await npFetch<RawSettlement>("Address", "searchSettlements", {
    CityName: query,
    Limit: String(limit),
    Page: "1",
  })

  if (!data.length || !data[0]?.Addresses) return []

  return data[0].Addresses.map((addr) => ({
    ref: addr.DeliveryCity, // IMPORTANT: use DeliveryCity, NOT Ref
    name: addr.MainDescription,
    fullName: addr.Present,
    area: addr.Area,
    settlementRef: addr.Ref,
    warehouseCount: addr.Warehouses,
  }))
}

export async function getWarehouses(
  cityRef: string,
  query?: string,
  limit = 50,
  page = 1
): Promise<NpWarehouse[]> {
  if (!cityRef) return []

  interface RawWarehouse {
    Ref: string
    Number: string
    Description: string
    ShortAddress: string
    CityRef: string
    TypeOfWarehouse: string
  }

  const props: Record<string, unknown> = {
    CityRef: cityRef,
    Limit: String(limit),
    Page: String(page),
  }

  if (query) {
    props.FindByString = query
  }

  const data = await npFetch<RawWarehouse>("Address", "getWarehouses", props)

  return data.map((wh) => ({
    ref: wh.Ref,
    number: wh.Number,
    description: wh.Description,
    shortAddress: wh.ShortAddress,
    cityRef: wh.CityRef,
    typeRef: wh.TypeOfWarehouse,
  }))
}
