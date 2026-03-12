import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import type { FulfillmentOption } from "@medusajs/framework/types"

class NovaPoshtaFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "nova-poshta"

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "nova-poshta-warehouse",
        name: "Нова Пошта — Відділення",
      },
      {
        id: "nova-poshta-courier",
        name: "Нова Пошта — Кур'єр",
      },
    ]
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const optionId = optionData.id as string

    if (optionId === "nova-poshta-warehouse") {
      const cityRef = data.city_ref as string
      const cityName = data.city_name as string
      const warehouseDescription = data.warehouse_description as string

      if (!cityRef || !warehouseDescription) {
        throw new Error(
          "Місто та відділення обов'язкові для доставки Новою Поштою"
        )
      }

      return {
        ...data,
        city_ref: cityRef,
        city_name: cityName,
        warehouse_description: warehouseDescription,
      }
    }

    if (optionId === "nova-poshta-courier") {
      const cityRef = data.city_ref as string
      const cityName = data.city_name as string
      const address = data.address as string

      if (!cityRef || !address) {
        throw new Error(
          "Місто та адреса обов'язкові для кур'єрської доставки"
        )
      }

      return {
        ...data,
        city_ref: cityRef,
        city_name: cityName,
        address,
      }
    }

    throw new Error(`Невідомий варіант доставки: ${optionId}`)
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<number> {
    const optionId = optionData.id as string
    if (optionId === "nova-poshta-warehouse") {
      return 7000 // 70.00 UAH
    }
    if (optionId === "nova-poshta-courier") {
      return 12000 // 120.00 UAH
    }
    return 0
  }

  async canCalculate(data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Record<string, unknown>[],
    order: Record<string, unknown> | undefined,
    fulfillment: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return {
      city_name: data.city_name,
      warehouse_description: data.warehouse_description,
      address: data.address,
    }
  }

  async createReturnFulfillment(
    fulfillment: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return (fulfillment.data as Record<string, unknown>) || {}
  }

  async cancelFulfillment(
    fulfillment: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return {}
  }

  async getFulfillmentDocuments(
    data: Record<string, unknown>
  ): Promise<never[]> {
    return []
  }
}

export default NovaPoshtaFulfillmentService
