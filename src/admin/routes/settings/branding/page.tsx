import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Palette } from "@medusajs/icons"
import {
  Container,
  Heading,
  Text,
  Input,
  Button,
  Label,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type BrandingMeta = {
  // Identity
  store_name: string
  logo_url: string
  favicon_url: string
  og_image_url: string
  // Colors
  primary_color: string
  secondary_color: string
  // Contact
  phone: string
  email: string
  address: string
  work_hours: string
  // Social
  viber: string
  telegram: string
  whatsapp: string
}

const DEFAULT_META: BrandingMeta = {
  store_name: "",
  logo_url: "",
  favicon_url: "",
  og_image_url: "",
  primary_color: "#1a4380",
  secondary_color: "#e8a117",
  phone: "",
  email: "",
  address: "",
  work_hours: "",
  viber: "",
  telegram: "",
  whatsapp: "",
}

// ─── Field component ──────────────────────────────────────────────────────────

type FieldProps = {
  label: string
  name: keyof BrandingMeta
  type?: string
  placeholder?: string
  hint?: string
  value: string
  onChange: (name: keyof BrandingMeta, value: string) => void
}

const Field = ({
  label,
  name,
  type = "text",
  placeholder,
  hint,
  value,
  onChange,
}: FieldProps) => (
  <div className="grid gap-1.5">
    <Label htmlFor={name} className="text-ui-fg-subtle font-medium">
      {label}
    </Label>
    <div className="flex items-center gap-2">
      {type === "color" ? (
        <>
          <input
            id={`${name}-picker`}
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(name, e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border border-ui-border-base bg-ui-bg-base p-1"
          />
          <Input
            id={name}
            type="text"
            value={value}
            onChange={(e) => onChange(name, e.target.value)}
            placeholder={placeholder ?? "#rrggbb"}
            className="flex-1"
          />
        </>
      ) : (
        <Input
          id={name}
          type={type}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          className="w-full"
        />
      )}
    </div>
    {hint && (
      <Text size="small" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
  </div>
)

// ─── Section component ────────────────────────────────────────────────────────

const Section = ({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) => (
  <Container className="p-6">
    <div className="mb-5">
      <Heading level="h2" className="text-ui-fg-base">
        {title}
      </Heading>
      {description && (
        <Text size="small" className="text-ui-fg-subtle mt-1">
          {description}
        </Text>
      )}
    </div>
    <div className="grid gap-4">{children}</div>
  </Container>
)

// ─── Main page ────────────────────────────────────────────────────────────────

const BrandingPage = () => {
  const [form, setForm] = useState<BrandingMeta>(DEFAULT_META)
  const [storeId, setStoreId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Load store data ──
  useEffect(() => {
    const fetchStore = async () => {
      try {
        const res = await fetch("/admin/stores", {
          credentials: "include",
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        // Medusa returns { stores: [...] } or { store: {...} }
        const store = Array.isArray(data.stores)
          ? data.stores[0]
          : data.store

        if (!store) throw new Error("Store not found")

        setStoreId(store.id)

        const meta = (store.metadata ?? {}) as Record<string, unknown>

        setForm({
          store_name:
            (meta.store_name as string) ?? store.name ?? "",
          logo_url: (meta.logo_url as string) ?? "",
          favicon_url: (meta.favicon_url as string) ?? "",
          og_image_url: (meta.og_image_url as string) ?? "",
          primary_color:
            (meta.primary_color as string) ?? DEFAULT_META.primary_color,
          secondary_color:
            (meta.secondary_color as string) ??
            DEFAULT_META.secondary_color,
          phone: (meta.phone as string) ?? "",
          email: (meta.email as string) ?? "",
          address: (meta.address as string) ?? "",
          work_hours: (meta.work_hours as string) ?? "",
          viber: (meta.viber as string) ?? "",
          telegram: (meta.telegram as string) ?? "",
          whatsapp: (meta.whatsapp as string) ?? "",
        })
      } catch (err) {
        console.error("[BrandingPage] fetchStore error:", err)
        toast.error("Помилка", {
          description: "Не вдалося завантажити дані магазину",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStore()
  }, [])

  const handleChange = (name: keyof BrandingMeta, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // ── Save ──
  const handleSave = async () => {
    if (!storeId) {
      toast.error("Помилка", { description: "ID магазину не знайдено" })
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/admin/stores/${storeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ metadata: form }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const msg =
          (errData as { message?: string }).message ?? `HTTP ${res.status}`
        throw new Error(msg)
      }

      toast.success("Збережено", {
        description: "Налаштування брендингу оновлено",
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Невідома помилка"
      console.error("[BrandingPage] save error:", err)
      toast.error("Помилка збереження", { description: message })
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="text-ui-fg-subtle text-sm">
          Завантаження налаштувань...
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Container className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <Heading level="h1">Брендинг</Heading>
            <Text className="text-ui-fg-subtle mt-1">
              Управління візуальним стилем і контактною інформацією магазину
            </Text>
          </div>
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={saving}
          >
            Зберегти
          </Button>
        </div>
      </Container>

      {/* Identity */}
      <Section
        title="Ідентифікація"
        description="Назва магазину і основні зображення"
      >
        <Field
          label="Назва магазину"
          name="store_name"
          placeholder="AL-KO Garden Store"
          value={form.store_name}
          onChange={handleChange}
        />
        <Field
          label="URL логотипу"
          name="logo_url"
          placeholder="https://example.com/logo.svg"
          hint="Рекомендований формат: SVG або PNG з прозорим фоном"
          value={form.logo_url}
          onChange={handleChange}
        />
        <Field
          label="URL favicon"
          name="favicon_url"
          placeholder="https://example.com/favicon.ico"
          hint="Формат ICO або PNG 32×32 пікселів"
          value={form.favicon_url}
          onChange={handleChange}
        />
        <Field
          label="URL OG-зображення"
          name="og_image_url"
          placeholder="https://example.com/og-image.jpg"
          hint="Зображення для соціальних мереж: 1200×630 пікселів"
          value={form.og_image_url}
          onChange={handleChange}
        />
      </Section>

      {/* Colors */}
      <Section
        title="Кольори бренду"
        description="Основна палітра для оформлення сайту"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Основний колір"
            name="primary_color"
            type="color"
            placeholder="#1a4380"
            hint="Кнопки, посилання, акцентні елементи"
            value={form.primary_color}
            onChange={handleChange}
          />
          <Field
            label="Вторинний колір"
            name="secondary_color"
            type="color"
            placeholder="#e8a117"
            hint="Допоміжні акценти, hover-стани"
            value={form.secondary_color}
            onChange={handleChange}
          />
        </div>
      </Section>

      {/* Contact */}
      <Section
        title="Контактна інформація"
        description="Дані для відображення на сайті та в листах"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Телефон"
            name="phone"
            type="tel"
            placeholder="+380 44 123 45 67"
            value={form.phone}
            onChange={handleChange}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            placeholder="info@alko-store.ua"
            value={form.email}
            onChange={handleChange}
          />
        </div>
        <Field
          label="Адреса"
          name="address"
          placeholder="м. Київ, вул. Прикладна, 10"
          value={form.address}
          onChange={handleChange}
        />
        <Field
          label="Години роботи"
          name="work_hours"
          placeholder="Пн–Пт: 9:00–18:00, Сб: 10:00–15:00"
          value={form.work_hours}
          onChange={handleChange}
        />
      </Section>

      {/* Social */}
      <Section
        title="Соціальні мережі та месенджери"
        description="Посилання або номери для зв'язку через месенджери"
      >
        <Field
          label="Viber"
          name="viber"
          placeholder="+380441234567 або viber://chat?number=..."
          value={form.viber}
          onChange={handleChange}
        />
        <Field
          label="Telegram"
          name="telegram"
          placeholder="@alko_store або https://t.me/alko_store"
          value={form.telegram}
          onChange={handleChange}
        />
        <Field
          label="WhatsApp"
          name="whatsapp"
          placeholder="+380441234567 або https://wa.me/380441234567"
          value={form.whatsapp}
          onChange={handleChange}
        />
      </Section>

      {/* Footer Save */}
      <Container className="p-6">
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={saving}
          >
            Зберегти зміни
          </Button>
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Брендинг",
  icon: Palette,
})

export default BrandingPage
