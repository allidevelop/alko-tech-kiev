import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Container,
  Heading,
  Text,
  Badge,
  Table,
  Button,
  Input,
  Label,
  Select,
  FocusModal,
  Checkbox,
  toast,
} from "@medusajs/ui"
import { ShieldCheck } from "@medusajs/icons"
import { useState, useEffect, useCallback } from "react"
import { sdk } from "../../../lib/client"

interface RoleDefinition {
  name: string
  label: string
  description: string
}

interface UserWithRoles {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  metadata: Record<string, unknown> | null
}

const ROLE_COLORS: Record<string, "green" | "blue" | "orange" | "grey" | "purple"> = {
  super_admin: "green",
  content_manager: "blue",
  order_manager: "orange",
  viewer: "grey",
}

const PERMISSION_MATRIX = [
  { resource: "Товари (CRUD)", super_admin: "✅", content_manager: "✅", order_manager: "👁", viewer: "👁" },
  { resource: "Категорії (CRUD)", super_admin: "✅", content_manager: "✅", order_manager: "👁", viewer: "👁" },
  { resource: "Характеристики", super_admin: "✅", content_manager: "✅", order_manager: "👁", viewer: "👁" },
  { resource: "Медіа / Завантаження", super_admin: "✅", content_manager: "✅", order_manager: "❌", viewer: "👁" },
  { resource: "Замовлення", super_admin: "✅", content_manager: "👁", order_manager: "✅", viewer: "👁" },
  { resource: "Клієнти", super_admin: "✅", content_manager: "❌", order_manager: "✅", viewer: "👁" },
  { resource: "Платежі", super_admin: "✅", content_manager: "❌", order_manager: "✅", viewer: "👁" },
  { resource: "Доставка", super_admin: "✅", content_manager: "❌", order_manager: "✅", viewer: "👁" },
  { resource: "Настройки магазину", super_admin: "✅", content_manager: "❌", order_manager: "❌", viewer: "❌" },
  { resource: "Брендинг", super_admin: "✅", content_manager: "✅", order_manager: "❌", viewer: "❌" },
  { resource: "Ціноутворення", super_admin: "✅", content_manager: "❌", order_manager: "❌", viewer: "👁" },
  { resource: "Користувачі", super_admin: "✅", content_manager: "❌", order_manager: "❌", viewer: "❌" },
  { resource: "API ключі", super_admin: "✅", content_manager: "❌", order_manager: "❌", viewer: "❌" },
]

const RolesSettingsPage = () => {
  const [roles, setRoles] = useState<RoleDefinition[]>([])
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [loading, setLoading] = useState(true)

  // Create user modal
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newFirstName, setNewFirstName] = useState("")
  const [newLastName, setNewLastName] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("viewer")
  const [creating, setCreating] = useState(false)

  // Edit role modal
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null)
  const [editRoles, setEditRoles] = useState<string[]>([])
  const [savingRoles, setSavingRoles] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [meRes, usersRes] = await Promise.all([
        sdk.client.fetch<{ available_roles: RoleDefinition[] }>("/admin/me/roles"),
        sdk.admin.user.list({ limit: 100 }),
      ])
      setRoles(meRes.available_roles)
      setUsers((usersRes as any).users || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getUserRoles = (user: UserWithRoles): string[] => {
    const meta = user.metadata
    if (!meta?.roles || !Array.isArray(meta.roles)) return ["super_admin"]
    return meta.roles as string[]
  }

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword) {
      toast.error("Заповніть email та пароль")
      return
    }
    setCreating(true)
    try {
      // 1. Create auth identity
      const authRes = await sdk.client.fetch<{ token: string }>("/auth/user/emailpass/register", {
        method: "POST",
        body: { email: newEmail, password: newPassword },
      })

      // 2. Create user with role in metadata
      await sdk.client.fetch("/admin/users", {
        method: "POST",
        headers: authRes.token ? { Authorization: `Bearer ${authRes.token}` } : undefined,
        body: {
          email: newEmail,
          first_name: newFirstName || undefined,
          last_name: newLastName || undefined,
          metadata: { roles: [newRole] },
        },
      })

      toast.success(`Користувач ${newEmail} створений`)
      setShowCreateUser(false)
      setNewEmail("")
      setNewFirstName("")
      setNewLastName("")
      setNewPassword("")
      setNewRole("viewer")
      fetchData()
    } catch (e: any) {
      toast.error(e?.message || "Помилка створення користувача")
    } finally {
      setCreating(false)
    }
  }

  const openEditRoles = (user: UserWithRoles) => {
    setEditingUser(user)
    setEditRoles(getUserRoles(user))
  }

  const toggleEditRole = (roleName: string) => {
    setEditRoles((prev) =>
      prev.includes(roleName)
        ? prev.filter((r) => r !== roleName)
        : [...prev, roleName]
    )
  }

  const handleSaveRoles = async () => {
    if (!editingUser || editRoles.length === 0) {
      toast.error("Оберіть хоча б одну роль")
      return
    }
    setSavingRoles(true)
    try {
      await sdk.client.fetch(`/admin/users/${editingUser.id}/roles`, {
        method: "POST",
        body: { roles: editRoles },
      })
      toast.success("Ролі оновлено")
      setEditingUser(null)
      fetchData()
    } catch {
      toast.error("Помилка оновлення ролей")
    } finally {
      setSavingRoles(false)
    }
  }

  if (loading) {
    return (
      <Container className="flex items-center justify-center p-8">
        <Text size="small" leading="compact" className="text-ui-fg-subtle">Завантаження...</Text>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-4">
      {/* Roles overview */}
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Ролі та доступ</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle mt-1">
            Управління ролями користувачів та правами доступу
          </Text>
        </div>
        <div className="px-6 py-4">
          <div className="flex flex-col gap-y-4">
            {roles.map((role) => {
              const roleUsers = users.filter((u) => getUserRoles(u).includes(role.name))
              return (
                <div key={role.name} className="flex items-start gap-x-4">
                  <Badge color={ROLE_COLORS[role.name] || "purple"} size="small">
                    {role.label}
                  </Badge>
                  <div className="flex flex-col gap-y-1">
                    <Text size="small" leading="compact" className="text-ui-fg-subtle">
                      {role.description}
                    </Text>
                    {roleUsers.length > 0 ? (
                      <Text size="small" leading="compact">
                        {roleUsers.map((u) => u.email).join(", ")}
                      </Text>
                    ) : (
                      <Text size="small" leading="compact" className="text-ui-fg-muted">
                        Немає користувачів
                      </Text>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Container>

      {/* Permission matrix */}
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Матриця доступу</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle mt-1">
            ✅ повний доступ · 👁 тільки перегляд · ❌ немає доступу
          </Text>
        </div>
        <div className="px-6 py-4 overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Ресурс</Table.HeaderCell>
                <Table.HeaderCell><Badge color="green" size="2xsmall">Супер-адмін</Badge></Table.HeaderCell>
                <Table.HeaderCell><Badge color="blue" size="2xsmall">Контент</Badge></Table.HeaderCell>
                <Table.HeaderCell><Badge color="orange" size="2xsmall">Замовлення</Badge></Table.HeaderCell>
                <Table.HeaderCell><Badge color="grey" size="2xsmall">Перегляд</Badge></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {PERMISSION_MATRIX.map((row) => (
                <Table.Row key={row.resource}>
                  <Table.Cell><Text size="small" leading="compact" weight="plus">{row.resource}</Text></Table.Cell>
                  <Table.Cell>{row.super_admin}</Table.Cell>
                  <Table.Cell>{row.content_manager}</Table.Cell>
                  <Table.Cell>{row.order_manager}</Table.Cell>
                  <Table.Cell>{row.viewer}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </Container>

      {/* Users management */}
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">Користувачі</Heading>
          <Button size="small" onClick={() => setShowCreateUser(true)}>
            + Створити користувача
          </Button>
        </div>
        <div className="px-6 py-4">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Ім'я</Table.HeaderCell>
                <Table.HeaderCell>Ролі</Table.HeaderCell>
                <Table.HeaderCell>Дії</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {users.map((user) => {
                const userRoles = getUserRoles(user)
                return (
                  <Table.Row key={user.id}>
                    <Table.Cell><Text size="small" leading="compact">{user.email}</Text></Table.Cell>
                    <Table.Cell>
                      <Text size="small" leading="compact">
                        {[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-x-1">
                        {userRoles.map((role) => {
                          const roleDef = roles.find((r) => r.name === role)
                          return (
                            <Badge key={role} color={ROLE_COLORS[role] || "purple"} size="2xsmall">
                              {roleDef?.label || role}
                            </Badge>
                          )
                        })}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Button size="small" variant="secondary" onClick={() => openEditRoles(user)}>
                        Змінити роль
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        </div>
      </Container>

      {/* Create user modal */}
      <FocusModal open={showCreateUser} onOpenChange={setShowCreateUser}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Text size="small" leading="compact" weight="plus">Створити користувача</Text>
          </FocusModal.Header>
          <FocusModal.Body className="flex items-start justify-center p-6">
            <div className="w-full max-w-md flex flex-col gap-y-4">
              <div>
                <Label>Email *</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" />
              </div>
              <div>
                <Label>Пароль *</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Мінімум 8 символів" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Ім'я</Label>
                  <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
                </div>
                <div>
                  <Label>Прізвище</Label>
                  <Input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Роль</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {roles.map((r) => (
                      <Select.Item key={r.name} value={r.name}>{r.label}</Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
            </div>
          </FocusModal.Body>
          <FocusModal.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button size="small" variant="secondary">Скасувати</Button>
              </FocusModal.Close>
              <Button size="small" onClick={handleCreateUser} isLoading={creating}>Створити</Button>
            </div>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>

      {/* Edit roles modal */}
      <FocusModal open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Text size="small" leading="compact" weight="plus">
              Змінити ролі — {editingUser?.email}
            </Text>
          </FocusModal.Header>
          <FocusModal.Body className="flex items-start justify-center p-6">
            <div className="w-full max-w-md flex flex-col gap-y-3">
              {roles.map((role) => (
                <div key={role.name} className="flex items-start gap-x-3">
                  <Checkbox
                    id={`edit-role-${role.name}`}
                    checked={editRoles.includes(role.name)}
                    onCheckedChange={() => toggleEditRole(role.name)}
                  />
                  <div className="flex flex-col">
                    <Label htmlFor={`edit-role-${role.name}`} className="cursor-pointer">
                      <Text size="small" leading="compact" weight="plus">{role.label}</Text>
                    </Label>
                    <Text size="small" leading="compact" className="text-ui-fg-subtle">{role.description}</Text>
                  </div>
                </div>
              ))}
            </div>
          </FocusModal.Body>
          <FocusModal.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Button size="small" variant="secondary" onClick={() => setEditingUser(null)}>Скасувати</Button>
              <Button size="small" onClick={handleSaveRoles} isLoading={savingRoles}>Зберегти</Button>
            </div>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Ролі",
  icon: ShieldCheck,
})

export default RolesSettingsPage
