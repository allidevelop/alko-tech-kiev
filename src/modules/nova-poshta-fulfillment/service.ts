import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import type { FulfillmentOption } from "@medusajs/framework/types"
// NP price calculation kept in lib for potential future use (API route)

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

      // Allow selecting shipping method without NP details yet
      // (city/warehouse will be validated at order creation)
      return {
        ...data,
        ...(cityRef && { city_ref: cityRef }),
        ...(cityName && { city_name: cityName }),
        ...(warehouseDescription && { warehouse_description: warehouseDescription }),
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
    _optionData: Record<string, unknown>,
    _data: Record<string, unknown>,
    _context: Record<string, unknown>
  ): Promise<{ calculated_amount: number; is_calculated_price_tax_inclusive: boolean }> {
    // Delivery cost is paid at Nova Poshta according to their tariffs.
    // We don't include shipping cost in the order total.
    return { calculated_amount: 0, is_calculated_price_tax_inclusive: true }
  }

  async canCalculate(data: any): Promise<boolean> {
    return true
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Record<string, unknown>[],
    order: Record<string, unknown> | undefined,
    fulfillment: Record<string, unknown>
  ) {
    return {
      data: {
        city_name: data.city_name,
        warehouse_description: data.warehouse_description,
        address: data.address,
      },
      labels: [],
    }
  }

  async createReturnFulfillment(
    fulfillment: Record<string, unknown>
  ) {
    return {
      data: (fulfillment.data as Record<string, unknown>) || {},
      labels: [],
    }
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
