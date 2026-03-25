import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  Container,
  Button,
  Text,
  Badge,
  FocusModal,
  DataTable,
  DataTablePaginationState,
  DataTableRowSelectionState,
  createDataTableColumnHelper,
  createDataTableCommandHelper,
  useDataTable,
  usePrompt,
  toast,
} from "@medusajs/ui"
import { HttpTypes } from "@medusajs/types"
import { useState, useMemo, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../lib/client"

type AdminOrder = HttpTypes.AdminOrder

const columnHelper = createDataTableColumnHelper<AdminOrder>()

const STATUS_MAP: Record<string, { label: string; color: "green" | "grey" | "orange" | "red" }> = {
  pending: { label: "Очікує", color: "orange" },
  completed: { label: "Виконано", color: "green" },
  canceled: { label: "Скасовано", color: "red" },
  archived: { label: "Архів", color: "grey" },
}

const columns = [
  columnHelper.select(),
  columnHelper.accessor("display_id", {
    header: "#",
    cell: ({ getValue }) => <Text size="small" leading="compact" weight="plus">#{getValue()}</Text>,
  }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: ({ getValue }) => <Text size="small" leading="compact">{getValue() || "—"}</Text>,
  }),
  columnHelper.accessor("status", {
    header: "Статус",
    cell: ({ getValue }) => {
      const s = getValue() || "pending"
      const info = STATUS_MAP[s] || { label: s, color: "grey" as const }
      return <Badge color={info.color} size="2xsmall">{info.label}</Badge>
    },
  }),
  columnHelper.accessor("created_at", {
    header: "Створено",
    cell: ({ getValue }) => {
      const d = getValue()
      return <Text size="small" leading="compact" className="text-ui-fg-subtle">{d ? new Date(d).toLocaleDateString("uk-UA") : "—"}</Text>
    },
  }),
]

const commandHelper = createDataTableCommandHelper()

const BulkOrdersWidget = () => {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const prompt = usePrompt()

  const [rowSelection, setRowSelection] = useState<DataTableRowSelectionState>({})
  const [searchValue, setSearchValue] = useState("")
  const [pagination, setPagination] = useState<DataTablePaginationState>({ pageIndex: 0, pageSize: 20 })

  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit

  const { data, isLoading, refetch } = useQuery({
    queryFn: () => sdk.admin.order.list({ limit, offset, q: searchValue || undefined }),
    queryKey: ["bulk-orders", limit, offset, searchValue],
    enabled: open,
  })

  const invalidateAndReset = useCallback(() => {
    setRowSelection({})
    queryClient.invalidateQueries({ queryKey: ["bulk-orders"] })
    queryClient.invalidateQueries({ queryKey: ["order"] })
    refetch()
  }, [queryClient, refetch])

  const commands = useMemo(() => [
    commandHelper.command({
      label: "Скасувати",
      shortcut: "C",
      action: async (selection) => {
        const ids = Object.keys(selection)
        const confirmed = await prompt({
          title: `Скасувати ${ids.length} замовлень?`,
          description: "Обрані замовлення будуть скасовані.",
          confirmText: "Скасувати замовлення",
          cancelText: "Ні",
          variant: "danger",
        })
        if (!confirmed) return
        try {
          await Promise.all(ids.map((id) => sdk.admin.order.cancel(id)))
          toast.success(`Скасовано ${ids.length} замовлень`)
          invalidateAndReset()
        } catch { toast.error("Помилка при скасуванні") }
      },
    }),
    commandHelper.command({
      label: "Завершити",
      shortcut: "O",
      action: async (selection) => {
        const ids = Object.keys(selection)
        try {
          await Promise.all(ids.map((id) => sdk.admin.order.complete(id)))
          toast.success(`Завершено ${ids.length} замовлень`)
          invalidateAndReset()
        } catch { toast.error("Помилка при завершенні") }
      },
    }),
  ], [prompt, invalidateAndReset])

  const table = useDataTable({
    data: data?.orders || [],
    columns,
    getRowId: (row) => row.id,
    rowCount: data?.count || 0,
    isLoading,
    commands,
    rowSelection: { state: rowSelection, onRowSelectionChange: setRowSelection },
    search: { state: searchValue, onSearchChange: setSearchValue },
    pagination: { state: pagination, onPaginationChange: setPagination },
  })

  return (
    <Container className="flex items-center justify-between px-6 py-3">
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        Масові дії: скасування, завершення
      </Text>
      <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
        Масові операції
      </Button>

      <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Text size="small" leading="compact" weight="plus">
              Масові операції із замовленнями
            </Text>
          </FocusModal.Header>
          <FocusModal.Body className="p-4 overflow-auto">
            <DataTable instance={table}>
              <DataTable.Toolbar className="flex items-center justify-between">
                <DataTable.Search placeholder="Пошук замовлень..." />
              </DataTable.Toolbar>
              <DataTable.Table />
              <DataTable.Pagination />
              <DataTable.CommandBar selectedLabel={(count) => `${count} обрано`} />
            </DataTable>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default BulkOrdersWidget
