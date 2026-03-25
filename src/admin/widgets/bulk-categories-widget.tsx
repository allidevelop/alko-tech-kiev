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

type AdminCategory = HttpTypes.AdminProductCategory

const columnHelper = createDataTableColumnHelper<AdminCategory>()

const columns = [
  columnHelper.select(),
  columnHelper.accessor("name", {
    header: "Назва",
    cell: ({ getValue }) => <Text size="small" leading="compact" weight="plus">{getValue()}</Text>,
  }),
  columnHelper.accessor("handle", {
    header: "Handle",
    cell: ({ getValue }) => <Text size="small" leading="compact" className="text-ui-fg-subtle">{getValue()}</Text>,
  }),
  columnHelper.accessor("is_active", {
    header: "Статус",
    cell: ({ getValue }) => {
      const active = getValue()
      return <Badge color={active ? "green" : "grey"} size="2xsmall">{active ? "Активна" : "Неактивна"}</Badge>
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

const BulkCategoriesWidget = () => {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const prompt = usePrompt()

  const [rowSelection, setRowSelection] = useState<DataTableRowSelectionState>({})
  const [searchValue, setSearchValue] = useState("")
  const [pagination, setPagination] = useState<DataTablePaginationState>({ pageIndex: 0, pageSize: 20 })

  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit

  const { data, isLoading, refetch } = useQuery({
    queryFn: () => sdk.admin.productCategory.list({
      limit, offset, q: searchValue || undefined,
      fields: "id,name,handle,is_active,created_at",
    }),
    queryKey: ["bulk-categories", limit, offset, searchValue],
    enabled: open,
  })

  const invalidateAndReset = useCallback(() => {
    setRowSelection({})
    queryClient.invalidateQueries({ queryKey: ["bulk-categories"] })
    queryClient.invalidateQueries({ queryKey: ["product_categories"] })
    refetch()
  }, [queryClient, refetch])

  const commands = useMemo(() => [
    commandHelper.command({
      label: "Видалити",
      shortcut: "D",
      action: async (selection) => {
        const ids = Object.keys(selection)
        const confirmed = await prompt({
          title: `Видалити ${ids.length} категорій?`,
          description: "Категорії будуть видалені. Товари залишаться.",
          confirmText: "Видалити",
          cancelText: "Скасувати",
          variant: "danger",
        })
        if (!confirmed) return
        try {
          await Promise.all(ids.map((id) => sdk.admin.productCategory.delete(id)))
          toast.success(`Видалено ${ids.length} категорій`)
          invalidateAndReset()
        } catch { toast.error("Помилка при видаленні") }
      },
    }),
    commandHelper.command({
      label: "Активувати",
      shortcut: "A",
      action: async (selection) => {
        const ids = Object.keys(selection)
        try {
          await Promise.all(ids.map((id) => sdk.admin.productCategory.update(id, { is_active: true })))
          toast.success(`Активовано ${ids.length} категорій`)
          invalidateAndReset()
        } catch { toast.error("Помилка при активації") }
      },
    }),
    commandHelper.command({
      label: "Деактивувати",
      shortcut: "I",
      action: async (selection) => {
        const ids = Object.keys(selection)
        try {
          await Promise.all(ids.map((id) => sdk.admin.productCategory.update(id, { is_active: false })))
          toast.success(`Деактивовано ${ids.length} категорій`)
          invalidateAndReset()
        } catch { toast.error("Помилка при деактивації") }
      },
    }),
  ], [prompt, invalidateAndReset])

  const table = useDataTable({
    data: data?.product_categories || [],
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
        Масові дії: видалення, активація, деактивація
      </Text>
      <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
        Масові операції
      </Button>

      <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Text size="small" leading="compact" weight="plus">
              Масові операції з категоріями
            </Text>
          </FocusModal.Header>
          <FocusModal.Body className="p-4 overflow-auto">
            <DataTable instance={table}>
              <DataTable.Toolbar className="flex items-center justify-between">
                <DataTable.Search placeholder="Пошук категорій..." />
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
  zone: "product_category.list.before",
})

export default BulkCategoriesWidget
