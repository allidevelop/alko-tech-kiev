import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  Container,
  Heading,
  Badge,
  Button,
  Checkbox,
  Label,
  toast,
  Text,
} from "@medusajs/ui"
import { useState, useEffect, useCallback } from "react"
import { sdk } from "../lib/client"

interface RoleDefinition {
  name: string
  label: string
  description: string
}

const UserRolesWidget = ({ data }: { data: { id: string } }) => {
  const [roles, setRoles] = useState<string[]>([])
  const [availableRoles, setAvailableRoles] = useState<RoleDefinition[]>([])
  const [editing, setEditing] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchRoles = useCallback(async () => {
    try {
      // Fetch current user's roles to check if they're super_admin
      const meRes = await sdk.client.fetch<{
        is_super_admin: boolean
      }>("/admin/me/roles")
      setIsSuperAdmin(meRes.is_super_admin)

      // Fetch target user's roles
      const userRes = await sdk.client.fetch<{
        roles: string[]
        available_roles: RoleDefinition[]
      }>(`/admin/users/${data.id}/roles`)
      setRoles(userRes.roles)
      setSelectedRoles(userRes.roles)
      setAvailableRoles(userRes.available_roles)
    } catch (e) {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [data.id])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const handleSave = async () => {
    if (selectedRoles.length === 0) {
      toast.error("Оберіть хоча б одну роль")
      return
    }

    setSaving(true)
    try {
      await sdk.client.fetch(`/admin/users/${data.id}/roles`, {
        method: "POST",
        body: { roles: selectedRoles },
      })
      setRoles(selectedRoles)
      setEditing(false)
      toast.success("Ролі оновлено")
    } catch (e) {
      toast.error("Помилка при оновленні ролей")
    } finally {
      setSaving(false)
    }
  }

  const toggleRole = (roleName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName)
        ? prev.filter((r) => r !== roleName)
        : [...prev, roleName]
    )
  }

  const ROLE_COLORS: Record<string, "green" | "blue" | "orange" | "grey" | "purple"> = {
    super_admin: "green",
    content_manager: "blue",
    order_manager: "orange",
    viewer: "grey",
  }

  if (loading) return null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Ролі</Heading>
        {isSuperAdmin && !editing && (
          <Button size="small" variant="secondary" onClick={() => setEditing(true)}>
            Змінити
          </Button>
        )}
      </div>

      <div className="px-6 py-4">
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => {
              const roleDef = availableRoles.find((r) => r.name === role)
              return (
                <Badge key={role} color={ROLE_COLORS[role] || "grey"} size="small">
                  {roleDef?.label || role}
                </Badge>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-y-3">
            {availableRoles.map((role) => (
              <div key={role.name} className="flex items-start gap-x-3">
                <Checkbox
                  id={`role-${role.name}`}
                  checked={selectedRoles.includes(role.name)}
                  onCheckedChange={() => toggleRole(role.name)}
                />
                <div className="flex flex-col">
                  <Label htmlFor={`role-${role.name}`} className="cursor-pointer">
                    <Text size="small" leading="compact" weight="plus">
                      {role.label}
                    </Text>
                  </Label>
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    {role.description}
                  </Text>
                </div>
              </div>
            ))}

            <div className="flex gap-x-2 mt-2">
              <Button size="small" onClick={handleSave} isLoading={saving}>
                Зберегти
              </Button>
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  setSelectedRoles(roles)
                  setEditing(false)
                }}
              >
                Скасувати
              </Button>
            </div>
          </div>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "user.details.after",
})

export default UserRolesWidget
