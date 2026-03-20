#!/usr/bin/env python3
"""
Translate spec_attribute labels from Ukrainian to Russian via Medusa Translation API.
"""

import json
import subprocess
import sys

# Auth token (passed as env var or fetched)
import os

TOKEN = os.environ.get("TOKEN", "")

# Full mapping of attribute id -> (slug, ukrainian_label, russian_translation)
ATTRIBUTES = [
    ("bad8eea4-2a04-410a-9be5-ecf5a352534d", "air_speed", "Швидкість потоку повітря", "Скорость потока воздуха"),
    ("51e89c26-a63d-4e1e-8fd9-44f3f61baddb", "application", "Застосування", "Применение"),
    ("2711e93e-966a-44f1-bf89-9df0408347cb", "bar_length", "Довжина шини", "Длина шины"),
    ("52f4a7ba-072d-4ceb-af33-57a6be3483ec", "battery_ah", "Ємність акумулятора", "Ёмкость аккумулятора"),
    ("64e56f08-400e-470e-b244-73cc878899f2", "battery_included", "Акумулятор в комплекті", "Аккумулятор в комплекте"),
    ("8ddaa834-2d39-40e8-8f30-9f137cda061d", "battery_type", "Тип акумулятора", "Тип аккумулятора"),
    ("bb7f123c-2be0-4639-8475-441bc1899939", "battery_voltage", "Напруга акумулятора", "Напряжение аккумулятора"),
    ("a5231e1a-7b0c-42eb-82ed-e4b7c077512c", "body_material", "Матеріал корпусу", "Материал корпуса"),
    ("1ee4a48c-280c-433f-9777-ea0be7c260ed", "brand", "Виробник", "Производитель"),
    ("42f72b41-177f-4c85-8b41-ddf084a8d35b", "brand_country", "Країна реєстрації бренду", "Страна регистрации бренда"),
    ("a4b55760-0403-4ab6-a0b1-ef01cc6b6d1b", "cable_length", "Довжина кабелю", "Длина кабеля"),
    ("fa694789-d2ff-4a2e-b8fb-ceae33a90370", "cargo_places", "Кількість вантажних місць", "Количество грузовых мест"),
    ("5da2ff68-91d3-4ccd-8948-2733c7338ff3", "chain_links", "Кількість ланок ланцюга", "Количество звеньев цепи"),
    ("ca61c3e9-c4ef-4943-9bc1-c2e8a368299d", "chain_pitch", "Крок ланцюга", "Шаг цепи"),
    ("51419b68-43a4-4f9f-b15d-8e3272493ea5", "class", "Клас", "Класс"),
    ("bea04c6b-5c6d-4963-9df2-7b362da32f3c", "color", "Колір", "Цвет"),
    ("3ec7f5ce-42c6-456a-a005-93473060d9db", "compatibility", "Сумісність", "Совместимость"),
    ("0dd2e29a-548e-4699-b5bb-a63d06a52032", "compatible_brand", "Сумісний бренд", "Совместимый бренд"),
    ("9f04080d-f980-4620-8f85-c2ff8595e225", "compatible_model", "Сумісна модель", "Совместимая модель"),
    ("8edcf968-6aba-4d0e-8553-6ffcdf886b5b", "construction", "Конструкція", "Конструкция"),
    ("ec773da5-e85c-4f1e-8287-16968874c031", "cut_diameter", "Діаметр різання", "Диаметр резания"),
    ("0bd80cc1-3327-4db7-8644-208fcdedebeb", "cutting_height", "Висота зрізу", "Высота среза"),
    ("bb3eda50-c7e7-4ddd-9c8e-74aac7af0094", "cutting_levels", "Кількість рівнів висоти зрізу", "Количество уровней высоты среза"),
    ("817e9b6f-41dc-48ff-9f32-d50c6c2319a5", "cutting_system", "Ріжуча система", "Режущая система"),
    ("edbea1e5-4b85-4c94-a7a8-8bac3962bb15", "cutting_width", "Ширина захвату", "Ширина захвата"),
    ("8f8b002f-fdc9-435b-95b2-3ddd3d4811df", "cylinder_volume", "Об'єм циліндру", "Объём цилиндра"),
    ("bdf6716a-e627-40d5-9e72-cfd2e8691c23", "delivery_height", "Висота подачі", "Высота подачи"),
    ("a6c24a29-6612-45c8-afce-c935826f2c00", "delivery_set", "Комплект поставки", "Комплект поставки"),
    ("801d24be-2b6c-4bcc-b76a-dfa628d0cc40", "diameter", "Діаметр", "Диаметр"),
    ("02d37187-413b-4f07-86f0-ba439f111509", "dimensions", "Розміри", "Размеры"),
    ("0b3a0e07-a3e5-4831-b3cd-e47bc7e7985d", "drive_shaft", "Привідний вал", "Приводной вал"),
    ("4752e8f9-7eb6-4f61-9cfc-fe57ef0c9771", "engine", "Двигун", "Двигатель"),
    ("5708f1ef-1f69-4fdc-96af-1b738b204846", "engine_cc", "Об'єм двигуна", "Объём двигателя"),
    ("5813c400-7a66-4938-a954-35e813010386", "engine_displacement", "Об'єм двигуна", "Объём двигателя"),
    ("d6fd0543-8caa-4a2b-9fb2-79eefb352ce3", "engine_position", "Розміщення двигуна", "Расположение двигателя"),
    ("246cf677-2882-420e-a656-a21294e81a8f", "engine_type", "Тип двигуна", "Тип двигателя"),
    ("4545a853-ab0b-4020-8216-83d976da2b94", "engine_volume", "Об'єм двигуна", "Объём двигателя"),
    ("dc79cfe8-efce-41cd-82dc-bf0d4a988f8f", "equipment", "Комплектація", "Комплектация"),
    ("b28870f2-2c68-4a19-8109-af3bf48c0611", "features", "Особливості", "Особенности"),
    ("3ee40128-52c2-4824-93b4-6cf2b69b8ac8", "fuel_kind", "Вид палива", "Вид топлива"),
    ("78bc17a2-2bd0-4131-a4d4-245a914d799b", "fuel_tank", "Об'єм паливного баку", "Объём топливного бака"),
    ("eb5d0c45-ccb7-49e1-a8cd-9833f72ebbef", "fuel_type", "Тип палива", "Тип топлива"),
    ("06f24e2e-ff80-4728-9ea3-e2822a82d3f3", "grass_catcher", "Травозбірник", "Травосборник"),
    ("5cb3fa1b-18aa-4f45-90fa-4343cf67425b", "grass_catcher_volume", "Об'єм травозбірника", "Объём травосборника"),
    ("1385dd4c-eacb-41f8-89d0-b65dec83b46a", "grass_collector", "Травозбірник (об'єм)", "Травосборник (объём)"),
    ("4c884892-e9f9-4b32-ade4-67d4c6c39b8c", "immersion_depth", "Глибина занурення", "Глубина погружения"),
    ("e2188bae-d255-484f-b9db-b475f126502d", "inlet_diameter", "Діаметр вхідного отвору", "Диаметр входного отверстия"),
    ("a9386e21-4016-44ae-816c-aae0c75487a5", "installation_type", "Тип установки", "Тип установки"),
    ("e89f292d-33b6-4310-9f05-76bf317eb860", "kind", "Вид", "Вид"),
    ("f1614d02-29e3-4209-9aba-2f07e0c88e46", "length", "Довжина", "Длина"),
    ("5d8111c3-af1c-40ad-8ce0-5d02adbe603e", "made_in", "Країна-виробник", "Страна-производитель"),
    ("0de099c3-5d6d-41aa-8e68-04f774038de2", "material", "Матеріал", "Материал"),
    ("50b3b45f-196f-4181-bd45-3370151bbf88", "max_particle_size", "Максимальний розмір частинок", "Максимальный размер частиц"),
    ("01132539-de7e-4fae-a802-61f9cc12ebf9", "max_pressure", "Максимальний тиск", "Максимальное давление"),
    ("25845b75-fc12-470a-94df-f0f76132ab28", "max_rpm", "Макс. число обертів", "Макс. число оборотов"),
    ("1d8a5ba3-b63a-4bc7-86fc-96cfc53c7596", "model", "Модель", "Модель"),
    ("46529d0d-5086-479c-9e30-765d838ff23a", "movement_type", "Тип переміщення", "Тип перемещения"),
    ("617d18b8-358f-4ffb-8a6a-661de3cc538a", "noise_db", "Рівень шуму", "Уровень шума"),
    ("42d4f59b-1711-41f3-aedd-85ff3eb2597c", "outlet_diameter", "Діаметр вихідного отвору", "Диаметр выходного отверстия"),
    ("d29f0f63-04e9-4c03-a03a-4dbbdf63cdd7", "pack_qty", "Кількість в упаковці", "Количество в упаковке"),
    ("aca55c08-567b-40a0-9076-c7aa50a288b5", "package_weight", "Вага в упаковці", "Вес в упаковке"),
    ("e22a4681-a1b5-4bd3-aedd-550a30378836", "parts_type", "Тип запчастини", "Тип запчасти"),
    ("590f0f7d-1b54-4e9d-aaeb-51ccfec7e24d", "power", "Потужність", "Мощность"),
    ("515bfbe3-d61d-44da-b5e2-760dbaaeed2d", "power_hp", "Потужність двигуна", "Мощность двигателя"),
    ("d5ee6c98-e43d-447e-b0ed-a181783f5644", "power_kw", "Потужність двигуна", "Мощность двигателя"),
    ("4c38b20e-88c3-409f-bf29-334d3b6df8f8", "power_source", "Живлення", "Питание"),
    ("f532a4b7-2c0b-4384-b49f-92d6eb3d2eb8", "power_source_type", "Джерело живлення", "Источник питания"),
    ("3025efc6-0f88-461b-a469-f2ec388f6477", "power_watts", "Потужність двигуна", "Мощность двигателя"),
    ("878a7324-57d9-454e-83fd-7af5fba39fdd", "pressure", "Тиск", "Давление"),
    ("fd520a5f-ef35-4f42-bc37-97a2d3e7bbf7", "productivity", "Продуктивність", "Производительность"),
    ("1889928b-9dfe-4eba-aa85-41cceeaab596", "protection", "Система захисту", "Система защиты"),
    ("bea7646b-7528-401f-b170-a6b698133e3b", "purpose", "Призначення", "Назначение"),
    ("0a9b3ef9-5642-43ee-be60-4d67ba8bc68b", "recommended_area", "Рекомендована площа", "Рекомендуемая площадь"),
    ("0c342f29-0a39-4b98-a801-ca904583d296", "series", "Серія", "Серия"),
    ("453e2a6d-da92-4bdd-b7b0-253f388fe183", "snow_height", "Висота захвату снігу", "Высота захвата снега"),
    ("fed6395a-f187-4a86-b340-7924b237b74c", "snow_throw", "Дальність викиду снігу", "Дальность выброса снега"),
    ("7d2cd8c0-f702-444b-b584-0b0f51c58240", "snow_width", "Ширина захвату снігу", "Ширина захвата снега"),
    ("a95282f1-85e4-468c-b85d-2fb96e0264a7", "start_system", "Система запуску", "Система запуска"),
    ("e69acb94-b2fe-4afe-ac1d-9ba42869c3d8", "start_type", "Тип запуску", "Тип запуска"),
    ("c111343f-47e1-4f4b-bec1-941ca0e0b4f8", "tank_volume", "Об'єм бака", "Объём бака"),
    ("7afe3f58-1ac0-41a6-a789-777e1c53a281", "tire_diameter", "Діаметр покришки", "Диаметр шины"),
    ("552db72f-06d8-4ace-b51b-b95fabec0305", "type", "Тип", "Тип"),
    ("513272dd-f77a-451a-84e5-4d152d956b69", "ukt_zed", "Код УКТ ЗЕД", "Код УКТ ВЭД"),
    ("c19ac1ac-7775-4da7-be44-cca2b826c372", "vat_rate", "Ставка ПДВ", "Ставка НДС"),
    ("c455a23e-3d5e-4b44-9efb-f4bf7922b4a2", "vehicle_type", "Тип авто", "Тип авто"),
    ("2b457983-92af-4f2e-a691-1c8968456ddc", "voltage", "Напруга", "Напряжение"),
    ("b94e1433-5629-4319-9c9a-5e21b36cf7a1", "warranty", "Гарантія", "Гарантия"),
    ("cae6c51a-6431-4132-9791-99ba4f934367", "warranty_terms", "Гарантійні умови", "Гарантийные условия"),
    ("baea81f7-87c1-4fc9-8889-318dc895369e", "wheel_diameter", "Діаметр колес", "Диаметр колёс"),
    ("6331ab55-647d-45c0-b362-5bbbd057b942", "working_depth", "Робоча глибина", "Рабочая глубина"),
    ("1711c7d2-15b3-43d4-b778-a8621fc69a40", "working_pressure", "Робочий тиск", "Рабочее давление"),
    ("7999d0af-8d55-4e47-9155-ce9379fe1eed", "working_width", "Робоча ширина", "Рабочая ширина"),
]

def send_batch(token, batch):
    """Send a batch of translations to the API."""
    create_list = []
    for attr_id, slug, uk_label, ru_label in batch:
        create_list.append({
            "reference": "spec_attribute",
            "reference_id": attr_id,
            "locale_code": "ru-RU",
            "translations": {"label": ru_label}
        })

    payload = json.dumps({"create": create_list})

    result = subprocess.run(
        [
            "curl", "-s", "-X", "POST",
            "http://localhost:9000/admin/translations/batch",
            "-H", f"Authorization: Bearer {token}",
            "-H", "Content-Type: application/json",
            "-d", payload
        ],
        capture_output=True,
        text=True
    )

    return result.stdout, result.returncode

def main():
    token = TOKEN
    if not token:
        print("ERROR: TOKEN environment variable not set", file=sys.stderr)
        sys.exit(1)

    total = len(ATTRIBUTES)
    print(f"Total attributes to translate: {total}")

    # Process in batches of 10
    batch_size = 10
    success_count = 0
    error_count = 0

    for i in range(0, total, batch_size):
        batch = ATTRIBUTES[i:i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (total + batch_size - 1) // batch_size

        print(f"\nBatch {batch_num}/{total_batches} ({len(batch)} items):")
        for attr_id, slug, uk_label, ru_label in batch:
            print(f"  [{slug}] '{uk_label}' -> '{ru_label}'")

        stdout, retcode = send_batch(token, batch)

        # Parse response
        try:
            resp = json.loads(stdout)
            if "created" in resp or "translations" in resp or isinstance(resp, list):
                print(f"  OK: batch {batch_num} translated successfully")
                success_count += len(batch)
            elif "error" in resp or "message" in resp:
                msg = resp.get("message", resp.get("error", "Unknown error"))
                print(f"  ERROR: {msg}")
                # Try individual items as fallback
                print(f"  Falling back to individual requests...")
                for attr_id, slug, uk_label, ru_label in batch:
                    single_payload = json.dumps({
                        "create": [{
                            "reference": "spec_attribute",
                            "reference_id": attr_id,
                            "locale_code": "ru-RU",
                            "translations": {"label": ru_label}
                        }]
                    })
                    r = subprocess.run(
                        ["curl", "-s", "-X", "POST",
                         "http://localhost:9000/admin/translations/batch",
                         "-H", f"Authorization: Bearer {token}",
                         "-H", "Content-Type: application/json",
                         "-d", single_payload],
                        capture_output=True, text=True
                    )
                    try:
                        sr = json.loads(r.stdout)
                        if "error" in sr or "message" in sr:
                            print(f"    FAIL [{slug}]: {sr.get('message', sr.get('error', '?'))}")
                            error_count += 1
                        else:
                            print(f"    OK [{slug}]")
                            success_count += 1
                    except:
                        print(f"    FAIL [{slug}]: cannot parse response: {r.stdout[:100]}")
                        error_count += 1
            else:
                print(f"  Response: {stdout[:200]}")
                success_count += len(batch)
        except json.JSONDecodeError:
            print(f"  Cannot parse JSON: {stdout[:200]}")
            error_count += len(batch)

    print(f"\n{'='*50}")
    print(f"DONE: {success_count}/{total} labels translated successfully")
    if error_count > 0:
        print(f"ERRORS: {error_count} labels failed")

if __name__ == "__main__":
    main()
