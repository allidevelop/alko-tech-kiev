import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Adjustments } from "@medusajs/icons"
import {
  Container,
  Heading,
  Button,
  Badge,
  Table,
  clx,
} from "@medusajs/ui"
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

type FormState = {
  slug: string
  label: string
  type: string
  unit: string
  is_filterable: boolean
  sort_order: string
}

const emptyForm = (): FormState => ({
  slug: "",
  label: "",
  type: "text",
  unit: "",
  is_filterable: true,
  sort_order: "0",
})

const ProductSpecsSettingsPage = () => {
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingAttr, setEditingAttr] = useState<Attribute | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchAttributes = () => {
    setLoading(true)
    setError(null)
    fetch("/admin/product-specs/attributes", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => setAttributes(d.attributes || []))
      .catch((e) => setError(`Помилка завантаження: ${e.message}`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAttributes()
  }, [])

  const openCreate = () => {
    setEditingAttr(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  const openEdit = (attr: Attribute) => {
    setEditingAttr(attr)
    setForm({
      slug: attr.slug,
      label: attr.label,
      type: attr.type,
      unit: attr.unit || "",
      is_filterable: attr.is_filterable,
      sort_order: String(attr.sort_order),
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingAttr(null)
    setForm(emptyForm())
  }

  const handleSave = async () => {
    if (!form.slug.trim() || !form.label.trim()) {
      alert("Заповніть поля slug та label")
      return
    }
    setSaving(true)
    try {
      const payload = {
        slug: form.slug.trim(),
        label: form.label.trim(),
        type: form.type,
        unit: form.unit.trim() || null,
        is_filterable: form.is_filterable,
        sort_order: parseInt(form.sort_order, 10) || 0,
      }

      let res: Response
      if (editingAttr) {
        res = await fetch(`/admin/product-specs/attributes/${editingAttr.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch("/admin/product-specs/attributes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }

      closeForm()
      fetchAttributes()
    } catch (e: any) {
      alert(`Помилка: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (attr: Attribute) => {
    if (!confirm(`Видалити атрибут "${attr.label}" (${attr.slug})?`)) return
    setDeletingId(attr.id)
    try {
      const res = await fetch(`/admin/product-specs/attributes/${attr.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      setAttributes((prev) => prev.filter((a) => a.id !== attr.id))
    } catch (e: any) {
      alert(`Помилка видалення: ${e.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">Атрибути характеристик</Heading>
          <p className="text-ui-fg-subtle text-sm mt-1">
            Управління атрибутами специфікацій товарів
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          + Додати атрибут
        </Button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <Container className="mb-6 p-4">
          <Heading level="h2" className="mb-4">
            {editingAttr ? `Редагувати: ${editingAttr.slug}` : "Новий атрибут"}
          </Heading>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-ui-fg-base block mb-1">
                Slug <span className="text-ui-fg-error">*</span>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                disabled={!!editingAttr}
                placeholder="engine_power"
                className={clx(
                  "w-full border border-ui-border-base rounded-md px-3 py-2 text-sm text-ui-fg-base bg-ui-bg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive",
                  editingAttr && "opacity-50 cursor-not-allowed"
                )}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ui-fg-base block mb-1">
                Назва (label) <span className="text-ui-fg-error">*</span>
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Потужність двигуна"
                className="w-full border border-ui-border-base rounded-md px-3 py-2 text-sm text-ui-fg-base bg-ui-bg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ui-fg-base block mb-1">
                Тип
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-ui-border-base rounded-md px-3 py-2 text-sm text-ui-fg-base bg-ui-bg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive"
              >
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ui-fg-base block mb-1">
                Одиниця виміру (unit)
              </label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="кВт, л, кг..."
                className="w-full border border-ui-border-base rounded-md px-3 py-2 text-sm text-ui-fg-base bg-ui-bg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ui-fg-base block mb-1">
                Порядок сортування
              </label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm({ ...form, sort_order: e.target.value })
                }
                className="w-full border border-ui-border-base rounded-md px-3 py-2 text-sm text-ui-fg-base bg-ui-bg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive"
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                id="is_filterable"
                checked={form.is_filterable}
                onChange={(e) =>
                  setForm({ ...form, is_filterable: e.target.checked })
                }
                className="w-4 h-4 accent-ui-fg-interactive"
              />
              <label
                htmlFor="is_filterable"
                className="text-sm font-medium text-ui-fg-base cursor-pointer"
              >
                Використовувати у фільтрах
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="secondary" onClick={closeForm} disabled={saving}>
              Скасувати
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              {editingAttr ? "Зберегти" : "Створити"}
            </Button>
          </div>
        </Container>
      )}

      {/* Table */}
      <Container>
        {loading && (
          <div className="text-ui-fg-subtle text-sm py-4 text-center">
            Завантаження...
          </div>
        )}
        {!loading && error && (
          <div className="text-ui-fg-error text-sm py-4 text-center">
            {error}
          </div>
        )}
        {!loading && !error && attributes.length === 0 && (
          <div className="text-ui-fg-muted text-sm py-8 text-center">
            Атрибути не знайдено. Натисніть «Додати атрибут», щоб створити перший.
          </div>
        )}
        {!loading && !error && attributes.length > 0 && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Slug</Table.HeaderCell>
                <Table.HeaderCell>Назва</Table.HeaderCell>
                <Table.HeaderCell>Тип</Table.HeaderCell>
                <Table.HeaderCell>Одиниця</Table.HeaderCell>
                <Table.HeaderCell>Сортування</Table.HeaderCell>
                <Table.HeaderCell>Фільтр</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {attributes.map((attr) => (
                <Table.Row key={attr.id}>
                  <Table.Cell>
                    <code className="text-xs bg-ui-bg-subtle px-1.5 py-0.5 rounded">
                      {attr.slug}
                    </code>
                  </Table.Cell>
                  <Table.Cell className="font-medium">{attr.label}</Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={
                        attr.type === "number"
                          ? "blue"
                          : attr.type === "boolean"
                          ? "orange"
                          : "grey"
                      }
                    >
                      {attr.type}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle">
                    {attr.unit || "—"}
                  </Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle">
                    {attr.sort_order}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={attr.is_filterable ? "green" : "grey"}>
                      {attr.is_filterable ? "Так" : "Ні"}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => openEdit(attr)}
                      >
                        Редагувати
                      </Button>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() => handleDelete(attr)}
                        isLoading={deletingId === attr.id}
                      >
                        Видалити
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
        {!loading && attributes.length > 0 && (
          <div className="flex justify-end mt-2 px-4 py-2 border-t border-ui-border-base">
            <span className="text-ui-fg-subtle text-sm">
              Всього: {attributes.length} атрибутів
            </span>
          </div>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Характеристики",
  icon: Adjustments,
})

export default ProductSpecsSettingsPage
