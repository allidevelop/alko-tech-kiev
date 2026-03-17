/**
 * update-descriptions.ts
 *
 * Fetches the AL-KO XML catalog and updates product descriptions in PostgreSQL.
 *
 * The original import script's stripHtml() function used /<[^>]*>/g which
 * treated the entire <![CDATA[...]]> block as an HTML tag and deleted all
 * description content for 641 products. This script fixes that by:
 *   1. Stripping the CDATA wrapper first
 *   2. Then stripping any remaining HTML tags
 *   3. Decoding HTML entities
 *   4. Trimming whitespace
 *
 * Usage:
 *   node src/scripts/update-descriptions.mjs
 *   (or: npx ts-node --esm src/scripts/update-descriptions.ts)
 */

import { XMLParser } from "fast-xml-parser";
import pg from "pg";

const XML_URL = "https://apipim.al-ko.ua/storage/xml_files/PriceList.xml";

const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "medusa_alko",
  user: "medusa_alko",
  password: "medusa_alko_2026",
};

interface XmlOffer {
  "@_id": string;
  description_ua?: string | { __cdata?: string };
  [key: string]: unknown;
}

/**
 * Clean description text:
 * 1. Strip <![CDATA[ prefix and ]]> suffix
 * 2. Strip remaining HTML tags
 * 3. Decode HTML entities
 * 4. Trim whitespace
 */
function cleanDescription(raw: unknown): string {
  if (!raw) return "";

  let text = String(raw);

  // Strip CDATA wrapper (appears as literal string from fast-xml-parser)
  text = text.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");

  // Strip HTML tags (safe now that CDATA markers are removed)
  text = text.replace(/<[^>]*>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_: string, code: string) =>
      String.fromCharCode(Number(code))
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

async function main(): Promise<void> {
  console.log("=== AL-KO Product Description Updater ===\n");

  // 1. Fetch XML catalog
  console.log(`Fetching XML catalog from ${XML_URL}...`);
  const response = await fetch(XML_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch XML: ${response.status} ${response.statusText}`
    );
  }
  const xmlText = await response.text();
  console.log(
    `XML fetched: ${(xmlText.length / 1024 / 1024).toFixed(1)} MB`
  );

  // 2. Parse XML with entity decoding enabled so we get readable Ukrainian text.
  //    The parser decodes HTML entities but leaves CDATA markers as literal strings.
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name: string) =>
      name === "offer" || name === "category" || name === "param",
    processEntities: true,
    htmlEntities: true,
  });
  const parsed = parser.parse(xmlText);
  const shop = parsed.yml_catalog.shop;
  const offers: XmlOffer[] = shop.offers.offer;
  console.log(`Parsed: ${offers.length} offers\n`);

  // 3. Build XML ID -> description map
  const descriptionMap = new Map<string, string>();
  let withDescription = 0;
  let emptyDescription = 0;

  for (const offer of offers) {
    const xmlId = String(offer["@_id"]);
    const rawDesc =
      offer.description_ua != null ? String(offer.description_ua) : "";
    const cleaned = cleanDescription(rawDesc);

    if (cleaned) {
      descriptionMap.set(xmlId, cleaned);
      withDescription++;
    } else {
      emptyDescription++;
    }
  }

  console.log(`Descriptions found: ${withDescription}`);
  console.log(`Empty descriptions: ${emptyDescription}\n`);

  if (withDescription === 0) {
    console.log("No descriptions to update. Exiting.");
    return;
  }

  // Show a sample
  const sampleEntries = [...descriptionMap.entries()].slice(0, 3);
  for (const [xmlId, desc] of sampleEntries) {
    console.log(
      `  Sample [${xmlId}]: ${desc.substring(0, 120)}${desc.length > 120 ? "..." : ""}`
    );
  }
  console.log();

  // 4. Connect to PostgreSQL and update products
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  console.log("Connected to PostgreSQL.");

  // Get all products with their alko_xml_id
  const { rows: products } = await client.query(
    "SELECT id, metadata->>'alko_xml_id' as xml_id FROM product WHERE metadata->>'alko_xml_id' IS NOT NULL"
  );
  console.log(`Found ${products.length} products with alko_xml_id in DB.\n`);

  let updated = 0;
  let notFound = 0;

  for (const product of products) {
    const description = descriptionMap.get(product.xml_id);
    if (description) {
      await client.query(
        "UPDATE product SET description = $1 WHERE id = $2",
        [description, product.id]
      );
      updated++;
    } else {
      notFound++;
    }
  }

  console.log("=== Results ===");
  console.log(`  Products in DB: ${products.length}`);
  console.log(`  Updated with description: ${updated}`);
  console.log(`  No description in XML: ${notFound}`);

  // Verify
  const { rows: verify } = await client.query(
    "SELECT COUNT(*) as total, COUNT(CASE WHEN description IS NOT NULL AND description != '' THEN 1 END) as with_desc FROM product"
  );
  console.log(
    `\n  Verification: ${verify[0].with_desc}/${verify[0].total} products now have descriptions.`
  );

  // Show a sample of updated products
  const { rows: samples } = await client.query(
    "SELECT title, LEFT(description, 150) as desc_preview FROM product WHERE description IS NOT NULL AND description != '' LIMIT 3"
  );
  console.log("\n  Sample updated products:");
  for (const s of samples) {
    console.log(`    "${s.title}": ${s.desc_preview}...`);
  }

  await client.end();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
