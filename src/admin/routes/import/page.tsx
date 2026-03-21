import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Container,
  Heading,
  Text,
  Badge,
  Button,
  Input,
  Label,
  Select,
  Textarea,
  Table,
  toast,
  Switch,
} from "@medusajs/ui"
import { ArrowUpTray } from "@medusajs/icons"
import { useState, useEffect, useCallback } from "react"
import { sdk } from "../../lib/client"

interface ImportProfile {
  id: string
  name: string
  slug: string
  format: string
  source_type: string
  source_url: string | null
  field_mapping: Record<string, string>
  category_mapping: Record<string, string>
  settings: Record<string, any>
  is_active: boolean
  last_sync_at: string | null
  created_at: string
}

interface ImportLog {
  id: string
  profile_id: string
  started_at: string
  finished_at: string | null
  status: string
  stats: Record<string, number>
  errors: Array<{ product: string; error: string }> | null
  triggered_by: string
}

const FORMAT_LABELS: Record<string, string> = {
  xml_yml: "XML (YML/Yandex Market)",
  csv: "CSV",
  json: "JSON",
}

const ImportPage = () => {
  const [profiles, setProfiles] = useState<ImportProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<ImportProfile | null>(null)
  const [logs, setLogs] = useState<ImportLog[]>([])
  const [importing, setImporting] = useState<string | null>(null)

  // Create form
  const [newName, setNewName] = useState("")
  const [newSlug, setNewSlug] = useState("")
  const [newFormat, setNewFormat] = useState("xml_yml")
  const [newUrl, setNewUrl] = useState("")
  const [newSettings, setNewSettings] = useState({
    update_prices: true,
    update_stock: true,
    update_descriptions: false,
    create_new_products: true,
    delete_missing: false,
  })

  const fetchProfiles = useCallback(async () => {
    try {
      const data = await sdk.client.fetch<{ profiles: ImportProfile[] }>(
        "/admin/import/profiles"
      )
      setProfiles(data.profiles)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  const loadProfile = async (profile: ImportProfile) => {
    setSelectedProfile(profile)
    try {
      const data = await sdk.client.fetch<{ profile: ImportProfile; logs: ImportLog[] }>(
        `/admin/import/profiles/${profile.id}`
      )
      setSelectedProfile(data.profile)
      setLogs(data.logs)
    } catch {
      toast.error("Помилка завантаження профілю")
    }
  }

  const createProfile = async () => {
    if (!newName || !newSlug) {
      toast.error("Заповніть назву та slug")
      return
    }
    try {
      await sdk.client.fetch("/admin/import/profiles", {
        method: "POST",
        body: {
          name: newName,
          slug: newSlug,
          format: newFormat,
          source_type: "url",
          source_url: newUrl || null,
          field_mapping: {},
          category_mapping: {},
          settings: newSettings,
        },
      })
      toast.success("Профіль створено")
      setShowCreate(false)
      setNewName("")
      setNewSlug("")
      setNewUrl("")
      fetchProfiles()
    } catch {
      toast.error("Помилка створення профілю")
    }
  }

  const runImport = async (profileId: string) => {
    setImporting(profileId)
    try {
      const data = await sdk.client.fetch<{
        stats: Record<string, number>
        errors: any[]
      }>(`/admin/import/profiles/${profileId}/run`, {
        method: "POST",
      })
      const stats = data.stats
      toast.success(
        `Імпорт завершено: ${stats.created} створено, ${stats.updated} оновлено, ${stats.skipped} пропущено`
      )
      fetchProfiles()
      if (selectedProfile?.id === profileId) {
        loadProfile(selectedProfile)
      }
    } catch (e: any) {
      toast.error("Помилка імпорту")
    } finally {
      setImporting(null)
    }
  }

  const deleteProfile = async (profileId: string) => {
    try {
      await sdk.client.fetch(`/admin/import/profiles/${profileId}`, {
        method: "DELETE",
      })
      toast.success("Профіль видалено")
      if (selectedProfile?.id === profileId) {
        setSelectedProfile(null)
      }
      fetchProfiles()
    } catch {
      toast.error("Помилка видалення")
    }
  }

  if (loading) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">Завантаження...</Text>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-4">
      {/* Header */}
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h1">Імпорт товарів</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle mt-1">
              Управління профілями імпорту та синхронізація товарів
            </Text>
          </div>
          <Button size="small" onClick={() => setShowCreate(!showCreate)}>
            + Додати профіль
          </Button>
        </div>
      </Container>

      {/* Create form */}
      {showCreate && (
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">Новий профіль імпорту</Heading>
          </div>
          <div className="px-6 py-4 flex flex-col gap-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Назва постачальника</Label>
                <Input
                  placeholder="AL-KO Ukraine"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  placeholder="alko-ua"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Формат</Label>
                <Select value={newFormat} onValueChange={setNewFormat}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="xml_yml">XML (YML/Yandex Market)</Select.Item>
                    <Select.Item value="csv">CSV</Select.Item>
                    <Select.Item value="json">JSON</Select.Item>
                  </Select.Content>
                </Select>
              </div>
              <div>
                <Label>URL фіда</Label>
                <Input
                  placeholder="https://example.com/feed.xml"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-y-2">
              <Text size="small" leading="compact" weight="plus">Налаштування</Text>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(newSettings).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-x-2">
                    <Switch
                      checked={value}
                      onCheckedChange={(checked) =>
                        setNewSettings((prev) => ({ ...prev, [key]: checked }))
                      }
                    />
                    <Text size="small" leading="compact">
                      {key === "update_prices" && "Оновлювати ціни"}
                      {key === "update_stock" && "Оновлювати залишки"}
                      {key === "update_descriptions" && "Оновлювати описи"}
                      {key === "create_new_products" && "Створювати нові товари"}
                      {key === "delete_missing" && "Видаляти відсутні"}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-x-2">
              <Button size="small" onClick={createProfile}>Створити</Button>
              <Button size="small" variant="secondary" onClick={() => setShowCreate(false)}>
                Скасувати
              </Button>
            </div>
          </div>
        </Container>
      )}

      {/* Profiles list */}
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Профілі імпорту</Heading>
        </div>
        {profiles.length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Немає профілів. Створіть перший профіль для початку імпорту.
            </Text>
          </div>
        ) : (
          <div className="px-6 py-4 flex flex-col gap-y-3">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="shadow-elevation-card-rest bg-ui-bg-component rounded-md px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-x-3">
                    <Badge color={profile.is_active ? "green" : "grey"} size="2xsmall">
                      {profile.is_active ? "Активний" : "Неактивний"}
                    </Badge>
                    <div>
                      <Text size="small" leading="compact" weight="plus">
                        {profile.name}
                      </Text>
                      <Text size="small" leading="compact" className="text-ui-fg-subtle">
                        {FORMAT_LABELS[profile.format] || profile.format}
                        {profile.last_sync_at && ` · Останній: ${new Date(profile.last_sync_at).toLocaleString("uk-UA")}`}
                      </Text>
                    </div>
                  </div>
                  <div className="flex gap-x-2">
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => loadProfile(profile)}
                    >
                      Деталі
                    </Button>
                    <Button
                      size="small"
                      onClick={() => runImport(profile.id)}
                      isLoading={importing === profile.id}
                      disabled={!profile.source_url}
                    >
                      Імпортувати
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      onClick={() => deleteProfile(profile.id)}
                    >
                      Видалити
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>

      {/* Profile details + logs */}
      {selectedProfile && (
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">Історія імпортів — {selectedProfile.name}</Heading>
          </div>
          <div className="px-6 py-4">
            {logs.length === 0 ? (
              <Text size="small" leading="compact" className="text-ui-fg-subtle">
                Ще не було жодного імпорту
              </Text>
            ) : (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Дата</Table.HeaderCell>
                    <Table.HeaderCell>Статус</Table.HeaderCell>
                    <Table.HeaderCell>Результат</Table.HeaderCell>
                    <Table.HeaderCell>Час</Table.HeaderCell>
                    <Table.HeaderCell>Запуск</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {logs.map((log) => {
                    const stats = log.stats || {}
                    return (
                      <Table.Row key={log.id}>
                        <Table.Cell>
                          <Text size="small" leading="compact">
                            {new Date(log.started_at).toLocaleString("uk-UA")}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            color={
                              log.status === "completed" ? "green" :
                              log.status === "failed" ? "red" :
                              log.status === "running" ? "blue" : "grey"
                            }
                            size="2xsmall"
                          >
                            {log.status === "completed" ? "Готово" :
                             log.status === "failed" ? "Помилка" :
                             log.status === "running" ? "Виконується" : log.status}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="small" leading="compact">
                            {stats.created ? `+${stats.created}` : ""}{" "}
                            {stats.updated ? `↻${stats.updated}` : ""}{" "}
                            {stats.skipped ? `⊘${stats.skipped}` : ""}{" "}
                            {stats.errors ? `✗${stats.errors}` : ""}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="small" leading="compact" className="text-ui-fg-subtle">
                            {stats.duration_ms ? `${(stats.duration_ms / 1000).toFixed(1)}с` : "—"}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="small" leading="compact" className="text-ui-fg-subtle">
                            {log.triggered_by === "manual" ? "Вручну" :
                             log.triggered_by === "schedule" ? "Авто" : log.triggered_by}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table>
            )}
          </div>
        </Container>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Імпорт",
  icon: ArrowUpTray,
})

export default ImportPage
