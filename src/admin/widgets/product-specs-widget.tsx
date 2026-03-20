import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Badge, Button, clx } from "@medusajs/ui"
import { PencilSquare } from "@medusajs/icons"
import { useEffect, useState } from "react"

type Attribute = {
  id: string
  slug: string
  label: string
  type: string
  unit: string | null
  is_filterable: boolean
  sort_order: number
}

type Spec = {
  id: string
  product_id: string
  text_value: string | null
  numeric_value: number | null
  attribute: Attribute
}

type EditState = {
  id: string
  text_value: string
  numeric_value: string
  label: string
  unit: string | null
}

const ProductSpecsWidget = ({ data }: any) => {
  const [specs, setSpecs] = useState<Spec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchSpecs = () => {
    setLoading(true)
    setError(null)
    fetch(`/admin/product-specs/products/${data.id}`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        setSpecs(d.specs || [])
      })
      .catch((e) => {
        console.error("[ProductSpecsWidget] fetch error:", e)
        setError("Не вдалося завантажити характеристики")
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchSpecs()
  }, [data.id])

  const startEdit = (spec: Spec) => {
    setEditingId(spec.id)
    setEditState({
      id: spec.id,
      text_value: spec.text_value || "",
      numeric_value: spec.numeric_value !== null ? String(spec.numeric_value) : "",
      label: spec.attribute.label,
      unit: spec.attribute.unit,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditState(null)
  }

  const saveEdit = async () => {
    if (!editState) return
    setSaving(true)
    try {
      const spec = specs.find((s) => s.id === editState.id)
      if (!spec) return

      const body: Record<string, any> = {}
      if (spec.attribute.type === "number") {
        body.numeric_value = editState.numeric_value ? parseFloat(editState.numeric_value) : null
        body.text_value = null
      } else {
        body.text_value = editState.text_value || null
        body.numeric_value = null
      }

      const res = await fetch(`/admin/product-specs/values/${editState.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      // Update local state
      setSpecs((prev) =>
        prev.map((s) => {
          if (s.id === editState.id) {
            return {
              ...s,
              text_value: body.text_value,
              numeric_value: body.numeric_value,
            }
          }
          return s
        })
      )
      setEditingId(null)
      setEditState(null)
    } catch (e: any) {
      console.error("[ProductSpecsWidget] save error:", e)
      alert(`Помилка збереження: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const getDisplayValue = (spec: Spec): string => {
    if (spec.attribute.type === "number" && spec.numeric_value !== null) {
      return `${spec.numeric_value}${spec.attribute.unit ? ` ${spec.attribute.unit}` : ""}`
    }
    if (spec.text_value) {
      return `${spec.text_value}${spec.attribute.unit ? ` ${spec.attribute.unit}` : ""}`
    }
    return "—"
  }

  return (
    <Container>
      <div className="flex items-center justify-between mb-4">
        <Heading level="h2">Характеристики</Heading>
        <Badge color={specs.length > 0 ? "green" : "grey"}>{specs.length}</Badge>
      </div>

      {loading && (
        <div className="text-ui-fg-subtle text-sm py-2">Завантаження...</div>
      )}

      {!loading && error && (
        <div className="text-ui-fg-error text-sm py-2">
          {error}
          <button
            className="ml-2 text-ui-fg-interactive underline"
            onClick={fetchSpecs}
          >
            Повторити
          </button>
        </div>
      )}

      {!loading && !error && specs.length === 0 && (
        <div className="text-ui-fg-muted text-sm py-2">Немає характеристик</div>
      )}

      {!loading && !error && specs.length > 0 && (
        <div className="divide-y divide-ui-border-base">
          {specs.map((spec, i) => (
            <div
              key={spec.id}
              className={clx(
                "py-2 text-sm",
                i % 2 !== 0 && "bg-ui-bg-subtle rounded-sm"
              )}
            >
              {editingId === spec.id && editState ? (
                <div className="flex flex-col gap-2 px-1">
                  <span className="font-medium text-ui-fg-base">
                    {spec.attribute.label}
                    {spec.attribute.unit ? (
                      <span className="text-ui-fg-subtle ml-1">
                        ({spec.attribute.unit})
                      </span>
                    ) : null}
                  </span>
                  <input
                    type={spec.attribute.type === "number" ? "number" : "text"}
                    value={
                      spec.attribute.type === "number"
                        ? editState.numeric_value
                        : editState.text_value
                    }
                    onChange={(e) => {
                      if (spec.attribute.type === "number") {
                        setEditState({ ...editState, numeric_value: e.target.value })
                      } else {
                        setEditState({ ...editState, text_value: e.target.value })
                      }
                    }}
                    className="border border-ui-border-base rounded-md px-2 py-1 text-sm text-ui-fg-base bg-ui-bg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive w-full"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      Скасувати
                    </Button>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={saveEdit}
                      isLoading={saving}
                    >
                      Зберегти
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between px-1 group">
                  <span className="text-ui-fg-subtle font-medium flex-1">
                    {spec.attribute.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-ui-fg-base">{getDisplayValue(spec)}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-ui-fg-muted hover:text-ui-fg-base p-0.5 rounded"
                      onClick={() => startEdit(spec)}
                      title="Редагувати"
                    >
                      <PencilSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductSpecsWidget
