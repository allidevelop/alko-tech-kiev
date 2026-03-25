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

const columnHelper = createDataTableColumnHelper<HttpTypes.AdminProduct>()

const columns = [
  columnHelper.select(),
  columnHelper.accessor("thumbnail", {
    header: "",
    cell: ({ getValue }) => {
      const src = getValue()
      return src ? (
        <img src={src} alt="" className="h-8 w-8 rounded-md object-cover" />
      ) : (
        <div className="h-8 w-8 rounded-md bg-ui-bg-subtle" />
      )
    },
    enableSorting: false,
  }),
  columnHelper.accessor("title", {
    header: "Назва",
    enableSorting: true,
  }),
  columnHelper.accessor("status", {
    header: "Статус",
    cell: ({ getValue }) => {
      const status = getValue()
      const color = status === "published" ? "green" : status === "draft" ? "grey" : "orange"
      const label = status === "published" ? "Опубліковано" : status === "draft" ? "Чернетка" : status
      return <Badge color={color} size="2xsmall">{label}</Badge>
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

const BulkProductsWidget = () => {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const prompt = usePrompt()

  const [rowSelection, setRowSelection] = useState<DataTableRowSelectionState>({})
  const [searchValue, setSearchValue] = useState("")
  const [pagination, setPagination] = useState<DataTablePaginationState>({ pageIndex: 0, pageSize: 20 })

  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit

  const { data, isLoading, refetch } = useQuery({
    queryFn: () => sdk.admin.product.list({ limit, offset, q: searchValue || undefined, fields: "id,title,thumbnail,status,created_at" }),
    queryKey: ["bulk-products", limit, offset, searchValue],
    enabled: open,
  })

  const invalidateAndReset = useCallback(() => {
    setRowSelection({})
    queryClient.invalidateQueries({ queryKey: ["bulk-products"] })
    queryClient.invalidateQueries({ queryKey: ["product"] })
    refetch()
  }, [queryClient, refetch])

  const commands = useMemo(() => [
    commandHelper.command({
      label: "Видалити",
      shortcut: "D",
      action: async (selection) => {
        const ids = Object.keys(selection)
        const confirmed = await prompt({
          title: `Видалити ${ids.length} товар(ів)?`,
          description: "Цю дію неможливо скасувати.",
          confirmText: "Видалити",
          cancelText: "Скасувати",
          variant: "danger",
        })
        if (!confirmed) return
        try {
          await Promise.all(ids.map((id) => sdk.admin.product.delete(id)))
          toast.success(`Видалено ${ids.length} товар(ів)`)
          invalidateAndReset()
        } catch { toast.error("Помилка при видаленні") }
      },
    }),
    commandHelper.command({
      label: "Опублікувати",
      shortcut: "P",
      action: async (selection) => {
        const ids = Object.keys(selection)
        try {
          await Promise.all(ids.map((id) => sdk.admin.product.update(id, { status: "published" as any })))
          toast.success(`Опубліковано ${ids.length} товар(ів)`)
          invalidateAndReset()
        } catch { toast.error("Помилка при публікації") }
      },
    }),
    commandHelper.command({
      label: "В чернетку",
      shortcut: "R",
      action: async (selection) => {
        const ids = Object.keys(selection)
        try {
          await Promise.all(ids.map((id) => sdk.admin.product.update(id, { status: "draft" as any })))
          toast.success(`${ids.length} товар(ів) в чернетку`)
          invalidateAndReset()
        } catch { toast.error("Помилка при зміні статусу") }
      },
    }),
  ], [prompt, invalidateAndReset])

  const table = useDataTable({
    data: data?.products || [],
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
        Масові дії: видалення, зміна статусу
      </Text>
      <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
        Масові операції
      </Button>

      <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Text size="small" leading="compact" weight="plus">
              Масові операції з товарами
            </Text>
          </FocusModal.Header>
          <FocusModal.Body className="p-4 overflow-auto">
            <DataTable instance={table}>
              <DataTable.Toolbar className="flex items-center justify-between">
                <DataTable.Search placeholder="Пошук товарів..." />
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
  zone: "product.list.before",
})

export default BulkProductsWidget
