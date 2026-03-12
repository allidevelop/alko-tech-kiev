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

function getParamsAsMetadata(
  params: XmlOffer["param"]
): Record<string, string> {
  const metadata: Record<string, string> = {};
  const paramArray = Array.isArray(params) ? params : params ? [params] : [];
  for (const p of paramArray) {
    if (p["@_name"] && p["#text"] != null) {
      metadata[p["@_name"]] = String(p["#text"]);
    }
  }
  return metadata;
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
  // 2. Setup store — Sales Channel, UAH Currency
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
  // 3. Create Ukraine region
  // =========================================================================
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
  const region = regionResult[0];
  logger.info(`Region created: ${region.name} (${region.id})`);

  // =========================================================================
  // 4. Tax region (ПДВ 20% included in price)
  // =========================================================================
  logger.info("Setting up tax region...");
  await createTaxRegionsWorkflow(container).run({
    input: [
      {
        country_code: "ua",
        provider_id: "tp_system",
      },
    ],
  });
  logger.info("Tax region configured for UA.");

  // =========================================================================
  // 5. Stock location — Warehouse Ukraine
  // =========================================================================
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
  const stockLocation = stockLocationResult[0];

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

  // =========================================================================
  // 6. Shipping profile & fulfillment set
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
  logger.info("Fulfillment and shipping options configured.");

  // =========================================================================
  // 7. Publishable API key
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

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("API key and sales channel linked.");

  // =========================================================================
  // 8. Create product categories from XML
  // =========================================================================
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

  // Build map: XML category ID → Medusa category ID
  const categoryMap = new Map<string, string>();
  for (const cat of categoryResult) {
    const xmlId = (cat.metadata as Record<string, string>)?.xml_id;
    if (xmlId) {
      categoryMap.set(xmlId, cat.id);
    }
  }
  logger.info(`Created ${categoryResult.length} categories.`);

  // =========================================================================
  // 9. Import products in batches
  // =========================================================================
  logger.info(`Importing ${xmlOffers.length} products in batches of ${BATCH_SIZE}...`);
  let importedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < xmlOffers.length; i += BATCH_SIZE) {
    const batch = xmlOffers.slice(i, i + BATCH_SIZE);
    const products = [];

    for (const offer of batch) {
      const rawArticle = offer.article != null ? String(offer.article) : "";
      const article = sanitizeArticle(rawArticle);
      const xmlId = String(offer["@_id"]);
      // Use article if available, fallback to xml offer id
      const productId = article || xmlId;
      const name = offer.name_ua;
      const description = stripHtml(offer.description_ua || "");
      const price = Number(offer.price);
      const stock = Number(offer.stock_quantity) || 0;
      const categoryXmlId = String(offer.categoryId);
      const medusaCategoryId = categoryMap.get(categoryXmlId);
      const pictureUrl = offer.picture || "";
      const metadata = getParamsAsMetadata(offer.param);

      if (!name || !price || !productId) {
        skippedCount++;
        continue;
      }

      // Generate handle from product id + slugified name — only URL-safe chars
      const handle = `alko-${slugify(productId)}-${slugify(name)}`.substring(0, 200);

      const product: Record<string, any> = {
        title: name,
        description,
        handle,
        status: ProductStatus.PUBLISHED,
        shipping_profile_id: shippingProfile.id,
        metadata: {
          ...metadata,
          alko_article: rawArticle || xmlId,
          alko_vendor: offer.vendor || "AL-KO",
          alko_url: offer.url || "",
          alko_xml_id: offer["@_id"],
        },
        options: [
          {
            title: "Варіант",
            values: ["Стандарт"],
          },
        ],
        variants: [
          {
            title: "Стандарт",
            sku: `ALKO-${productId}`,
            options: { "Варіант": "Стандарт" },
            manage_inventory: true,
            prices: [
              { amount: price, currency_code: "uah" },
            ],
          },
        ],
        sales_channels: [{ id: defaultSalesChannel[0].id }],
      };

      if (medusaCategoryId) {
        product.category_ids = [medusaCategoryId];
      }

      if (pictureUrl) {
        product.images = [{ url: pictureUrl }];
        product.thumbnail = pictureUrl;
      }

      products.push(product);
    }

    if (products.length > 0) {
      try {
        await createProductsWorkflow(container).run({
          input: { products },
        });
        importedCount += products.length;
      } catch (error: any) {
        logger.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
        // Try one by one as fallback
        for (const product of products) {
          try {
            await createProductsWorkflow(container).run({
              input: { products: [product] },
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
    const stock = skuStockMap.get(item.sku) ?? 0;
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
  logger.info(`  Categories: ${categoryResult.length}`);
  logger.info(`  Products: ${importedCount}`);
  logger.info(`  Skipped: ${skippedCount}`);
  logger.info(`  Inventory items: ${inventoryLevels.length}`);
  logger.info(`  Region: Україна (UAH)`);
  logger.info(`  Stock location: Склад Україна`);
  logger.info("=".repeat(60));
}
