# Nova Poshta Delivery Module — Full Implementation Guide

## Overview

This module integrates **Nova Poshta** (Ukraine's #1 carrier) into an e-commerce checkout. It provides:

1. **City autocomplete** — user types city name, gets suggestions from Nova Poshta API
2. **Warehouse autocomplete** — after city selection, user picks a warehouse/branch
3. **Server-side proxy API** — frontend calls our API route, which calls Nova Poshta API (hides API key)
4. **Checkout integration** — selected city + warehouse are sent with the order

The architecture is: **Frontend combobox** -> **Our API route (proxy)** -> **Nova Poshta API v2.0**

---

## Architecture Diagram

```
[NovaPoshtaCitySelect]  ──POST──>  [/api/nova-poshta]  ──POST──>  [api.novaposhta.ua/v2.0/json/]
       (React)                     (API route/proxy)                 (Nova Poshta API)
          │                               │
          ▼                               │
[NovaPoshtaWarehouseSelect]  ──POST──>────┘
       (React)

Selected city+warehouse are stored in checkout form state
and sent to [/api/checkout] when order is placed.
```

---

## Environment Variables

```env
NOVAPOSHTA_API_KEY=your_api_key_here
```

Get your API key at: https://new.novaposhta.ua/ (Personal Cabinet -> Settings -> API)

---

## Layer 1: Server-Side API Client (`src/lib/nova-poshta.ts`)

This is the core library that communicates with Nova Poshta API v2.0.

### Nova Poshta API Basics

- **Base URL**: `https://api.novaposhta.ua/v2.0/json/`
- **Method**: Always `POST`
- **Content-Type**: `application/json`
- **Authentication**: API key in the request body (not headers!)
- **Request structure**: Every request has the same shape:

```json
{
  "apiKey": "YOUR_KEY",
  "modelName": "Address",
  "calledMethod": "searchSettlements",
  "methodProperties": { ... }
}
```

### Full Source Code

```typescript
const NP_API_URL = 'https://api.novaposhta.ua/v2.0/json/'

function getApiKey(): string {
  return process.env.NOVAPOSHTA_API_KEY ?? ''
}

// Types
export interface NpCity {
  ref: string           // DeliveryCity ref — THIS is what you pass to getWarehouses
  name: string          // e.g. "Kyiv"
  fullName: string      // e.g. "m. Kyiv, Kyivska obl."
  area: string          // Region/oblast
  settlementRef: string // Settlement ref (different from DeliveryCity ref!)
  warehouseCount: number
}

export interface NpWarehouse {
  ref: string
  number: string        // e.g. "1"
  description: string   // Full description like "Branch #1 (up to 30 kg): str. Example, 135"
  shortAddress: string  // e.g. "Kyiv, str. Example, 135"
  cityRef: string
  typeRef: string
}

interface NpApiResponse<T> {
  success: boolean
  data: T[]
  errors: string[]
  warnings: string[]
}

// Generic fetch helper for all Nova Poshta API calls
async function npFetch<T>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, unknown>,
): Promise<T[]> {
  const apiKey = getApiKey()
  if (!apiKey) return []

  const response = await fetch(NP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      modelName,
      calledMethod,
      methodProperties,
    }),
  })

  if (!response.ok) {
    console.error(`[NovaPoshta] HTTP ${response.status} for ${modelName}.${calledMethod}`)
    return []
  }

  const json = (await response.json()) as NpApiResponse<T>
  if (!json.success) {
    console.error(`[NovaPoshta] API error:`, json.errors)
    return []
  }

  return json.data
}
```

### Method 1: Search Cities

Uses `Address.searchSettlements` — the best method for autocomplete because it:
- Searches across cities, towns, and villages
- Returns `DeliveryCity` ref which is needed for warehouse lookup
- Returns warehouse count per settlement

```typescript
export async function searchCities(query: string, limit = 20): Promise<NpCity[]> {
  if (!query || query.length < 2) return []

  // Nova Poshta returns a nested structure for searchSettlements
  interface RawSettlement {
    TotalCount: number
    Addresses: Array<{
      Present: string           // Full formatted name
      Warehouses: number        // Number of warehouses
      MainDescription: string   // City name
      Area: string              // Oblast/region
      Region: string
      SettlementTypeCode: string
      Ref: string               // Settlement ref
      DeliveryCity: string      // <-- THIS is the ref you need for getWarehouses
    }>
  }

  const data = await npFetch<RawSettlement>('Address', 'searchSettlements', {
    CityName: query,
    Limit: String(limit),
    Page: '1',
  })

  if (!data.length || !data[0]?.Addresses) return []

  return data[0].Addresses.map((addr) => ({
    ref: addr.DeliveryCity,      // IMPORTANT: use DeliveryCity, NOT Ref
    name: addr.MainDescription,
    fullName: addr.Present,
    area: addr.Area,
    settlementRef: addr.Ref,
    warehouseCount: addr.Warehouses,
  }))
}
```

**CRITICAL**: The `ref` field returned is `DeliveryCity`, NOT `Ref` (Settlement ref). These are different! `DeliveryCity` is what `getWarehouses` expects as `CityRef`.

### Method 2: Get Warehouses

Uses `Address.getWarehouses` to list all branches/post offices in a city.

```typescript
export async function getWarehouses(
  cityRef: string,    // This is the DeliveryCity ref from searchCities
  query?: string,     // Optional filter string (e.g. "5" to find branch #5)
  limit = 50,
  page = 1,
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

  // FindByString filters server-side (by branch number or address)
  if (query) {
    props.FindByString = query
  }

  const data = await npFetch<RawWarehouse>('Address', 'getWarehouses', props)

  return data.map((wh) => ({
    ref: wh.Ref,
    number: wh.Number,
    description: wh.Description,
    shortAddress: wh.ShortAddress,
    cityRef: wh.CityRef,
    typeRef: wh.TypeOfWarehouse,
  }))
}
```

---

## Layer 2: API Route / Proxy (`src/app/api/nova-poshta/route.ts`)

This route acts as a proxy so the frontend never sees the API key. It accepts a JSON body with an `action` field and dispatches to the appropriate function.

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { searchCities, getWarehouses, isConfigured } from '@/lib/nova-poshta'

interface NpRequestBody {
  action: 'searchCities' | 'getWarehouses'
  query?: string
  cityRef?: string
  page?: number
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json(
      { success: false, data: [], error: 'Nova Poshta API not configured' },
      { status: 200 },  // 200 so frontend doesn't break
    )
  }

  let body: NpRequestBody
  try {
    body = (await request.json()) as NpRequestBody
  } catch {
    return NextResponse.json({ success: false, data: [], error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    if (body.action === 'searchCities') {
      const cities = await searchCities(body.query ?? '', 20)
      return NextResponse.json({ success: true, data: cities })
    }

    if (body.action === 'getWarehouses') {
      if (!body.cityRef) {
        return NextResponse.json({ success: false, data: [], error: 'cityRef is required' }, { status: 400 })
      }
      const warehouses = await getWarehouses(body.cityRef, body.query, 50, body.page ?? 1)
      return NextResponse.json({ success: true, data: warehouses })
    }

    return NextResponse.json({ success: false, data: [], error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[NovaPoshta API Route]', error)
    return NextResponse.json({ success: false, data: [], error: 'Internal error' }, { status: 500 })
  }
}
```

### API Contract

**Search cities:**
```
POST /api/nova-poshta
{ "action": "searchCities", "query": "Ки" }

Response:
{
  "success": true,
  "data": [
    {
      "ref": "8d5a980d-391c-11dd-90d9-001a92567626",
      "name": "Київ",
      "fullName": "м. Київ, Київська обл.",
      "area": "Київська",
      "settlementRef": "e718a680-4b33-11e4-ab6d-005056801329",
      "warehouseCount": 534
    }
  ]
}
```

**Get warehouses:**
```
POST /api/nova-poshta
{ "action": "getWarehouses", "cityRef": "8d5a980d-391c-11dd-90d9-001a92567626" }

Response:
{
  "success": true,
  "data": [
    {
      "ref": "1ec09d88-e1c2-11e3-8c4a-0050568002cf",
      "number": "1",
      "description": "Відділення №1 (до 30 кг): вул. Пирогівський шлях, 135",
      "shortAddress": "Київ, вул. Пирогівський шлях, 135",
      "cityRef": "8d5a980d-391c-11dd-90d9-001a92567626",
      "typeRef": "841339c7-591a-42e2-8571-2564e4ff0e0d"
    }
  ]
}
```

---

## Layer 3: Frontend Components

### Component 1: City Autocomplete (`NovaPoshtaCitySelect`)

Key behaviors:
- User types >= 2 characters -> debounce 300ms -> fetch cities from API
- Shows dropdown with city name, full name, and warehouse count
- When city is selected, calls `onSelect(city)` with the full city object
- If user edits text after selecting, clears selection and calls `onSelect(null)`
- Keyboard: Enter selects first option, Escape closes dropdown
- Click outside closes dropdown
- Shows loading spinner, green checkmark (selected), or search icon

```typescript
// Props interface
interface NovaPoshtaCitySelectProps {
  value: string                              // Current display value
  onSelect: (city: CityOption | null) => void // Callback on selection
  error?: string                              // Validation error
  disabled?: boolean
}

// What the parent gets back:
interface CityOption {
  ref: string          // DeliveryCity ref — pass to warehouse component
  name: string         // City name
  fullName: string     // Full formatted name
  area: string         // Region
  warehouseCount: number
}
```

**How the parent uses it (in checkout form):**
```tsx
const [form, setForm] = useState({
  city: '',
  cityRef: '',
  warehouse: '',
})

const handleCitySelect = (city: CityOption | null) => {
  if (city) {
    setForm(prev => ({ ...prev, city: city.name, cityRef: city.ref, warehouse: '' }))
  } else {
    setForm(prev => ({ ...prev, city: '', cityRef: '', warehouse: '' }))
  }
}

<NovaPoshtaCitySelect value={form.city} onSelect={handleCitySelect} error={errors.city} />
```

### Component 2: Warehouse Autocomplete (`NovaPoshtaWarehouseSelect`)

Key behaviors:
- Receives `cityRef` prop from parent (from city selection)
- When `cityRef` changes, immediately fetches ALL warehouses for that city
- Stores warehouses in `allWarehouses` state
- User typing filters locally (no API call) with 150ms debounce
- When city changes, resets warehouse selection
- Same keyboard/click-outside behavior as city select
- Shows "First select a city" placeholder when no cityRef

```typescript
interface NovaPoshtaWarehouseSelectProps {
  cityRef: string                                  // From city selection
  value: string                                    // Current display value
  onSelect: (warehouse: WarehouseOption | null) => void
  error?: string
  disabled?: boolean
}

interface WarehouseOption {
  ref: string
  number: string
  description: string    // Full description (what gets saved to order)
  shortAddress: string
}
```

**How the parent uses it:**
```tsx
const handleWarehouseSelect = (wh: WarehouseOption | null) => {
  if (wh) {
    setForm(prev => ({ ...prev, warehouse: wh.description }))
  } else {
    setForm(prev => ({ ...prev, warehouse: '' }))
  }
}

<NovaPoshtaWarehouseSelect
  cityRef={form.cityRef}
  value={form.warehouse}
  onSelect={handleWarehouseSelect}
  error={errors.warehouse}
/>
```

**IMPORTANT implementation detail**: Warehouses are loaded eagerly (all at once when city is selected), then filtered locally. This gives instant filtering UX because most Ukrainian cities have <100 warehouses. For Kyiv (~534 warehouses), a single fetch of 50 items with server-side `FindByString` might be better, but the current approach works well in practice.

---

## Layer 4: Checkout Integration

### What gets saved to the order

The checkout form collects:
- `delivery.method`: `"nova_poshta_warehouse"` or `"nova_poshta_courier"`
- `delivery.city`: City name (string, e.g. "Київ")
- `delivery.warehouse`: Warehouse description (string, e.g. "Відділення №1 (до 30 кг): вул. Пирогівський шлях, 135")

The checkout API route (`/api/checkout`) saves these to the order:

```typescript
// In the order creation:
{
  deliveryMethod: body.delivery.method,      // "nova_poshta_warehouse"
  deliveryCity: body.delivery.city,          // "Київ"
  deliveryWarehouse: body.delivery.warehouse, // "Відділення №1..."
}
```

### Delivery method types supported

```typescript
// Methods that need city input (Nova Poshta address lookup)
function needsCityInput(method: string): boolean {
  return method !== 'pickup'  // Everything except self-pickup needs a city
}

// Methods that need warehouse selection
function needsWarehouseInput(method: string): boolean {
  return method === 'nova_poshta_warehouse'
}

// Methods that need street address (courier delivery)
function needsAddressInput(method: string): boolean {
  return method === 'nova_poshta_courier' || method === 'ukrposhta' || method === 'meest'
}
```

### Conditional form rendering in checkout

```tsx
{needsCityInput(form.delivery) && (
  <div>
    <NovaPoshtaCitySelect value={form.city} onSelect={handleCitySelect} />

    {needsWarehouseInput(form.delivery) && (
      <NovaPoshtaWarehouseSelect
        cityRef={form.cityRef}
        value={form.warehouse}
        onSelect={handleWarehouseSelect}
      />
    )}

    {needsAddressInput(form.delivery) && (
      <input placeholder="Street address" value={form.address} onChange={...} />
    )}
  </div>
)}
```

---

## Database Schema (Order fields)

For the order, you need these fields:

```
deliveryMethod: string     — "nova_poshta_warehouse" | "nova_poshta_courier" | "pickup" | etc.
deliveryCity: string       — City name (text)
deliveryWarehouse: string  — Warehouse description or courier address (text)
```

No need to store Nova Poshta refs (cityRef, warehouseRef) in the order unless you plan to create shipments via Nova Poshta API later.

---

## Adaptation Notes for Medusa.js v2

> Based on official Medusa v2 documentation: https://docs.medusajs.com/

### What to reuse as-is
1. **`nova-poshta.ts` library** — Pure TypeScript, no framework dependency. Copy into your Medusa project. Only change: `process.env.NOVAPOSHTA_API_KEY` (works the same in Medusa's `.env`).
2. **API response types** (`NpCity`, `NpWarehouse`) — fully portable.
3. **Nova Poshta API contract** — same POST requests, same response shapes.

---

### Architecture in Medusa v2

Nova Poshta integrates into Medusa at **two levels**:

1. **Fulfillment Module Provider** — extends `AbstractFulfillmentProviderService`. Registers Nova Poshta as a shipping option, handles fulfillment lifecycle.
2. **Custom API Route** — `POST /store/nova-poshta` for city/warehouse autocomplete proxy (same as our Next.js proxy route).

**File structure:**
```
src/
  modules/
    nova-poshta-fulfillment/
      index.ts              ← Module registration
      service.ts            ← Provider class (extends AbstractFulfillmentProviderService)
      lib/
        nova-poshta.ts      ← Copy from our project (API client)
  api/
    store/
      nova-poshta/
        route.ts            ← Proxy route for city/warehouse autocomplete
```

---

### Part 1: Fulfillment Provider Service (`service.ts`)

```typescript
import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import type {
  FulfillmentOption,
  CalculateShippingOptionPriceDTO,
} from "@medusajs/framework/types"
import { searchCities, getWarehouses } from "./lib/nova-poshta"

class NovaPoshtaFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "nova-poshta"

  // ─── 1. Define available fulfillment options ───
  // These become selectable shipping options in Medusa admin.
  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "nova-poshta-warehouse",
        name: "Nova Poshta — Warehouse Pickup",
        // metadata can include anything your frontend needs
      },
      {
        id: "nova-poshta-courier",
        name: "Nova Poshta — Courier Delivery",
      },
    ]
  }

  // ─── 2. Validate a shipping option ───
  // Called when admin creates a shipping option using this provider.
  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    // Any Nova Poshta option is valid
    return true
  }

  // ─── 3. Validate fulfillment data from customer ───
  // Called during checkout when customer selects Nova Poshta and provides
  // city + warehouse. This is where you validate the Nova Poshta data.
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const optionId = optionData.id as string

    if (optionId === "nova-poshta-warehouse") {
      // Customer must provide city and warehouse
      const cityRef = data.city_ref as string
      const cityName = data.city_name as string
      const warehouseDescription = data.warehouse_description as string

      if (!cityRef || !warehouseDescription) {
        throw new Error("City and warehouse are required for Nova Poshta delivery")
      }

      // Optionally verify the warehouse exists via API
      // const warehouses = await getWarehouses(cityRef)
      // const exists = warehouses.some(w => w.description === warehouseDescription)

      return {
        ...data,
        city_ref: cityRef,
        city_name: cityName,
        warehouse_description: warehouseDescription,
      }
    }

    if (optionId === "nova-poshta-courier") {
      const cityRef = data.city_ref as string
      const address = data.address as string

      if (!cityRef || !address) {
        throw new Error("City and address are required for courier delivery")
      }

      return {
        ...data,
        city_ref: cityRef,
        address: address,
      }
    }

    throw new Error(`Unknown fulfillment option: ${optionId}`)
  }

  // ─── 4. Calculate shipping price ───
  // Can return flat rate or call Nova Poshta pricing API.
  async calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<number> {
    // Option 1: Flat rate (simplest)
    const optionId = optionData.id as string
    if (optionId === "nova-poshta-warehouse") {
      return 7000  // 70.00 UAH in kopiyky (Medusa smallest unit)
    }
    if (optionId === "nova-poshta-courier") {
      return 12000  // 120.00 UAH
    }

    // Option 2: Call Nova Poshta API for dynamic pricing
    // Use calledMethod: "getDocumentPrice" on "InternetDocument" model
    // This requires sender/receiver city refs, weight, dimensions, etc.

    return 0
  }

  // ─── 5. Can calculate price? ───
  async canCalculate(data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  // ─── 6. Create fulfillment ───
  // Called when order is placed and fulfillment needs to be created.
  // Here you could create a Nova Poshta shipment (ТТН) via API.
  async createFulfillment(
    data: Record<string, unknown>,
    items: Record<string, unknown>[],
    order: Record<string, unknown> | undefined,
    fulfillment: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Basic: just return the delivery data (city, warehouse) for admin to see
    return {
      city_name: data.city_name,
      warehouse_description: data.warehouse_description,
      // Later: create actual Nova Poshta shipment here
      // and return tracking number (TTN)
    }

    // Advanced: Create Nova Poshta internet document (ТТН)
    // const ttn = await createNovaPoshtaShipment({
    //   senderCity: YOUR_SENDER_CITY_REF,
    //   recipientCity: data.city_ref,
    //   recipientWarehouse: data.warehouse_ref,
    //   weight: calculateTotalWeight(items),
    //   ...
    // })
    // return { tracking_number: ttn.IntDocNumber, ...data }
  }

  // ─── 7. Create return fulfillment ───
  async createReturnFulfillment(
    fulfillment: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return fulfillment.data as Record<string, unknown>
  }

  // ─── 8. Cancel fulfillment ───
  async cancelFulfillment(
    fulfillment: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // If you created a Nova Poshta shipment, cancel it here
    return {}
  }

  // ─── 9. Get fulfillment documents (labels, etc.) ───
  async getFulfillmentDocuments(
    data: Record<string, unknown>
  ): Promise<never[]> {
    return []
  }
}

export default NovaPoshtaFulfillmentService
```

---

### Part 2: Module Registration (`index.ts`)

```typescript
import NovaPoshtaFulfillmentService from "./service"
import { ModuleProvider, Modules } from "@medusajs/framework/utils"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [NovaPoshtaFulfillmentService],
})
```

---

### Part 3: Register in `medusa-config.ts`

```typescript
module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "./src/modules/nova-poshta-fulfillment",
            id: "nova-poshta",
            options: {
              // config options
            },
          },
        ],
      },
    },
  ],
})
```

---

### Part 4: City/Warehouse Autocomplete API Route

Medusa v2 custom API routes live in `src/api/`. Create a proxy route so the storefront can search cities and warehouses without exposing the Nova Poshta API key.

**`src/api/store/nova-poshta/route.ts`:**

```typescript
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { searchCities, getWarehouses } from "../../../modules/nova-poshta-fulfillment/lib/nova-poshta"

interface NpRequestBody {
  action: "searchCities" | "getWarehouses"
  query?: string
  cityRef?: string
  page?: number
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as NpRequestBody

  try {
    if (body.action === "searchCities") {
      const cities = await searchCities(body.query ?? "", 20)
      return res.json({ success: true, data: cities })
    }

    if (body.action === "getWarehouses") {
      if (!body.cityRef) {
        return res.status(400).json({ success: false, data: [], error: "cityRef is required" })
      }
      const warehouses = await getWarehouses(body.cityRef, body.query, 50, body.page ?? 1)
      return res.json({ success: true, data: warehouses })
    }

    return res.status(400).json({ success: false, data: [], error: "Unknown action" })
  } catch (error) {
    console.error("[NovaPoshta API]", error)
    return res.status(500).json({ success: false, data: [], error: "Internal error" })
  }
}
```

**API contract is identical to our Next.js version:**
```
POST /store/nova-poshta
{ "action": "searchCities", "query": "Ки" }

POST /store/nova-poshta
{ "action": "getWarehouses", "cityRef": "8d5a980d-..." }
```

---

### Part 5: Frontend Integration

The storefront city/warehouse combobox components work the same way — just change the API URL:

```typescript
// Instead of:
fetch("/api/nova-poshta", { method: "POST", body: ... })

// Use:
fetch("https://your-medusa-backend.com/store/nova-poshta", { method: "POST", body: ... })
```

During checkout, pass the selected city + warehouse data when creating the fulfillment:

```typescript
// When customer selects shipping option in Medusa checkout:
await medusa.carts.addShippingMethod(cartId, {
  option_id: "so_nova-poshta-warehouse",  // Shipping option created in admin
  data: {
    city_ref: selectedCity.ref,
    city_name: selectedCity.name,
    warehouse_description: selectedWarehouse.description,
  },
})
// This data is passed to your validateFulfillmentData() method
```

---

### Part 6: Medusa Admin Setup

After deploying the provider:

1. Go to Medusa Admin → Settings → Regions
2. Select your region (e.g., "Ukraine")
3. Add shipping options:
   - **Nova Poshta — Warehouse**: select `nova-poshta` provider, set price type (flat rate or calculated)
   - **Nova Poshta — Courier**: same provider, different option

---

### Key Differences from Our Next.js Implementation

| Aspect | Our Next.js | Medusa v2 |
|--------|-------------|-----------|
| Delivery data storage | Custom order fields (`deliveryCity`, `deliveryWarehouse`) | `fulfillment.data` object (structured by your provider) |
| Shipping options | Hardcoded in checkout form | Configured in Medusa Admin per region |
| Proxy route | `/api/nova-poshta` (Next.js API route) | `/store/nova-poshta` (Medusa custom route) |
| Price calculation | Not calculated (flat rate) | `calculatePrice()` method — can use NP pricing API |
| Shipment creation | Manual (admin sees order details) | `createFulfillment()` — can auto-create ТТН via NP API |
| Fulfillment tracking | Not implemented | Can return tracking data from `createFulfillment()` |

### Environment Variables (same)
```env
NOVAPOSHTA_API_KEY=your_api_key_here
```
