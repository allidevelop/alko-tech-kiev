import {
  CreateInventoryLevelInput,
  ExecArgs,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  deleteProductsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { XMLParser } from "fast-xml-parser";
import { ApiKey } from "../../.medusa/types/query-entry-points";

const XML_URL = "https://apipim.al-ko.ua/storage/xml_files/PriceList.xml";
const BATCH_SIZE = 20;

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies-alko",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map((c) => ({
          currency_code: c.currency_code,
          is_default: c.is_default ?? false,
        })),
      },
    }));
    const stores = updateStoresStep(normalizedInput);
    return new WorkflowResponse(stores);
  }
);

interface XmlOffer {
  "@_id": string;
  "@_available": string;
  stock_quantity: number;
  price: number;
  currencyId: string;
  categoryId: number;
  picture: string;
  url: string;
  vendor: string;
  article: string;
  name_ua: string;
  description_ua: string;
  param: { "@_name": string; "#text": string }[] | { "@_name": string; "#text": string };
}

interface XmlCategory {
  "@_id": string;
  "#text": string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ґ]/g, "g")
    .replace(/[є]/g, "ye")
    .replace(/[і]/g, "i")
    .replace(/[ї]/g, "yi")
    .replace(/[а]/g, "a")
    .replace(/[б]/g, "b")
    .replace(/[в]/g, "v")
    .replace(/[г]/g, "h")
    .replace(/[д]/g, "d")
    .replace(/[е]/g, "e")
    .replace(/[ж]/g, "zh")
    .replace(/[з]/g, "z")
    .replace(/[и]/g, "y")
    .replace(/[й]/g, "y")
    .replace(/[к]/g, "k")
    .replace(/[л]/g, "l")
    .replace(/[м]/g, "m")
    .replace(/[н]/g, "n")
    .replace(/[о]/g, "o")
    .replace(/[п]/g, "p")
    .replace(/[р]/g, "r")
    .replace(/[с]/g, "s")
    .replace(/[т]/g, "t")
    .replace(/[у]/g, "u")
    .replace(/[ф]/g, "f")
    .replace(/[х]/g, "kh")
    .replace(/[ц]/g, "ts")
    .replace(/[ч]/g, "ch")
    .replace(/[ш]/g, "sh")
    .replace(/[щ]/g, "shch")
    .replace(/[ь]/g, "")
    .replace(/[ю]/g, "yu")
    .replace(/[я]/g, "ya")
    .replace(/['ʼ"]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100);
}

/**
 * Make article/SKU safe: remove special chars, keep only alphanumeric and hyphens
 */
function sanitizeArticle(article: string): string {
  if (!article) return "";
  return article
    .replace(/[^a-zA-Z0-9-]/g, "")
    .substring(0, 50);
}

/**
 * Parse Ukrainian decimal format (comma separator) to number.
 * "18,30" → 18.3, "0,6" → 0.6
 */
function parseUaDecimal(value: string): number | null {
  if (!value) return null;
  const normalized = String(value).replace(",", ".").trim();
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

/**
 * Parse semicolon-separated URLs from XML param values.
 * Format: "url1"; "url2"; "url3" or url1; url2
 */
function parseSemicolonUrls(value: string): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((u) => u.trim().replace(/^["']|["']$/g, "").trim())
    .filter((u) => u.startsWith("http"));
}

/**
 * Map of XML param names → spec_* keys for filterable metadata.
 * Only the most useful params for filtering are included.
 */
const SPEC_KEY_MAP: Record<string, string> = {
  "Виробник": "spec_brand",
  "Серія": "spec_series",
  "Тип": "spec_type",
  "Вид": "spec_kind",
  "Тип двигуна": "spec_engine_type",
  "Двигун": "spec_engine",
  "Потужність двигуна, к.с.": "spec_power_hp",
  "Напруга, В": "spec_voltage",
  "Ширина захвату": "spec_cutting_width",
  "Рекомендована площа": "spec_recommended_area",
  "Рівень шуму, дБ": "spec_noise_db",
  "Призначення": "spec_purpose",
  "Модель": "spec_model",
  "Особливості": "spec_features",
  "Гарантійні умови": "spec_warranty_terms",
  "Країна реєстрації бренду": "spec_brand_country",
  "Країна-виробник товару": "spec_made_in",
  "Кількість в упаковці, шт": "spec_pack_qty",
  "Кількість вантажних місць": "spec_cargo_places",
  "Код УКТ ЗЕД": "spec_ukt_zed",
  "Ставка ПДВ": "spec_vat_rate",
  "Матеріал": "spec_material",
  "Об'єм двигуна, куб. см": "spec_engine_cc",
  "Об'єм бака, л": "spec_tank_volume",
  "Висота скошування": "spec_cutting_height",
  "Травозбірник": "spec_grass_catcher",
  "Діаметр різання": "spec_cut_diameter",
  "Тип акумулятора": "spec_battery_type",
  "Ємність акумулятора, Аг": "spec_battery_ah",
  "Максимальний тиск, бар": "spec_max_pressure",
  "Тип запчастини": "spec_parts_type",
  "Матеріал корпусу": "spec_body_material",
  "Діаметр покришки, дюйм": "spec_tire_diameter",
  "Тип авто": "spec_vehicle_type",
  "Вага в упаковці": "spec_package_weight",
  "Гарантія": "spec_warranty",
  "Клас": "spec_class",
  "Колір": "spec_color",
  "Конструкція": "spec_construction",
  "Живлення": "spec_power_source",
  "Джерело живлення": "spec_power_source_type",
  "Система запуску": "spec_start_system",
  "Тип палива": "spec_fuel_type",
  "Вид палива": "spec_fuel_kind",
  "Привідний вал": "spec_drive_shaft",
  "Тип переміщення": "spec_movement_type",
  "Продуктивність": "spec_productivity",
  "Робоча ширина": "spec_working_width",
  "Робоча глибина": "spec_working_depth",
  "Комплектація": "spec_equipment",
  "Комплект поставки": "spec_delivery_set",
  "Потужність двигуна, Вт": "spec_power_watts",
  "Потужність двигуна, кВт": "spec_power_kw",
  "Напруга акумулятора, В": "spec_battery_voltage",
  "Тип акумулятора": "spec_battery_type",
  "Акумулятор в комплекті": "spec_battery_included",
  "Довжина шини, мм": "spec_bar_length",
  "Крок ланцюга, дюйм": "spec_chain_pitch",
  "Об'єм двигуна, см³": "spec_engine_displacement",
  "Об'єм паливного баку": "spec_fuel_tank",
  "Сумісність": "spec_compatibility",
  "Застосування": "spec_application",
  "Система захисту": "spec_protection",
  "Глибина занурення": "spec_immersion_depth",
  "Висота подачі": "spec_delivery_height",
  "Діаметр колес": "spec_wheel_diameter",
  "Травозбірник": "spec_grass_collector",
  "Ріжуча система": "spec_cutting_system",
  "Швидкість потоку повітря": "spec_air_speed",
  "Ширина захвату снігу": "spec_snow_width",
  "Висота захвату снігу": "spec_snow_height",
  "Дальність викиду снігу": "spec_snow_throw",
  // Added: params present in XML but missing from map
  "Тип запуску": "spec_start_type",
  "Висота зрізу": "spec_cutting_height",
  "Кількість рівнів висоти зрізу": "spec_cutting_levels",
  "Потужність, к.с.": "spec_power_hp",
  "Потужність, кВт": "spec_power_kw",
  "Об'єм травозбірника, л": "spec_grass_catcher_volume",
  "Об'єм двигуна": "spec_engine_volume",
  "Об'єм баку": "spec_tank_volume",
  "Діаметр": "spec_diameter",
  "Діаметр вихідного отвору": "spec_outlet_diameter",
  "Діаметр вхідного отвору": "spec_inlet_diameter",
  "Сумісна модель": "spec_compatible_model",
  "Сумісний бренд": "spec_compatible_brand",
  "Тип установки": "spec_installation_type",
  "Довжина": "spec_length",
  "Розміщення двигуна в пилі": "spec_engine_position",
  "Об'єм циліндру": "spec_cylinder_volume",
  "Робочий тиск": "spec_working_pressure",
  "Потужність": "spec_power",
  "Максимальний розмір частинок": "spec_max_particle_size",
  "Довжина кабелю, м": "spec_cable_length",
  "Кількість ланок ланцюга, шт": "spec_chain_links",
  "Макс. число обертів, об/хв": "spec_max_rpm",
  "Тиск": "spec_pressure",
  "Розміри": "spec_dimensions",
};

/**
 * Params that hold URLs, not spec values — exclude from raw metadata.
 */
const URL_PARAM_NAMES = new Set([
  "Посилання на life style фото",
  "Посилання на відео",
  "Посилання на  фото",  // double space in XML
  "Посилання на фото",
]);

interface ExtractedProductData {
  /** Raw params as metadata (all params except URLs) */
  rawMetadata: Record<string, string>;
  /** Structured spec_* metadata for filtering */
  specMetadata: Record<string, string>;
  /** Weight in grams (Medusa uses grams) */
  weight: number | null;
  /** Package length in mm */
  length: number | null;
  /** Package width in mm */
  width: number | null;
  /** Package height in mm */
  height: number | null;
  /** EAN barcode */
  barcode: string | null;
  /** Brand name */
  brand: string;
  /** Product series */
  series: string;
  /** Warranty text */
  warranty: string;
  /** Lifestyle photo URLs */
  lifestylePhotos: string[];
  /** Additional photo URLs */
  extraPhotos: string[];
  /** Video URLs (YouTube) */
  videoUrls: string[];
}

function extractProductData(
  params: XmlOffer["param"],
  vendor: string
): ExtractedProductData {
  const rawMetadata: Record<string, string> = {};
  const specMetadata: Record<string, string> = {};
  let weight: number | null = null;
  let length: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let barcode: string | null = null;
  let brand = vendor || "AL-KO";
  let series = "";
  let warranty = "";
  let lifestylePhotos: string[] = [];
  let extraPhotos: string[] = [];
  let videoUrls: string[] = [];

  const paramArray = Array.isArray(params) ? params : params ? [params] : [];

  for (const p of paramArray) {
    const name = p["@_name"];
    const value = p["#text"] != null ? String(p["#text"]) : "";
    if (!name) continue;

    // Extract URLs
    if (name === "Посилання на life style фото") {
      lifestylePhotos = parseSemicolonUrls(value);
      continue;
    }
    if (name === "Посилання на відео") {
      videoUrls = parseSemicolonUrls(value);
      continue;
    }
    if (name === "Посилання на  фото" || name === "Посилання на фото") {
      extraPhotos = parseSemicolonUrls(value);
      continue;
    }

    // Extract physical properties
    if (name === "Вага, кг") {
      const kg = parseUaDecimal(value);
      if (kg !== null) weight = Math.round(kg * 1000); // kg → grams
    }
    if (name === "Довжина упаковки, см") {
      const cm = parseUaDecimal(value);
      if (cm !== null) length = Math.round(cm * 10); // cm → mm
    }
    if (name === "Ширина упаковки, см") {
      const cm = parseUaDecimal(value);
      if (cm !== null) width = Math.round(cm * 10);
    }
    if (name === "Висота упаковки, см") {
      const cm = parseUaDecimal(value);
      if (cm !== null) height = Math.round(cm * 10);
    }
    if (name === "Штрихкод") {
      barcode = value.trim();
    }
    if (name === "Виробник") {
      brand = value.trim();
    }
    if (name === "Серія") {
      series = value.trim();
    }
    if (name === "Гарантія") {
      warranty = value.trim();
    }

    // Add to spec metadata if in map
    if (SPEC_KEY_MAP[name]) {
      specMetadata[SPEC_KEY_MAP[name]] = value;
    }

    // Add all non-URL params to raw metadata
    if (!URL_PARAM_NAMES.has(name)) {
      rawMetadata[name] = value;
    }
  }

  return {
    rawMetadata,
    specMetadata,
    weight,
    length,
    width,
    height,
    barcode,
    brand,
    series,
    warranty,
    lifestylePhotos,
    extraPhotos,
    videoUrls,
  };
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchXml(): Promise<string> {
  const response = await fetch(XML_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch XML: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export default async function importAlko({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);
  const productModuleService = container.resolve(Modules.PRODUCT);
  const regionModuleService = container.resolve(Modules.REGION);
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION);

  // =========================================================================
  // 1. Fetch and parse XML
  // =========================================================================
  logger.info("Fetching AL-KO XML catalog...");
  const xmlText = await fetchXml();
  logger.info(`XML fetched: ${(xmlText.length / 1024 / 1024).toFixed(1)} MB`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === "offer" || name === "category" || name === "param",
    processEntities: true,
    htmlEntities: true,
  });
  const parsed = parser.parse(xmlText);
  const shop = parsed.yml_catalog.shop;

  const xmlCategories: XmlCategory[] = shop.categories.category;
  const xmlOffers: XmlOffer[] = shop.offers.offer;
  logger.info(`Parsed: ${xmlCategories.length} categories, ${xmlOffers.length} products`);

  // =========================================================================
  // 2. Delete existing products (for re-import)
  // =========================================================================
  const existingProducts = await productModuleService.listProducts(
    {},
    { select: ["id"], take: 1000 }
  );
  if (existingProducts.length > 0) {
    logger.info(`Deleting ${existingProducts.length} existing products...`);
    const DELETE_BATCH = 50;
    for (let i = 0; i < existingProducts.length; i += DELETE_BATCH) {
      const batch = existingProducts.slice(i, i + DELETE_BATCH);
      const ids = batch.map((p) => p.id);
      try {
        await deleteProductsWorkflow(container).run({
          input: { ids },
        });
      } catch (err: any) {
        logger.warn(`Batch delete failed, trying one by one: ${err.message}`);
        for (const id of ids) {
          try {
            await deleteProductsWorkflow(container).run({
              input: { ids: [id] },
            });
          } catch (e: any) {
            logger.warn(`Failed to delete product ${id}: ${e.message}`);
          }
        }
      }
    }
    logger.info("Existing products deleted.");
  } else {
    logger.info("No existing products to delete.");
  }

  // =========================================================================
  // 3. Setup store — Sales Channel, UAH Currency (idempotent)
  // =========================================================================
  logger.info("Setting up store...");
  const [store] = await storeModuleService.listStores();

  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    const { result: scResult } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [{ name: "Default Sales Channel" }],
      },
    });
    defaultSalesChannel = scResult;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        { currency_code: "uah", is_default: true },
        { currency_code: "eur" },
        { currency_code: "usd" },
      ],
    },
  });

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  logger.info("Store configured with UAH as default currency.");

  // =========================================================================
  // 4. Region, Tax, Stock Location, Fulfillment (reuse existing or create)
  // =========================================================================
  const existingRegions = await regionModuleService.listRegions({ name: "Україна" });
  let region: { id: string; name: string };
  if (existingRegions.length > 0) {
    region = existingRegions[0];
    logger.info(`Reusing existing region: ${region.name} (${region.id})`);
  } else {
    logger.info("Creating Ukraine region...");
    const { result: regionResult } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Україна",
            currency_code: "uah",
            countries: ["ua"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = regionResult[0];
    logger.info(`Region created: ${region.name} (${region.id})`);

    // Tax region only needed on first run
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "ua", provider_id: "tp_system" }],
    });
    logger.info("Tax region configured for UA.");
  }

  // Stock location — reuse or create
  const existingStockLocations = await stockLocationModule.listStockLocations({
    name: "Склад Україна",
  });
  let stockLocation: { id: string; name: string };
  if (existingStockLocations.length > 0) {
    stockLocation = existingStockLocations[0];
    logger.info(`Reusing stock location: ${stockLocation.name} (${stockLocation.id})`);
  } else {
    logger.info("Creating stock location...");
    const { result: stockLocationResult } = await createStockLocationsWorkflow(
      container
    ).run({
      input: {
        locations: [
          {
            name: "Склад Україна",
            address: {
              city: "Київ",
              country_code: "UA",
              address_1: "",
            },
          },
        ],
      },
    });
    stockLocation = stockLocationResult[0];

    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: { default_location_id: stockLocation.id },
      },
    });

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    });
    logger.info(`Stock location: ${stockLocation.name} (${stockLocation.id})`);
  }

  // =========================================================================
  // 5. Shipping profile & fulfillment set (reuse existing)
  // =========================================================================
  logger.info("Setting up fulfillment...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: spResult } = await createShippingProfilesWorkflow(container).run({
      input: {
        data: [{ name: "Default Shipping Profile", type: "default" }],
      },
    });
    shippingProfile = spResult[0];
  }

  // Check if fulfillment set already exists
  const existingFulfillmentSets = await fulfillmentModuleService.listFulfillmentSets({
    name: "Доставка по Україні",
  });
  if (existingFulfillmentSets.length === 0) {
    const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: "Доставка по Україні",
      type: "shipping",
      service_zones: [
        {
          name: "Україна",
          geo_zones: [{ country_code: "ua", type: "country" }],
        },
      ],
    });

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });

    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Нова Пошта — Відділення",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: fulfillmentSet.service_zones[0].id,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Нова Пошта",
            description: "Доставка на відділення Нової Пошти (2-3 дні)",
            code: "nova-poshta-warehouse",
          },
          prices: [
            { currency_code: "uah", amount: 70 },
            { region_id: region.id, amount: 70 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
        {
          name: "Нова Пошта — Кур'єр",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: fulfillmentSet.service_zones[0].id,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Кур'єр",
            description: "Кур'єрська доставка Новою Поштою (1-2 дні)",
            code: "nova-poshta-courier",
          },
          prices: [
            { currency_code: "uah", amount: 120 },
            { region_id: region.id, amount: 120 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    });
  }
  logger.info("Fulfillment and shipping options configured.");

  // =========================================================================
  // 6. Publishable API key (reuse existing)
  // =========================================================================
  logger.info("Setting up publishable API key...");
  let publishableApiKey: ApiKey | null = null;
  const { data: existingKeys } = await query.graph({
    entity: "api_key",
    fields: ["id"],
    filters: { type: "publishable" },
  });

  publishableApiKey = existingKeys?.[0];

  if (!publishableApiKey) {
    const { result: [apiKeyResult] } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          { title: "Webshop", type: "publishable", created_by: "" },
        ],
      },
    });
    publishableApiKey = apiKeyResult as ApiKey;
  }

  try {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableApiKey.id,
        add: [defaultSalesChannel[0].id],
      },
    });
  } catch {
    // Already linked
  }

  try {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: stockLocation.id,
        add: [defaultSalesChannel[0].id],
      },
    });
  } catch {
    // Already linked
  }
  logger.info("API key and sales channel linked.");

  // =========================================================================
  // 7. Product categories — reuse existing or create
  // =========================================================================
  const existingCategories = await productModuleService.listProductCategories(
    {},
    { select: ["id", "handle", "metadata"], take: 100 }
  );

  const categoryMap = new Map<string, string>();

  if (existingCategories.length > 0) {
    logger.info(`Reusing ${existingCategories.length} existing categories.`);
    for (const cat of existingCategories) {
      const xmlId = (cat.metadata as Record<string, string>)?.xml_id;
      if (xmlId) {
        categoryMap.set(xmlId, cat.id);
      }
    }
  } else {
    logger.info("Creating product categories...");
    const categoryInputs = xmlCategories.map((cat) => ({
      name: cat["#text"],
      is_active: true,
      handle: slugify(cat["#text"]),
      metadata: { xml_id: cat["@_id"] },
    }));

    const { result: categoryResult } = await createProductCategoriesWorkflow(
      container
    ).run({
      input: { product_categories: categoryInputs },
    });

    for (const cat of categoryResult) {
      const xmlId = (cat.metadata as Record<string, string>)?.xml_id;
      if (xmlId) {
        categoryMap.set(xmlId, cat.id);
      }
    }
    logger.info(`Created ${categoryResult.length} categories.`);
  }

  // =========================================================================
  // 8. Import products in batches
  // =========================================================================
  logger.info(`Importing ${xmlOffers.length} products in batches of ${BATCH_SIZE}...`);
  let importedCount = 0;
  let skippedCount = 0;
  let withLifestylePhotos = 0;
  let withVideos = 0;
  let withBarcode = 0;
  let withWeight = 0;

  // Track used barcodes to avoid duplicates (Medusa enforces unique barcodes)
  const usedBarcodes = new Set<string>();

  for (let i = 0; i < xmlOffers.length; i += BATCH_SIZE) {
    const batch = xmlOffers.slice(i, i + BATCH_SIZE);
    const products: Record<string, any>[] = [];

    for (const offer of batch) {
      const rawArticle = offer.article != null ? String(offer.article) : "";
      const article = sanitizeArticle(rawArticle);
      const xmlId = String(offer["@_id"]);
      const productId = article || xmlId;
      const name = offer.name_ua;
      const description = stripHtml(offer.description_ua || "");
      const price = Number(offer.price);
      const stock = Number(offer.stock_quantity) || 0;
      const categoryXmlId = String(offer.categoryId);
      const medusaCategoryId = categoryMap.get(categoryXmlId);
      const pictureUrl = offer.picture || "";

      // Extract all structured data from XML params
      const data = extractProductData(offer.param, offer.vendor);

      if (!name || !price || !productId) {
        skippedCount++;
        continue;
      }

      const handle = `alko-${slugify(productId)}-${slugify(name)}`.substring(0, 200);

      // Build variant with physical properties
      const variant: Record<string, any> = {
        title: "Стандарт",
        sku: `ALKO-${productId}`,
        options: { "Варіант": "Стандарт" },
        manage_inventory: true,
        prices: [{ amount: price, currency_code: "uah" }],
      };
      if (data.weight !== null) variant.weight = data.weight;
      if (data.length !== null) variant.length = data.length;
      if (data.width !== null) variant.width = data.width;
      if (data.height !== null) variant.height = data.height;
      if (data.barcode && !usedBarcodes.has(data.barcode)) {
        variant.barcode = data.barcode;
        usedBarcodes.add(data.barcode);
      }

      // Build metadata: raw params + spec_* keys + structured fields
      const metadata: Record<string, any> = {
        ...data.rawMetadata,
        ...data.specMetadata,
        alko_article: rawArticle || xmlId,
        alko_vendor: data.brand,
        alko_url: offer.url || "",
        alko_xml_id: offer["@_id"],
        brand: data.brand,
      };
      if (data.series) metadata.series = data.series;
      if (data.warranty) metadata.warranty = data.warranty;
      if (data.videoUrls.length > 0) {
        metadata.video_url = data.videoUrls[0];
        if (data.videoUrls.length > 1) {
          metadata.video_urls = JSON.stringify(data.videoUrls);
        }
      }

      const product: Record<string, any> = {
        title: name,
        description,
        handle,
        status: ProductStatus.PUBLISHED,
        shipping_profile_id: shippingProfile.id,
        metadata,
        options: [
          {
            title: "Варіант",
            values: ["Стандарт"],
          },
        ],
        variants: [variant],
        sales_channels: [{ id: defaultSalesChannel[0].id }],
      };

      if (medusaCategoryId) {
        product.category_ids = [medusaCategoryId];
      }

      // Collect ALL images: main picture + extra photos + lifestyle photos
      const images: { url: string }[] = [];
      if (pictureUrl) {
        images.push({ url: pictureUrl });
      }
      for (const url of data.extraPhotos) {
        images.push({ url });
      }
      for (const url of data.lifestylePhotos) {
        images.push({ url });
      }

      if (images.length > 0) {
        product.images = images;
        product.thumbnail = pictureUrl || images[0].url;
      }

      // Track stats
      if (data.lifestylePhotos.length > 0) withLifestylePhotos++;
      if (data.videoUrls.length > 0) withVideos++;
      if (data.barcode) withBarcode++;
      if (data.weight !== null) withWeight++;

      products.push(product);
    }

    if (products.length > 0) {
      try {
        await createProductsWorkflow(container).run({
          input: { products } as any,
        });
        importedCount += products.length;
      } catch (error: any) {
        logger.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
        // Try one by one as fallback
        for (const product of products) {
          try {
            await createProductsWorkflow(container).run({
              input: { products: [product] } as any,
            });
            importedCount++;
          } catch (singleError: any) {
            logger.error(`Failed to import "${product.title}": ${singleError.message}`);
            skippedCount++;
          }
        }
      }
    }

    const progress = Math.min(100, Math.round(((i + batch.length) / xmlOffers.length) * 100));
    logger.info(`Progress: ${progress}% (${importedCount} imported, ${skippedCount} skipped)`);
  }

  logger.info(`Product import complete: ${importedCount} imported, ${skippedCount} skipped.`);

  // =========================================================================
  // 10. Set inventory levels
  // =========================================================================
  logger.info("Setting inventory levels...");
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
  });

  // Build sku → stock map from XML offers
  const skuStockMap = new Map<string, number>();
  for (const offer of xmlOffers) {
    const rawArt = offer.article != null ? String(offer.article) : "";
    const art = sanitizeArticle(rawArt);
    const pid = art || String(offer["@_id"]);
    skuStockMap.set(`ALKO-${pid}`, Number(offer.stock_quantity) || 0);
  }

  const inventoryLevels: CreateInventoryLevelInput[] = [];
  for (const item of inventoryItems) {
    const stock = skuStockMap.get(item.sku as string) ?? 0;
    inventoryLevels.push({
      location_id: stockLocation.id,
      stocked_quantity: stock,
      inventory_item_id: item.id,
    });
  }

  if (inventoryLevels.length > 0) {
    // Process inventory in batches too
    for (let i = 0; i < inventoryLevels.length; i += 100) {
      const batch = inventoryLevels.slice(i, i + 100);
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: batch },
      });
    }
  }

  logger.info(`Set inventory levels for ${inventoryLevels.length} items.`);

  // =========================================================================
  // Done!
  // =========================================================================
  logger.info("=".repeat(60));
  logger.info("AL-KO import complete!");
  logger.info(`  Categories: ${categoryMap.size}`);
  logger.info(`  Products: ${importedCount}`);
  logger.info(`  Skipped: ${skippedCount}`);
  logger.info(`  Inventory items: ${inventoryLevels.length}`);
  logger.info(`  With weight/dimensions: ${withWeight}`);
  logger.info(`  With barcodes: ${withBarcode}`);
  logger.info(`  With lifestyle photos: ${withLifestylePhotos}`);
  logger.info(`  With video links: ${withVideos}`);
  logger.info(`  Region: Україна (UAH)`);
  logger.info(`  Stock location: Склад Україна`);
  logger.info("=".repeat(60));
}
