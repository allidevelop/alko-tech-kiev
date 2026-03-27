#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AL-KO → Эпицентр XML Converter
==============================

Конвертирует товарный фид AL-KO в формат маркетплейса Эпицентр.

Использование:
    python3 alko_to_epicentr.py
    python3 alko_to_epicentr.py --input source.xml --output epicentr.xml
    python3 alko_to_epicentr.py --dry-run  # тестовый запуск без сохранения

Автор: Claude AI для проекта AL-KO Ukraine
Версия: 1.0.0
Дата: 2025-12-15
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
import re
import argparse
import logging
import sys
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from html import unescape
from typing import Dict, List, Optional, Tuple
import json
import os

# ==============================================================================
# КОНФИГУРАЦИЯ
# ==============================================================================

# URL исходного XML-фида AL-KO
SOURCE_XML_URL = "https://apipim.al-ko.ua/storage/xml_files/PriceList.xml"

# Путь к выходному файлу по умолчанию
DEFAULT_OUTPUT = "epicentr_feed.xml"

# Таймаут для HTTP-запросов (секунды)
HTTP_TIMEOUT = 30

# ==============================================================================
# МАППИНГИ - ЗАПОЛНИТЬ ПЕРЕД ИСПОЛЬЗОВАНИЕМ!
# ==============================================================================

# Маппинг категорий AL-KO на коды категорий Эпицентра
# Формат: "ID_ALKO": ("КОД_ЭПИЦЕНТРА", "Название категории")
# 
# Получить коды: https://api.epicentrm.com.ua/swagger/#/PIM/getCategoriesV2
# Токен API: 5a6489d1a5c48c9d174bd31f2a0a8fd0

CATEGORY_MAPPING: Dict[str, Tuple[str, str]] = {
    # Садова техніка (основна категорія parent: 450)
    "1":  ("451", "Газонокосарки"),
    "2":  ("3819", "Мотокоси і тримери садові"),
    "3":  ("454", "Кущорізи"),
    "4":  ("454", "Кущорізи"),  # Повітродувки → Кущорізи (найближча категорія)
    "5":  ("455", "Аератори"),
    "6":  ("6829", "Електропили"),  # Листова категорія (6824 - parent)
    "7":  ("462", "Снігоприбиральна техніка"),
    "8":  ("6832", "Висоторізи"),

    # Аксесуари та комплектуючі
    "9":  ("6668", "Комплектуючі для газонокосарок"),  # Загальні аксесуари
    "10": ("6667", "Акумулятори і зарядні пристрої для садової техніки"),
    "11": ("449", "Обприскувачі"),
    "16": ("6460", "Комплектуючі для мотокіс і тримерів"),
    "19": ("6457", "Комплектуючі для пил ланцюгових"),

    # Техніка для саду
    "12": ("6559", "Шланги високого тиску"),  # Мийки → шланги ВТ
    "14": ("6559", "Шланги високого тиску"),  # Мийки високого тиску
    "15": ("458", "Культиватори"),  # або 6809 для мотоблоків
    "17": ("2723", "Двигуни для садової техніки"),
    "18": ("461", "Навісне обладнання для мотоблоків"),
    "20": ("457", "Подрібнювачі садові"),
    "23": ("2776", "Генератори"),

    # Насоси та полив (parent: 439 - Полив та зрошення)
    "22": ("440", "Шланги для поливу"),
    "32": ("1663", "Занурювальні насоси"),
    "33": ("1662", "Поверхневі насоси"),
    "34": ("1662", "Поверхневі насоси"),  # Мотопомпи → поверхневі насоси
    "35": ("8766", "Запчастини для насосів"),

    # Грилі (parent: 512 - Товари для пікніка)
    "29": ("519", "Мангали"),  # Газові грилі → Мангали
    "30": ("519", "Мангали"),  # Грилі → Мангали
    "31": ("519", "Мангали"),  # Аксесуари для грилів → Мангали

    # Інше
    "13": ("6667", "Акумулятори і зарядні пристрої для садової техніки"),  # Ліхтарі
    "21": ("6456", "Мастило для садової техніки"),  # Гідравлічні масла
    "24": ("2930", "Ланцюги на колеса"),  # Пристрої протисковзіння
    "25": ("3820", "Компостери"),
    "26": ("6456", "Мастило для садової техніки"),  # Моторні оливи
    "27": ("6456", "Мастило для садової техніки"),  # Спеціалізована хімія
    "28": ("6667", "Акумулятори і зарядні пристрої для садової техніки"),  # Каністри
    "36": ("3820", "Компостери"),  # Садовий декор → Компостери (найближче)
}

# Маппинг стран-производителей
# Формат: "Название_UA": ("код_эпицентра", "Название")
COUNTRY_MAPPING: Dict[str, Tuple[Optional[str], str]] = {
    "Китай":     ("chn", "Китай"),
    "Австрія":   ("aut", "Австрія"),
    "Німеччина": ("deu", "Німеччина"),
    "Польща":    ("pol", "Польща"),
    "Польша":    ("pol", "Польща"),  # Альтернативне написання
    "Угорщина":  ("hun", "Угорщина"),
    "Італія":    ("ita", "Італія"),
    "Франція":   ("fra", "Франція"),
    "Чехія":     ("cze", "Чехія"),
    "Словаччина": ("svk", "Словаччина"),
    "Данія":     ("dnk", "Данія"),
    "США":       ("usa", "США"),
    "Тайвань":   ("twn", "Тайвань"),
    "Японія":    ("jpn", "Японія"),
    "Корея":     ("kor", "Корея"),
}

# Код бренда AL-KO в системе Эпицентра
# Получен через API: /v2/pim/attribute-sets/450/attributes/brand/options
ALKO_BRAND_CODE: str = "otd1fggoy0qrq543"

# ==============================================================================
# МАППИНГИ АТРИБУТОВ ДЛЯ ГАЗОНОКОСАРОК (категория 451)
# ==============================================================================

# Тип живлення (paramcode: 10839) - ОБЯЗАТЕЛЬНЫЙ
POWER_TYPE_MAPPING: Dict[str, str] = {
    "акумуляторна": "3455f43540ae397424ef79f4725d1055",
    "бензинова": "70eae2a029fa19a519283e1564a05708",
    "бензин": "70eae2a029fa19a519283e1564a05708",
    "електрична": "1c6ca8ac42c3fd6a68b09b78ca40c4b3",
    "електромережа": "1c6ca8ac42c3fd6a68b09b78ca40c4b3",
    "механічна": "39ffc60890d7c57ffd8ce56bb787980f",
}

# Тип (paramcode: 10868) - ОБЯЗАТЕЛЬНЫЙ
MOWER_TYPE_MAPPING: Dict[str, str] = {
    "акумуляторна": "72e3b7e6f2d9d699be73b9731f25cea6",
    "електрична": "3942e93c16065b166e0408038bdfdead",
    "бензинова": "681b8f305e80c57c327841d5a0ba5d15",
    "механічна": "7cafb2a0e3300a00ce7ac8c6f5957ea2",
    "робот": "1ec5330a167523f8048555a360fa0aff",
    "газонокосарка-робот": "1ec5330a167523f8048555a360fa0aff",
    "трактор": "febaa6cfa9225e59c6612ced28dc5066",
}

# Тип приводу (paramcode: 9163) - ОБЯЗАТЕЛЬНЫЙ
DRIVE_TYPE_MAPPING: Dict[str, str] = {
    "самохідна": "fecd400275e72a1f70548444dbd26465",
    "несамохідна": "fcc2b4433c41f78c8f1276b6df871ef2",
    "не самохідна": "fcc2b4433c41f78c8f1276b6df871ef2",
}

# Функція мульчування (paramcode: 12018) - ОБЯЗАТЕЛЬНЫЙ
MULCHING_MAPPING: Dict[str, str] = {
    "так": "578ef7874a9b4952e9ae026893f1e68c",
    "ні": "49b1ac243dc0c14f9ec9709ba5f23ea2",
    "yes": "578ef7874a9b4952e9ae026893f1e68c",
    "no": "49b1ac243dc0c14f9ec9709ba5f23ea2",
}

# Центральне регулювання висоти (paramcode: 12019) - ОБЯЗАТЕЛЬНЫЙ
HEIGHT_ADJUSTMENT_MAPPING: Dict[str, str] = {
    "так": "c3450a1a676eabe4db416775fc8ad8ed",
    "ні": "3269251587d9be633875a6a5c780c7fa",
    "yes": "c3450a1a676eabe4db416775fc8ad8ed",
    "no": "3269251587d9be633875a6a5c780c7fa",
}

# Боковий викид (paramcode: 12020) - ОБЯЗАТЕЛЬНЫЙ
SIDE_DISCHARGE_MAPPING: Dict[str, str] = {
    "так": "ac787cd31ed5ec2f40765d63fdf38fb9",
    "ні": "b4071f855b21afae1a5997bf6295986b",
    "yes": "ac787cd31ed5ec2f40765d63fdf38fb9",
    "no": "b4071f855b21afae1a5997bf6295986b",
}

# ==============================================================================
# МАППИНГИ АТРИБУТОВ ДЛЯ МОТОКОС/ТРИМЕРІВ (категория 3819)
# ==============================================================================

# Тип (paramcode: 10884)
TRIMMER_TYPE_MAPPING: Dict[str, str] = {
    "тример": "86a9a93c70f6c4589aab1a08c70de09e",
    "тримери": "86a9a93c70f6c4589aab1a08c70de09e",
    "електрокоса": "1b6a7225fa961d34a5babb8271ce7b76",
    "мотокоса": "f5549607a53ee5be26190e3321df2aa7",
    "комбі-система": "1dd65e91b311e2ab8da50aba404593f3",
}

# Тип двигуна (paramcode: 4519)
ENGINE_TYPE_MAPPING: Dict[str, str] = {
    "2-тактний": "71c0e0c9a67e70dadfbef12ebaa3eb64",
    "двотактний": "71c0e0c9a67e70dadfbef12ebaa3eb64",
    "4-тактний": "4b921181a6e657aa66dfa0ee4607074a",
    "чотиритактний": "4b921181a6e657aa66dfa0ee4607074a",
    "електричний": "76c41d1a32d00e95f5798b25c9687295",
    "безщітковий": "76c41d1a32d00e95f5798b25c9687295",
}

# Тип ріжучого елемента (paramcode: 10861)
CUTTING_ELEMENT_MAPPING: Dict[str, str] = {
    "пластиковий ніж": "18ebc6efd3802cce0313e13bef18f5f0",
    "фрезерна система": "8ebbdce41792160fe40844b5d4396b96",
    "ножова ріжуча система": "15deca3283559941ce9f708f1c6e0c73",
    "волосінь": "cc817bc1ac0963be2b0cd62ef6e2a77b",
    "ліска": "cc817bc1ac0963be2b0cd62ef6e2a77b",
    "дисковий ніж": "c8626c88543276b21c283b1ddbb244eb",
    "металевий ніж": "5225d9656309e3c43a041f61603afd77",
    "ніж, ліска": "5225d9656309e3c43a041f61603afd77",
    "3-х пелюстковий": "f4dd44472de92846101120a73f45b835",
}

# ==============================================================================
# МАППИНГИ АТРИБУТІВ ДЛЯ ЕЛЕКТРОПИЛ (категорія 6829)
# ==============================================================================

# Вага (paramcode: 4684)
CHAINSAW_WEIGHT_MAPPING: Dict[str, str] = {
    "до 2.6 кг": "457a33552e7f53dc60f3646c2d061132",
    "2.6 - 3.9 кг": "c50635408fefc6d26e374b10ca341613",
    "4-4.9 кг": "382ca6b7d117796f4f06a633be54039b",
    "5-5.9 кг": "a4cb18df5cd125f563a6562bc9b21526",
    "6-6.9 кг": "313128119c7e121bcbe3126b167757ba",
    "7 кг і більше": "0a6933687d3d31b1cfa54348b852cd04",
}

# Напруга (paramcode: 8309) - общий для многих категорій
VOLTAGE_MAPPING: Dict[str, str] = {
    "230": "33b5aa101f60bfef60d2bf254ef1b4cc",
    "220": "33b5aa101f60bfef60d2bf254ef1b4cc",
    "36": "896164479f49f763cbcb8eb64795c2d2",
    "36,0": "896164479f49f763cbcb8eb64795c2d2",
    "18": "604719591b69ebf2a2924323342309c5",
    "18,0": "604719591b69ebf2a2924323342309c5",
    "20": "945e63c04b3dcc0d9979993b37d27e1f",
    "20,0": "945e63c04b3dcc0d9979993b37d27e1f",
    "24": "e15ca26139a48f54604816afc2c2f702",
    "24,0": "e15ca26139a48f54604816afc2c2f702",
    "40": "9e734efc8e180991b65cbe1a50fdebab",
    "40,0": "9e734efc8e180991b65cbe1a50fdebab",
    "42": "1c3d55f287be0e4c3828f892fd00fd08",
    "42,0": "1c3d55f287be0e4c3828f892fd00fd08",
    "48": "d1af780dcbd0b6e681e83004ea2cb2fb",
    "48,0": "d1af780dcbd0b6e681e83004ea2cb2fb",
    "54": "e806a8275d1f0b66eeb020f720fd75e9",
    "54,0": "e806a8275d1f0b66eeb020f720fd75e9",
}

# Клас (paramcode: 2364)
CLASS_MAPPING: Dict[str, str] = {
    "професійний": "096dbd558ae4caf952f8a19bca3a3017",
    "професійна": "096dbd558ae4caf952f8a19bca3a3017",
    "напівпрофесійний": "f8ceb1161f68fe63166ca385966493ef",
    "побутовий": "bf4876013c5bc2292bc31b57733cc9d1",
    "побутова": "bf4876013c5bc2292bc31b57733cc9d1",
    "міні": "07c4974b5740e4492840c2e74c82caa9",
}

# ==============================================================================
# МАППИНГИ АТРИБУТІВ ДЛЯ СНІГОПРИБИРАЛЬНОЇ ТЕХНІКИ (категорія 462)
# ==============================================================================

# Вид (paramcode: 51)
SNOW_EQUIPMENT_TYPE_MAPPING: Dict[str, str] = {
    "підмітальна машина": "egiv1thzdezrx6og",
    "акумуляторна лопата": "b2ufi3eyvvwtxblg",
    "снігоприбиральна машина": "8q5qfoehavlmh6su",
    "снігоприбиральник": "8q5qfoehavlmh6su",
}

# Призначення (paramcode: 10347)
PURPOSE_MAPPING: Dict[str, str] = {
    "для вулиці": "1e24b3e24657090d932ce6f285ee76a2",
    "багатоцільове": "5e0eba4fb76b17431bec69245a0ac42d",
    "універсальний": "549330af139a739ea8e270f59ed0ffd3",
    "для дачі": "73c8d185b5ec126e322fd19272c2e014",
    "для дому": "74986060300ccf5e9de97166263fa416",
    "для гаража": "87cebeaea6ca734c40f8a9721b44756f",
    "для саду": "b7d033cd93ca9b1657d0e1fdaf491739",
}

# ==============================================================================
# МАППИНГИ АТРИБУТІВ ДЛЯ ВИСОТОРІЗІВ (категорія 6832)
# ==============================================================================

# Розміщення двигуна (paramcode: 10856)
ENGINE_PLACEMENT_MAPPING: Dict[str, str] = {
    "пряме": "1bcdc4d00ab1a4da37028bea2292c3dc",
    "поздовжнє": "6f15af51646706101cf247341fcbc5af",
    "поперекове": "f967a9a904dd9416ed3d6179348c7ef8",
    "поперечне": "f967a9a904dd9416ed3d6179348c7ef8",
    "бокове": "4d6448eec78c033fc1c4b8817cf8448f",
}

# ==============================================================================
# МАППИНГИ АТРИБУТІВ ДЛЯ АКУМУЛЯТОРІВ (категорія 6667)
# ==============================================================================

# Вид (paramcode: 2917)
BATTERY_TYPE_VIEW_MAPPING: Dict[str, str] = {
    "батарея акумуляторна": "04a1fb5541eabdb7782d2151337246fe",
    "акумулятор": "04a1fb5541eabdb7782d2151337246fe",
    "зарядний пристрій": "d9e291b84b23a670d6f3acc206bdfccc",
    "комплект": "b28e89dc54d201f8f74289bc3d169c81",
    "захисний чохол": "53e38f0983cdf145f8e20a74809d96e2",
}

# Тип акумулятора (paramcode: 7358)
BATTERY_CHEMISTRY_MAPPING: Dict[str, str] = {
    "li-ion": "c62dfe0a8b1da474ece7af883ec36e66",
    "літій-іонний": "c62dfe0a8b1da474ece7af883ec36e66",
    "li-pol": "9cc93ce4d229f2baa1d7645175b1876e",
    "nicd": "2b5334f8eb82de99556a4327f3e6c40b",
    "li-hd": "d358ce3b9de9b1a8e8802f5ec3e1d0ce",
    "nimh": "ccd81c2c94c634b5d72f5c3fb5d5d01a",
    "agm": "61d466ebc9deb96f14d359fd85bf40de",
}

# Ємність (paramcode: 7352)
CAPACITY_MAPPING: Dict[str, str] = {
    "1.5": "2621e3d23058b26199abd41c79f7007a",
    "1,5": "2621e3d23058b26199abd41c79f7007a",
    "2": "03e4c817177efd6239db8dd95a901c60",
    "2.0": "03e4c817177efd6239db8dd95a901c60",
    "2.5": "23bfab801d607c45ca225e9dfca2c394",
    "2,5": "23bfab801d607c45ca225e9dfca2c394",
    "3": "dd89d99d7d7660bad1e233003aaf5917",
    "3.0": "dd89d99d7d7660bad1e233003aaf5917",
    "4": "74cdaff39785c520daf71f1ebcc53498",
    "4.0": "74cdaff39785c520daf71f1ebcc53498",
    "5": "e4f03e965ce3a5074a990e6504db8c48",
    "5.0": "e4f03e965ce3a5074a990e6504db8c48",
    "6": "1601a41873440917216243449922e754",
    "6.0": "1601a41873440917216243449922e754",
    "8": "cb5f1ee19e50ac16a8db134dad96c457",
    "8.0": "cb5f1ee19e50ac16a8db134dad96c457",
}

# ==============================================================================
# МАППИНГИ АТРИБУТІВ ДЛЯ КУЛЬТИВАТОРІВ (категорія 458)
# ==============================================================================

# Запуск двигуна (paramcode: 9132)
START_TYPE_MAPPING: Dict[str, str] = {
    "ручний стартер": "aaca52371f75f80416929d70447a9c74",
    "ручний": "aaca52371f75f80416929d70447a9c74",
    "електростартер": "9284880f74a4c0c15b0e331aba7a4e5d",
    "електричний пуск": "9284880f74a4c0c15b0e331aba7a4e5d",
}

# Тип приводу культиватора (paramcode: 8340)
CULTIVATOR_DRIVE_TYPE_MAPPING: Dict[str, str] = {
    "шестеренчастий": "4123e82a90c63e1c66d7c377de0c7209",
    "редукторний": "7909021de875c871d1157a62b9cc9c4b",
    "черв'ячний": "9ac06e61479a4172a2a5cdc123d29185",
    "прямий": "93b59bfe815f008e576b5d73beaf84c6",
    "ремінцевий": "6084c1841324c630bcca473265c12b0c",
    "ланцюговий": "1195961b627327f840cf98d51a98de49",
}

# ==============================================================================
# МАППИНГИ АТРИБУТІВ ДЛЯ НАСОСІВ (категорії 1662, 1663)
# ==============================================================================

# Тип насоса (paramcode: 12006)
PUMP_TYPE_MAPPING: Dict[str, str] = {
    "відцентровий": "1b001a9a9434fb0d3d97d0b876a23684",
    "для поливу": "72beef7ef47695125d50844dfc1841d6",
    "насосна станція": "496c832f17968cd72659783138ce6567",
    "садовий": "864372cd5c7c726118c3b58862585ce2",
    "вібраційний": "b9b26ca2bc606db526582dcab2da4016",
    "глибинний": "65fe9c042dcedbea827c70cd8d0d4ab2",
    "для свердловин": "6876186a9d0df531b8f478ba934e89d7",
    "фекальний": "b931f6438ebe25605b7a4b4c13bac3c1",
    "дренажний": "371fbd5c28c2e9f4a83970aa6c8a6b1c",
}

# Тип рідини (paramcode: 11999)
LIQUID_TYPE_MAPPING: Dict[str, str] = {
    "сильнозабруднена": "9b5f101af420d86792cdcac26c0a41a7",
    "чиста": "8436cc818b2ae693aab9d4b231f44781",
    "для чистої води": "8436cc818b2ae693aab9d4b231f44781",
    "брудна": "940498ae6b2936be5f7f59463cc760ee",
    "для забрудненої води": "940498ae6b2936be5f7f59463cc760ee",
    "малозабруднена": "ada4f205b3c365a80a2f9644f468b5fb",
}

# Кількість фаз (paramcode: 2776)
PHASES_MAPPING: Dict[str, str] = {
    "однофазний": "d9e50581ede2e8ac09af1dbb39636b47",
    "трифазний": "6dba252403199a837f18dd83aa887060",
}

# Захист сухого ходу (paramcode: 2772)
DRY_RUN_PROTECTION_MAPPING: Dict[str, str] = {
    "так": "101d0900f2aabe2112f0b99534445889",
    "з захистом": "101d0900f2aabe2112f0b99534445889",
    "ні": "a6779d4e59fbb0212b0a4478b72b03d2",
    "без захисту": "a6779d4e59fbb0212b0a4478b72b03d2",
}

# ==============================================================================
# МАППИНГИ АТРИБУТІВ ДЛЯ ГЕНЕРАТОРІВ (категорія 2776)
# ==============================================================================

# Кількість фаз генератора (paramcode: 8210)
GENERATOR_PHASES_MAPPING: Dict[str, str] = {
    "універсальний": "6bcffd876e7953d29fb2c185e2bfe717",
    "універсальний (220/380 в)": "6bcffd876e7953d29fb2c185e2bfe717",
    "трифазний": "529b5fae5b0a659bf754568190a3b59c",
    "трифазний (380 в)": "529b5fae5b0a659bf754568190a3b59c",
    "однофазний": "6c44b6c8702757f86bcaa6ec273252cc",
    "однофазний (220 в)": "6c44b6c8702757f86bcaa6ec273252cc",
}

# Запуск двигуна генератора (paramcode: 8073)
GENERATOR_START_MAPPING: Dict[str, str] = {
    "ручний стартер": "f9c335c80357fb826a26a5f8de02d913",
    "ручний": "f9c335c80357fb826a26a5f8de02d913",
    "електростартер": "8747bb0d839191d2ca30ea8d1a94aba6",
    "електричний": "8747bb0d839191d2ca30ea8d1a94aba6",
    "автоматичний": "035ec18cf93f108fe423ec62d5214419",
    "автоматичний (авр)": "035ec18cf93f108fe423ec62d5214419",
}

# Вид палива (paramcode: 8072)
FUEL_TYPE_MAPPING: Dict[str, str] = {
    "бензин": "8100d7051681f8c77fc03ea3f632e090",
    "газ": "3c0ce8b5511491771a93a409f24b44b9",
    "дизель": "cab67198b0688a5557c5f989dcf52f08",
    "газ/бензин": "2e1cf135b6ff0c8d1162c693fa9e858e",
}

# Наявність коліс (paramcode: 8077)
HAS_WHEELS_MAPPING: Dict[str, str] = {
    "так": "yes",
    "ні": "no",
    "yes": "yes",
    "no": "no",
}

# API токен Эпицентра (для роботи з замовленнями)
EPICENTR_API_TOKEN: str = "mp_2611f45fca47a22dd71da3831576833ae7f6d0344306418a97a0e3713a3db95880b6868e7bbd54a85aedecbb7bb6edaafa186a4f820e843a66644f29ef501bb9"

# ==============================================================================
# ЛОГИРОВАНИЕ
# ==============================================================================

def setup_logging(verbose: bool = False) -> logging.Logger:
    """Настройка логирования"""
    level = logging.DEBUG if verbose else logging.INFO
    
    logging.basicConfig(
        level=level,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    return logging.getLogger(__name__)

logger = setup_logging()

# ==============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ==============================================================================

def clean_cdata(text: Optional[str]) -> str:
    """Убирает CDATA обёртку и HTML-entities из текста"""
    if text is None:
        return ""
    text = text.replace("<![CDATA[", "").replace("]]>", "")
    text = unescape(text)
    return text.strip()


def extract_param_value(offer_elem: ET.Element, param_name: str) -> Optional[str]:
    """Извлекает значение параметра по имени"""
    for param in offer_elem.findall('param'):
        if param.get('name') == param_name:
            return param.text
    return None


def convert_cm_to_mm(value_cm: Optional[str]) -> Optional[int]:
    """Конвертирует сантиметры в миллиметры"""
    if value_cm is None:
        return None
    try:
        value = float(value_cm.replace(',', '.'))
        return int(value * 10)
    except (ValueError, AttributeError):
        return None


def convert_kg_to_g(value_kg: Optional[str]) -> Optional[int]:
    """Конвертирует килограммы в граммы"""
    if value_kg is None:
        return None
    try:
        value = float(value_kg.replace(',', '.'))
        return int(value * 1000)
    except (ValueError, AttributeError):
        return None


def get_availability_status(stock_quantity: Optional[str], available: str) -> str:
    """
    Определяет статус наличия для Эпицентра
    
    Логика:
    - available="false" → out_of_stock
    - available="true" + stock_quantity > 0 → in_stock
    - available="true" + stock_quantity = 0 → under_the_order (под заказ)
    """
    if available == "false":
        return "out_of_stock"
    
    try:
        qty = int(stock_quantity) if stock_quantity else 0
    except ValueError:
        qty = 0
    
    if qty > 0:
        return "in_stock"
    elif available == "true":
        return "under_the_order"
    else:
        return "out_of_stock"


def ua_to_ru_transliterate(text: Optional[str]) -> str:
    """
    Простая транслитерация украинского текста в русский.
    
    ВАЖНО: Это базовый вариант! Для качественного перевода 
    рекомендуется использовать API переводчика (Google Translate, DeepL)
    или получить русские названия от поставщика.
    """
    if text is None:
        return ""
    
    replacements = {
        'і': 'и', 'І': 'И',
        'ї': 'и', 'Ї': 'И',
        'є': 'е', 'Є': 'Е',
        'ґ': 'г', 'Ґ': 'Г',
        "'": '',
    }
    
    result = text
    for ua, ru in replacements.items():
        result = result.replace(ua, ru)
    
    return result


def fetch_xml(url: str) -> str:
    """Загружает XML по URL"""
    logger.info(f"Загрузка XML: {url}")
    
    try:
        request = Request(url, headers={'User-Agent': 'AL-KO Epicentr Converter/1.0'})
        with urlopen(request, timeout=HTTP_TIMEOUT) as response:
            content = response.read().decode('utf-8')
            logger.info(f"Загружено {len(content)} байт")
            return content
    except HTTPError as e:
        logger.error(f"HTTP ошибка: {e.code} {e.reason}")
        raise
    except URLError as e:
        logger.error(f"URL ошибка: {e.reason}")
        raise
    except Exception as e:
        logger.error(f"Ошибка загрузки: {e}")
        raise

# ==============================================================================
# ОСНОВНАЯ ЛОГИКА КОНВЕРТАЦИИ
# ==============================================================================

def process_offer(offer: ET.Element) -> Optional[Dict]:
    """Обрабатывает один товар (offer) из XML AL-KO"""
    
    offer_id = offer.get('id')
    available = offer.get('available', 'false')
    
    # Базовые поля
    price = offer.findtext('price', '')
    stock_quantity = offer.findtext('stock_quantity', '0')
    category_id = offer.findtext('categoryId', '')
    picture = offer.findtext('picture', '')
    
    # Название и описание
    name_ua = clean_cdata(offer.findtext('name_ua', ''))
    description_ua = clean_cdata(offer.findtext('description_ua', ''))
    
    # Пропускаем товары без названия
    if not name_ua:
        logger.warning(f"Товар {offer_id}: пропущен (нет названия)")
        return None

    # Пропускаем товары без цены
    if not price or price == '0':
        logger.warning(f"Товар {offer_id}: пропущен (нет цены)")
        return None
    
    # Русская версия (транслитерация)
    name_ru = ua_to_ru_transliterate(name_ua)
    description_ru = ua_to_ru_transliterate(description_ua)
    
    # Параметры упаковки
    barcode = extract_param_value(offer, 'Штрихкод')
    width_cm = extract_param_value(offer, 'Ширина упаковки, см')
    length_cm = extract_param_value(offer, 'Довжина упаковки, см')
    height_cm = extract_param_value(offer, 'Висота упаковки, см')
    weight_kg = extract_param_value(offer, 'Вага, кг')
    country = extract_param_value(offer, 'Країна-виробник товару')

    # Дополнительные параметры для газонокосарок
    power_type = extract_param_value(offer, 'Тип')  # акумуляторна, бензинова, електрична
    mower_type = extract_param_value(offer, 'Тип')  # используется для обоих атрибутов
    drive_type = extract_param_value(offer, 'Тип переміщення')  # самохідна/не самохідна
    cutting_width = extract_param_value(offer, 'Ширина захвату')  # в см
    cutting_height = extract_param_value(offer, 'Висота зрізу')  # диапазон, напр. "25-75 мм"
    features = extract_param_value(offer, 'Особливості')  # содержит мульчування, боковий викид и др.

    # Параметры для мотокос/тримерів
    cutting_system = extract_param_value(offer, 'Ріжуча система')  # ніж, ліска
    engine_type = extract_param_value(offer, 'Тип двигуна')
    shaft_type = extract_param_value(offer, 'Конструкція штанги')  # пряма, вигнута
    trim_width = extract_param_value(offer, 'Ширина зрізу')  # в см

    # Параметры для пил
    power_source = extract_param_value(offer, 'Джерело живлення') or extract_param_value(offer, 'Живлення')
    bar_length = extract_param_value(offer, 'Довжина шини, мм') or extract_param_value(offer, 'Довжина шини')
    product_class = extract_param_value(offer, 'Клас')
    engine_placement = extract_param_value(offer, 'Розміщення двигуна') or extract_param_value(offer, 'Розміщення двигуна в пилі')

    # Параметры для снігоприбиральної техніки
    snow_width = extract_param_value(offer, 'Ширина захвату снігу')
    throw_distance = extract_param_value(offer, 'Дальність викиду снігу')
    equipment_type = extract_param_value(offer, 'Вид')

    # Параметры для акумуляторів
    battery_type = extract_param_value(offer, 'Тип акумулятора')
    battery_capacity = extract_param_value(offer, 'Ємність')
    voltage = extract_param_value(offer, 'Напруга, В') or extract_param_value(offer, 'Напруга акумулятора, В')

    # Параметры для культиваторів
    start_type = extract_param_value(offer, 'Система пуску') or extract_param_value(offer, 'Тип запуску')
    work_width = extract_param_value(offer, 'Ширина захвату культивації') or extract_param_value(offer, 'Робоча ширина')
    work_depth = extract_param_value(offer, 'Робоча глибина')

    # Параметры для насосів
    pump_purpose = extract_param_value(offer, 'Призначення')
    max_head = extract_param_value(offer, 'Висота подачі')
    pump_capacity = extract_param_value(offer, 'Продуктивність')
    phases = extract_param_value(offer, 'Кількість фаз')
    dry_protection = extract_param_value(offer, 'Система захисту')

    # Параметры для генераторів
    fuel_type = extract_param_value(offer, 'Вид палива') or extract_param_value(offer, 'Паливо')
    nom_power = extract_param_value(offer, 'Номінальна потужність, кВт')
    engine_volume = extract_param_value(offer, 'Об\'єм двигуна, см³') or extract_param_value(offer, 'Об\'єм двигуна')
    tank_volume = extract_param_value(offer, 'Об\'єм паливного баку')

    # Параметры для подрібнювачів
    max_branch_diam = extract_param_value(offer, 'Ріжуча здатність')
    power_kw = extract_param_value(offer, 'Потужність, кВт') or extract_param_value(offer, 'Потужність')

    # Параметры для аераторів
    aerator_width = extract_param_value(offer, 'Робоча ширина')
    aerator_power = extract_param_value(offer, 'Потужність двигуна, кВт')
    aerator_depth = extract_param_value(offer, 'Глибина проникнення')

    # Определяем наличие мульчування и бокового викиду из Особливостей
    has_mulching = 'ні'
    has_side_discharge = 'ні'
    has_height_adjustment = 'ні'

    if features:
        features_lower = features.lower()
        if 'мульч' in features_lower:
            has_mulching = 'так'
        if 'боков' in features_lower and 'викид' in features_lower:
            has_side_discharge = 'так'
        if 'регулювання висоти' in features_lower or 'регулювання висоти зрізу' in features_lower:
            has_height_adjustment = 'так'

    # Конвертация единиц измерения
    width_mm = convert_cm_to_mm(width_cm)
    length_mm = convert_cm_to_mm(length_cm)
    height_mm = convert_cm_to_mm(height_cm)
    weight_g = convert_kg_to_g(weight_kg)

    # Ширина захвата в мм (из см)
    cutting_width_mm = None
    if cutting_width:
        try:
            cutting_width_mm = int(float(cutting_width.replace(',', '.')) * 10)
        except ValueError:
            pass

    # Маппинг категории
    category_info = CATEGORY_MAPPING.get(category_id, ('XXXX', 'Невизначена категорія'))

    # Маппинг страны
    country_info = COUNTRY_MAPPING.get(country, (None, country)) if country else (None, None)

    # Маппинг атрибутов для газонокосарок
    power_type_code = POWER_TYPE_MAPPING.get(power_type.lower() if power_type else '', None)
    mower_type_code = MOWER_TYPE_MAPPING.get(mower_type.lower() if mower_type else '', None)
    drive_type_code = DRIVE_TYPE_MAPPING.get(drive_type.lower() if drive_type else '', None)
    mulching_code = MULCHING_MAPPING.get(has_mulching, None)
    height_adj_code = HEIGHT_ADJUSTMENT_MAPPING.get(has_height_adjustment, None)
    side_discharge_code = SIDE_DISCHARGE_MAPPING.get(has_side_discharge, None)

    # Маппинг атрибутов для мотокос/тримерів
    trimmer_type_code = TRIMMER_TYPE_MAPPING.get(power_type.lower() if power_type else '', None)
    engine_type_code = ENGINE_TYPE_MAPPING.get(engine_type.lower() if engine_type else '', None)
    cutting_element_code = CUTTING_ELEMENT_MAPPING.get(cutting_system.lower() if cutting_system else '', None)

    # Маппинг атрибутов для пил
    voltage_code = VOLTAGE_MAPPING.get(str(voltage).replace(',', '.').split('.')[0] if voltage else '', None)
    class_code = CLASS_MAPPING.get(product_class.lower() if product_class else '', None)
    engine_placement_code = ENGINE_PLACEMENT_MAPPING.get(engine_placement.lower() if engine_placement else '', None)

    # Маппинг для снігоприбиральної техніки
    snow_type_code = SNOW_EQUIPMENT_TYPE_MAPPING.get(equipment_type.lower() if equipment_type else '', None)

    # Маппинг для акумуляторів
    battery_view_code = BATTERY_TYPE_VIEW_MAPPING.get(equipment_type.lower() if equipment_type else '', None)
    battery_chemistry_code = BATTERY_CHEMISTRY_MAPPING.get(battery_type.lower() if battery_type else '', None)
    capacity_code = None
    if battery_capacity:
        cap_clean = battery_capacity.replace(' А-год', '').replace(' Ah', '').replace(',', '.').strip()
        capacity_code = CAPACITY_MAPPING.get(cap_clean, None)

    # Маппинг для культиваторів
    start_type_code = START_TYPE_MAPPING.get(start_type.lower() if start_type else '', None)

    # Маппинг для насосів
    pump_type_code = PUMP_TYPE_MAPPING.get(pump_purpose.lower() if pump_purpose else '', None)
    phases_code = PHASES_MAPPING.get(phases.lower() if phases else '', None)
    liquid_type_code = None
    if pump_purpose:
        liquid_type_code = LIQUID_TYPE_MAPPING.get(pump_purpose.lower(), None)

    # Маппинг для генераторів
    generator_phases_code = GENERATOR_PHASES_MAPPING.get(phases.lower() if phases else '', None)
    generator_start_code = GENERATOR_START_MAPPING.get(start_type.lower() if start_type else '', None)
    fuel_type_code = FUEL_TYPE_MAPPING.get(fuel_type.lower() if fuel_type else '', None)

    # Статус наличия
    availability_status = get_availability_status(stock_quantity, available)

    return {
        'id': offer_id,
        'available': available,
        'price': price,
        'availability': availability_status,
        'category_code': category_info[0],
        'category_name': category_info[1],
        'category_id': category_id,  # исходный ID категории AL-KO
        'picture': picture,
        'name_ua': name_ua,
        'name_ru': name_ru,
        'description_ua': description_ua,
        'description_ru': description_ru,
        'width': width_mm,
        'height': height_mm,
        'length': length_mm,
        'weight': weight_g,
        'barcode': barcode,
        'country_code': country_info[0] if country_info else None,
        'country_name': country_info[1] if country_info else None,
        # Дополнительные атрибуты для газонокосарок
        'power_type_code': power_type_code,
        'power_type': power_type,
        'mower_type_code': mower_type_code,
        'drive_type_code': drive_type_code,
        'cutting_width_mm': cutting_width_mm,
        'cutting_height': cutting_height,
        'mulching_code': mulching_code,
        'height_adj_code': height_adj_code,
        'side_discharge_code': side_discharge_code,
        # Атрибуты для мотокос/тримерів
        'trimmer_type_code': trimmer_type_code,
        'engine_type_code': engine_type_code,
        'engine_type': engine_type,
        'cutting_element_code': cutting_element_code,
        'cutting_system': cutting_system,
        'trim_width': trim_width,
        # Атрибуты для пил
        'voltage_code': voltage_code,
        'voltage': voltage,
        'class_code': class_code,
        'product_class': product_class,
        'engine_placement_code': engine_placement_code,
        'bar_length': bar_length,
        'power_source': power_source,
        # Атрибуты для снігоприбиральної техніки
        'snow_type_code': snow_type_code,
        'equipment_type': equipment_type,
        'snow_width': snow_width,
        'throw_distance': throw_distance,
        # Атрибуты для акумуляторів
        'battery_view_code': battery_view_code,
        'battery_chemistry_code': battery_chemistry_code,
        'battery_type': battery_type,
        'capacity_code': capacity_code,
        'battery_capacity': battery_capacity,
        # Атрибуты для культиваторів
        'start_type_code': start_type_code,
        'start_type': start_type,
        'work_width': work_width,
        'work_depth': work_depth,
        # Атрибуты для насосів
        'pump_type_code': pump_type_code,
        'phases_code': phases_code,
        'phases': phases,
        'liquid_type_code': liquid_type_code,
        'pump_purpose': pump_purpose,
        'max_head': max_head,
        'pump_capacity': pump_capacity,
        # Атрибуты для генераторів
        'generator_phases_code': generator_phases_code,
        'generator_start_code': generator_start_code,
        'fuel_type_code': fuel_type_code,
        'fuel_type': fuel_type,
        'nom_power': nom_power,
        'engine_volume': engine_volume,
        'tank_volume': tank_volume,
        # Атрибуты для подрібнювачів
        'max_branch_diam': max_branch_diam,
        'power_kw': power_kw,
        # Атрибуты для аераторів
        'aerator_width': aerator_width,
        'aerator_power': aerator_power,
    }


def process_alko_xml(source_xml: str) -> List[Dict]:
    """Обрабатывает весь XML-фид AL-KO"""
    
    logger.info("Парсинг XML...")
    root = ET.fromstring(source_xml)
    
    offers_data = []
    total = 0
    skipped = 0
    
    for offer in root.findall('.//offer'):
        total += 1
        offer_data = process_offer(offer)
        
        if offer_data:
            offers_data.append(offer_data)
        else:
            skipped += 1
    
    logger.info(f"Обработано: {total} товаров, пропущено: {skipped}")
    return offers_data


def escape_html_for_xml(text: str) -> str:
    """Экранирует HTML-теги для включения в XML (как в шаблоне Epicentr)"""
    if not text:
        return ""
    # Заменяем HTML-теги на escaped версии
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    return text


def create_epicentr_xml(offers_data: List[Dict]) -> ET.Element:
    """Создаёт XML в формате Эпицентра (по официальному шаблону)"""

    date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    root = ET.Element('yml_catalog')
    root.set('date', date_str)

    offers_elem = ET.SubElement(root, 'offers')

    for offer_data in offers_data:
        offer = ET.SubElement(offers_elem, 'offer')
        offer.set('id', offer_data['id'])
        offer.set('available', offer_data['available'])

        # Цена
        ET.SubElement(offer, 'price').text = offer_data['price']

        # Категория с кодом
        if offer_data.get('category_code') and offer_data['category_code'] != 'XXXX':
            category = ET.SubElement(offer, 'category')
            category.set('code', offer_data['category_code'])
            category.text = offer_data['category_name']

            # attribute_set (такой же как категория)
            attr_set = ET.SubElement(offer, 'attribute_set')
            attr_set.set('code', offer_data['category_code'])
            attr_set.text = offer_data['category_name']

        # Названия (ru + ua)
        name_ru = ET.SubElement(offer, 'name')
        name_ru.set('lang', 'ru')
        name_ru.text = offer_data['name_ru']

        name_ua = ET.SubElement(offer, 'name')
        name_ua.set('lang', 'ua')
        name_ua.text = offer_data['name_ua']

        # Изображения (может быть несколько)
        if offer_data.get('picture'):
            ET.SubElement(offer, 'picture').text = offer_data['picture']

        # Описания с escaped HTML (ru + ua)
        if offer_data.get('description_ru'):
            desc_ru = ET.SubElement(offer, 'description')
            desc_ru.set('lang', 'ru')
            desc_ru.text = escape_html_for_xml(offer_data['description_ru'])

        if offer_data.get('description_ua'):
            desc_ua = ET.SubElement(offer, 'description')
            desc_ua.set('lang', 'ua')
            desc_ua.text = escape_html_for_xml(offer_data['description_ua'])

        # Бренд (vendor) - отдельный тег
        vendor = ET.SubElement(offer, 'vendor')
        if ALKO_BRAND_CODE != 'XXXXXX':
            vendor.set('code', ALKO_BRAND_CODE)
        vendor.text = 'AL-KO'

        # Страна-производитель - отдельный тег
        if offer_data.get('country_name'):
            country = ET.SubElement(offer, 'country_of_origin')
            if offer_data.get('country_code'):
                country.set('code', offer_data['country_code'])
            country.text = offer_data['country_name']

        # Обязательные параметры
        # Міра виміру
        param_measure = ET.SubElement(offer, 'param')
        param_measure.set('name', 'Міра виміру')
        param_measure.set('paramcode', 'measure')
        param_measure.set('valuecode', 'measure_pcs')
        param_measure.text = 'шт.'

        # Мінімальна кратність товару
        param_ratio = ET.SubElement(offer, 'param')
        param_ratio.set('name', 'Мінімальна кратність товару')
        param_ratio.set('paramcode', 'ratio')
        param_ratio.text = '1'

        # Вага (если есть) - как param
        if offer_data.get('weight'):
            param_weight = ET.SubElement(offer, 'param')
            param_weight.set('name', 'Вага')
            param_weight.set('paramcode', '762')
            # Вес в кг (конвертируем обратно из граммов)
            weight_kg = offer_data['weight'] / 1000
            param_weight.text = str(weight_kg)

        # Штрих-код (если есть)
        if offer_data.get('barcode'):
            param_barcode = ET.SubElement(offer, 'param')
            param_barcode.set('name', 'Штрих-код')
            param_barcode.set('paramcode', 'barcode')
            param_barcode.text = offer_data['barcode']

        # Габариты - отдельные теги width/height/length (в мм)
        if offer_data.get('width'):
            ET.SubElement(offer, 'width').text = str(offer_data['width'])

        if offer_data.get('height'):
            ET.SubElement(offer, 'height').text = str(offer_data['height'])

        # Глибина (length) - обязательное поле
        if offer_data.get('length'):
            param_length = ET.SubElement(offer, 'param')
            param_length.set('name', 'Глибина')
            param_length.set('paramcode', 'length')
            param_length.text = str(offer_data['length'])

        # ============================================================
        # ДОПОЛНИТЕЛЬНЫЕ ОБЯЗАТЕЛЬНЫЕ АТРИБУТЫ ДЛЯ ГАЗОНОКОСАРОК (451)
        # ============================================================
        if offer_data.get('category_id') == '1':  # Газонокосарки

            # Тип живлення (10839) - ОБЯЗАТЕЛЬНЫЙ
            if offer_data.get('power_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип живлення')
                param.set('paramcode', '10839')
                param.set('valuecode', offer_data['power_type_code'])
                # Определяем текстовое значение по коду
                power_texts = {
                    '3455f43540ae397424ef79f4725d1055': 'акумулятор',
                    '70eae2a029fa19a519283e1564a05708': 'бензин',
                    '1c6ca8ac42c3fd6a68b09b78ca40c4b3': 'електромережа',
                }
                param.text = power_texts.get(offer_data['power_type_code'], 'акумулятор')

            # Тип (10868) - ОБЯЗАТЕЛЬНЫЙ
            if offer_data.get('mower_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип')
                param.set('paramcode', '10868')
                param.set('valuecode', offer_data['mower_type_code'])
                mower_texts = {
                    '72e3b7e6f2d9d699be73b9731f25cea6': 'акумуляторна',
                    '3942e93c16065b166e0408038bdfdead': 'електрична',
                    '681b8f305e80c57c327841d5a0ba5d15': 'бензинова',
                }
                param.text = mower_texts.get(offer_data['mower_type_code'], 'акумуляторна')

            # Ширина захвату (8450) - ОБЯЗАТЕЛЬНЫЙ, в мм
            if offer_data.get('cutting_width_mm'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Ширина захвату')
                param.set('paramcode', '8450')
                param.text = str(offer_data['cutting_width_mm'])

            # Висота зрізу (10869) - ОБЯЗАТЕЛЬНЫЙ, текст
            if offer_data.get('cutting_height'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Висота зрізу')
                param.set('paramcode', '10869')
                param.text = offer_data['cutting_height']

            # Тип приводу (9163) - ОБЯЗАТЕЛЬНЫЙ
            if offer_data.get('drive_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип приводу')
                param.set('paramcode', '9163')
                param.set('valuecode', offer_data['drive_type_code'])
                drive_texts = {
                    'fecd400275e72a1f70548444dbd26465': 'самохідна',
                    'fcc2b4433c41f78c8f1276b6df871ef2': 'несамохідна',
                }
                param.text = drive_texts.get(offer_data['drive_type_code'], 'несамохідна')

            # Функція мульчування (12018) - ОБЯЗАТЕЛЬНЫЙ
            if offer_data.get('mulching_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Функція мульчування')
                param.set('paramcode', '12018')
                param.set('valuecode', offer_data['mulching_code'])
                param.text = 'так' if offer_data['mulching_code'] == '578ef7874a9b4952e9ae026893f1e68c' else 'ні'

            # Центральне регулювання висоти (12019) - ОБЯЗАТЕЛЬНЫЙ
            if offer_data.get('height_adj_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Центральне регулювання висоти')
                param.set('paramcode', '12019')
                param.set('valuecode', offer_data['height_adj_code'])
                param.text = 'так' if offer_data['height_adj_code'] == 'c3450a1a676eabe4db416775fc8ad8ed' else 'ні'

            # Боковий викид (12020) - ОБЯЗАТЕЛЬНЫЙ
            if offer_data.get('side_discharge_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Боковий викид')
                param.set('paramcode', '12020')
                param.set('valuecode', offer_data['side_discharge_code'])
                param.text = 'так' if offer_data['side_discharge_code'] == 'ac787cd31ed5ec2f40765d63fdf38fb9' else 'ні'

        # ============================================================
        # АТРИБУТИ ДЛЯ МОТОКОС/ТРИМЕРІВ (категорія 3819, AL-KO cat 2)
        # ============================================================
        elif offer_data.get('category_id') == '2':  # Мотокоси і тримери

            # Тип живлення (10839)
            if offer_data.get('power_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип живлення')
                param.set('paramcode', '10839')
                param.set('valuecode', offer_data['power_type_code'])
                param.text = offer_data.get('power_type', 'акумулятор')

            # Тип (10884)
            if offer_data.get('trimmer_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип')
                param.set('paramcode', '10884')
                param.set('valuecode', offer_data['trimmer_type_code'])
                param.text = offer_data.get('power_type', 'тример')

            # Тип двигуна (4519)
            if offer_data.get('engine_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип двигуна')
                param.set('paramcode', '4519')
                param.set('valuecode', offer_data['engine_type_code'])
                param.text = offer_data.get('engine_type', 'електричний')

            # Тип ріжучого елемента (10861)
            if offer_data.get('cutting_element_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип ріжучого елемента')
                param.set('paramcode', '10861')
                param.set('valuecode', offer_data['cutting_element_code'])
                param.text = offer_data.get('cutting_system', 'волосінь')

            # Ширина зрізу (1609) - масив, але передаємо як текст
            if offer_data.get('trim_width'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Ширина зрізу')
                param.set('paramcode', '1609')
                param.text = str(offer_data['trim_width'])

        # ============================================================
        # АТРИБУТИ ДЛЯ КУЩОРІЗІВ (категорія 454, AL-KO cat 3, 4)
        # ============================================================
        elif offer_data.get('category_id') in ['3', '4']:

            # Тип живлення (10839)
            if offer_data.get('power_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип живлення')
                param.set('paramcode', '10839')
                param.set('valuecode', offer_data['power_type_code'])
                param.text = offer_data.get('power_type', 'акумулятор')

        # ============================================================
        # АТРИБУТИ ДЛЯ АЕРАТОРІВ (категорія 455, AL-KO cat 5)
        # ============================================================
        elif offer_data.get('category_id') == '5':

            # Робоча ширина (8360)
            if offer_data.get('aerator_width'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Робоча ширина')
                param.set('paramcode', '8360')
                # Конвертуємо см в мм якщо потрібно
                try:
                    width_val = float(str(offer_data['aerator_width']).replace('см', '').replace(',', '.').strip())
                    if width_val < 100:  # если меньше 100, то это см
                        width_val = width_val * 10
                    param.text = str(int(width_val))
                except:
                    param.text = str(offer_data['aerator_width'])

            # Потужність двигуна (4353)
            if offer_data.get('aerator_power'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Потужність двигуна')
                param.set('paramcode', '4353')
                param.text = str(offer_data['aerator_power']).replace('кВт', '').strip()

            # Потужність (6078)
            if offer_data.get('power_kw'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Потужність')
                param.set('paramcode', '6078')
                param.text = str(offer_data['power_kw']).replace('кВт', '').strip()

        # ============================================================
        # АТРИБУТИ ДЛЯ ЕЛЕКТРОПИЛ (категорія 6829, AL-KO cat 6)
        # ============================================================
        elif offer_data.get('category_id') == '6':

            # Тип живлення (10839)
            if offer_data.get('power_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип живлення')
                param.set('paramcode', '10839')
                param.set('valuecode', offer_data['power_type_code'])
                param.text = offer_data.get('power_source', 'електромережа')

            # Напруга (8309)
            if offer_data.get('voltage_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Напруга')
                param.set('paramcode', '8309')
                param.set('valuecode', offer_data['voltage_code'])
                param.text = str(offer_data.get('voltage', '230'))

            # Клас (2364)
            if offer_data.get('class_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Клас')
                param.set('paramcode', '2364')
                param.set('valuecode', offer_data['class_code'])
                param.text = offer_data.get('product_class', 'побутовий')

        # ============================================================
        # АТРИБУТИ ДЛЯ СНІГОПРИБИРАЛЬНОЇ ТЕХНІКИ (категорія 462, AL-KO cat 7)
        # ============================================================
        elif offer_data.get('category_id') == '7':

            # Вид (51)
            if offer_data.get('snow_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Вид')
                param.set('paramcode', '51')
                param.set('valuecode', offer_data['snow_type_code'])
                param.text = offer_data.get('equipment_type', 'снігоприбиральна машина')

            # Ширина захвату (8450)
            if offer_data.get('snow_width'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Ширина захвату')
                param.set('paramcode', '8450')
                try:
                    width_val = float(str(offer_data['snow_width']).replace('см', '').replace(',', '.').strip())
                    if width_val < 100:  # см -> мм
                        width_val = width_val * 10
                    param.text = str(int(width_val))
                except:
                    param.text = str(offer_data['snow_width'])

            # Дальність викиду снігу (10904)
            if offer_data.get('throw_distance'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Дальність викиду снігу')
                param.set('paramcode', '10904')
                try:
                    dist = str(offer_data['throw_distance']).replace('до', '').replace('м', '').strip()
                    param.text = str(float(dist.replace(',', '.')))
                except:
                    param.text = str(offer_data['throw_distance'])

        # ============================================================
        # АТРИБУТИ ДЛЯ ВИСОТОРІЗІВ (категорія 6832, AL-KO cat 8)
        # ============================================================
        elif offer_data.get('category_id') == '8':

            # Тип живлення (10839)
            if offer_data.get('power_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип живлення')
                param.set('paramcode', '10839')
                param.set('valuecode', offer_data['power_type_code'])
                param.text = offer_data.get('power_source', 'акумулятор')

            # Розміщення двигуна (10856)
            if offer_data.get('engine_placement_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Розміщення двигуна')
                param.set('paramcode', '10856')
                param.set('valuecode', offer_data['engine_placement_code'])
                param.text = offer_data.get('engine_placement', 'пряме')

            # Напруга (8309)
            if offer_data.get('voltage_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Напруга')
                param.set('paramcode', '8309')
                param.set('valuecode', offer_data['voltage_code'])
                param.text = str(offer_data.get('voltage', '36'))

            # Довжина шини (10851)
            if offer_data.get('bar_length'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Довжина шини')
                param.set('paramcode', '10851')
                try:
                    bar_len = str(offer_data['bar_length']).replace('см', '').replace('мм', '').replace(',', '.').strip()
                    bar_mm = float(bar_len)
                    if bar_mm < 100:  # це см
                        bar_mm = bar_mm * 10
                    param.text = str(int(bar_mm))
                except:
                    param.text = str(offer_data['bar_length'])

        # ============================================================
        # АТРИБУТИ ДЛЯ АКУМУЛЯТОРІВ (категорія 6667, AL-KO cat 10, 13, 28)
        # ============================================================
        elif offer_data.get('category_id') in ['10', '13', '28']:

            # Вид (2917)
            if offer_data.get('battery_view_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Вид')
                param.set('paramcode', '2917')
                param.set('valuecode', offer_data['battery_view_code'])
                param.text = offer_data.get('equipment_type', 'батарея акумуляторна')

            # Тип акумулятора (7358)
            if offer_data.get('battery_chemistry_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип акумулятора')
                param.set('paramcode', '7358')
                param.set('valuecode', offer_data['battery_chemistry_code'])
                param.text = offer_data.get('battery_type', 'Li-ion')

            # Напруга (8309)
            if offer_data.get('voltage_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Напруга')
                param.set('paramcode', '8309')
                param.set('valuecode', offer_data['voltage_code'])
                param.text = str(offer_data.get('voltage', '18'))

            # Ємність (7352)
            if offer_data.get('capacity_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Ємність')
                param.set('paramcode', '7352')
                param.set('valuecode', offer_data['capacity_code'])
                cap = str(offer_data.get('battery_capacity', '')).replace(' А-год', '').replace(' Ah', '').strip()
                param.text = cap

        # ============================================================
        # АТРИБУТИ ДЛЯ КУЛЬТИВАТОРІВ (категорія 458, AL-KO cat 15)
        # ============================================================
        elif offer_data.get('category_id') == '15':

            # Тип живлення (10839)
            if offer_data.get('power_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип живлення')
                param.set('paramcode', '10839')
                param.set('valuecode', offer_data['power_type_code'])
                param.text = offer_data.get('power_type', 'бензин')

            # Запуск двигуна (9132)
            if offer_data.get('start_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Запуск двигуна')
                param.set('paramcode', '9132')
                param.set('valuecode', offer_data['start_type_code'])
                param.text = offer_data.get('start_type', 'ручний стартер')

            # Ширина обробки (10842)
            if offer_data.get('work_width'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Ширина обробки')
                param.set('paramcode', '10842')
                try:
                    w = str(offer_data['work_width']).replace('см', '').replace(',', '.').strip()
                    param.text = str(float(w))
                except:
                    param.text = str(offer_data['work_width'])

            # Глибина обробки (10843)
            if offer_data.get('work_depth'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Глибина обробки')
                param.set('paramcode', '10843')
                try:
                    d = str(offer_data['work_depth']).replace('см', '').replace(',', '.').strip()
                    param.text = str(float(d))
                except:
                    param.text = str(offer_data['work_depth'])

        # ============================================================
        # АТРИБУТИ ДЛЯ ПОДРІБНЮВАЧІВ (категорія 457, AL-KO cat 20)
        # ============================================================
        elif offer_data.get('category_id') == '20':

            # Тип ріжучого елемента (10861)
            if offer_data.get('cutting_element_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип ріжучого елемента')
                param.set('paramcode', '10861')
                param.set('valuecode', offer_data['cutting_element_code'])
                param.text = offer_data.get('cutting_system', 'ножова ріжуча система')

            # Максимальний діаметр гілки (10858)
            if offer_data.get('max_branch_diam'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Максимальний діаметр гілки')
                param.set('paramcode', '10858')
                try:
                    diam = str(offer_data['max_branch_diam']).replace('до', '').replace('см', '').replace('мм', '').replace(',', '.').strip()
                    param.text = str(float(diam))
                except:
                    param.text = str(offer_data['max_branch_diam'])

            # Потужність (6078)
            if offer_data.get('power_kw'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Потужність')
                param.set('paramcode', '6078')
                try:
                    pwr = str(offer_data['power_kw']).replace('кВт', '').replace(',', '.').strip()
                    param.text = str(float(pwr))
                except:
                    param.text = str(offer_data['power_kw'])

        # ============================================================
        # АТРИБУТИ ДЛЯ ГЕНЕРАТОРІВ (категорія 2776, AL-KO cat 23)
        # ============================================================
        elif offer_data.get('category_id') == '23':

            # Кількість фаз (8210)
            if offer_data.get('generator_phases_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Кількість фаз')
                param.set('paramcode', '8210')
                param.set('valuecode', offer_data['generator_phases_code'])
                param.text = offer_data.get('phases', 'однофазний')

            # Вид палива (8072)
            if offer_data.get('fuel_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Вид палива')
                param.set('paramcode', '8072')
                param.set('valuecode', offer_data['fuel_type_code'])
                param.text = offer_data.get('fuel_type', 'бензин')

            # Запуск двигуна (8073)
            if offer_data.get('generator_start_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Запуск двигуна')
                param.set('paramcode', '8073')
                param.set('valuecode', offer_data['generator_start_code'])
                param.text = offer_data.get('start_type', 'ручний стартер')

            # Номінальна потужність (8078)
            if offer_data.get('nom_power'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Номінальна потужність')
                param.set('paramcode', '8078')
                try:
                    pwr = str(offer_data['nom_power']).replace('кВт', '').replace(',', '.').strip()
                    param.text = str(float(pwr))
                except:
                    param.text = str(offer_data['nom_power'])

            # Об'єм двигуна (8313)
            if offer_data.get('engine_volume'):
                param = ET.SubElement(offer, 'param')
                param.set('name', "Об'єм двигуна")
                param.set('paramcode', '8313')
                try:
                    vol = str(offer_data['engine_volume']).replace('см³', '').replace('см3', '').replace(',', '.').strip()
                    param.text = str(float(vol))
                except:
                    param.text = str(offer_data['engine_volume'])

            # Об'єм паливного бака (8317)
            if offer_data.get('tank_volume'):
                param = ET.SubElement(offer, 'param')
                param.set('name', "Об'єм паливного бака")
                param.set('paramcode', '8317')
                try:
                    tank = str(offer_data['tank_volume']).replace('л', '').replace(',', '.').strip()
                    param.text = str(float(tank))
                except:
                    param.text = str(offer_data['tank_volume'])

        # ============================================================
        # АТРИБУТИ ДЛЯ ПОВЕРХНЕВИХ НАСОСІВ (категорія 1662, AL-KO cat 33, 34)
        # ============================================================
        elif offer_data.get('category_id') in ['33', '34']:

            # Тип насоса (12006)
            if offer_data.get('pump_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип насоса')
                param.set('paramcode', '12006')
                param.set('valuecode', offer_data['pump_type_code'])
                param.text = offer_data.get('pump_purpose', 'садовий')

            # Кількість фаз (2776)
            if offer_data.get('phases_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Кількість фаз')
                param.set('paramcode', '2776')
                param.set('valuecode', offer_data['phases_code'])
                param.text = offer_data.get('phases', 'однофазний')

            # Продуктивність (2790)
            if offer_data.get('pump_capacity'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Продуктивність')
                param.set('paramcode', '2790')
                try:
                    cap = str(offer_data['pump_capacity']).replace('л/год', '').replace(',', '.').strip()
                    param.text = str(float(cap))
                except:
                    param.text = str(offer_data['pump_capacity'])

            # Потужність (103)
            if offer_data.get('power_kw'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Потужність')
                param.set('paramcode', '103')
                try:
                    pwr = str(offer_data['power_kw']).replace('кВт', '').replace(',', '.').strip()
                    param.text = str(float(pwr))
                except:
                    param.text = str(offer_data['power_kw'])

        # ============================================================
        # АТРИБУТИ ДЛЯ ЗАНУРЮВАЛЬНИХ НАСОСІВ (категорія 1663, AL-KO cat 32)
        # ============================================================
        elif offer_data.get('category_id') == '32':

            # Тип насоса (12006)
            if offer_data.get('pump_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип насоса')
                param.set('paramcode', '12006')
                param.set('valuecode', offer_data['pump_type_code'])
                param.text = offer_data.get('pump_purpose', 'дренажний')

            # Тип рідини (11999)
            if offer_data.get('liquid_type_code'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Тип рідини')
                param.set('paramcode', '11999')
                param.set('valuecode', offer_data['liquid_type_code'])
                param.text = offer_data.get('pump_purpose', 'чиста')

            # Продуктивність (2790)
            if offer_data.get('pump_capacity'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Продуктивність')
                param.set('paramcode', '2790')
                try:
                    cap = str(offer_data['pump_capacity']).replace('л/год', '').replace(',', '.').strip()
                    param.text = str(float(cap))
                except:
                    param.text = str(offer_data['pump_capacity'])

            # Максимальний напір (2779)
            if offer_data.get('max_head'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Максимальний напір')
                param.set('paramcode', '2779')
                try:
                    head = str(offer_data['max_head']).replace('м', '').replace(',', '.').strip()
                    param.text = str(float(head))
                except:
                    param.text = str(offer_data['max_head'])

            # Потужність (103)
            if offer_data.get('power_kw'):
                param = ET.SubElement(offer, 'param')
                param.set('name', 'Потужність')
                param.set('paramcode', '103')
                try:
                    pwr = str(offer_data['power_kw']).replace('кВт', '').replace(',', '.').strip()
                    param.text = str(float(pwr))
                except:
                    param.text = str(offer_data['power_kw'])

    return root


def prettify_xml(elem: ET.Element) -> str:
    """Форматирует XML с отступами (формат Epicentr)"""

    rough_string = ET.tostring(elem, encoding='unicode')

    # Форматирование с отступами
    try:
        reparsed = minidom.parseString(rough_string)
        pretty = reparsed.toprettyxml(indent="  ", encoding=None)
        lines = [l for l in pretty.split('\n') if l.strip()]
        if lines[0].startswith('<?xml'):
            lines[0] = '<?xml version="1.0" encoding="UTF-8" ?>'
        return '\n'.join(lines)
    except Exception as e:
        logger.warning(f"Ошибка форматирования XML: {e}")
        return '<?xml version="1.0" encoding="UTF-8" ?>\n' + rough_string


def check_mappings(offers_data: List[Dict]) -> Dict[str, set]:
    """Проверяет заполненность маппингов"""
    
    issues = {
        'unmapped_categories': set(),
        'unmapped_countries': set(),
        'missing_brand': ALKO_BRAND_CODE == 'XXXXXX',
    }
    
    for offer in offers_data:
        if offer['category_code'] == 'XXXX':
            issues['unmapped_categories'].add(offer['category_name'])
        if offer.get('country_name') and not offer.get('country_code'):
            issues['unmapped_countries'].add(offer['country_name'])
    
    return issues

# ==============================================================================
# MAIN
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Конвертер XML-фида AL-KO в формат Эпицентра',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Примеры:
  python3 alko_to_epicentr.py
  python3 alko_to_epicentr.py --output /var/www/feeds/epicentr.xml
  python3 alko_to_epicentr.py --dry-run --verbose
        """
    )
    parser.add_argument(
        '--input', '-i',
        default=SOURCE_XML_URL,
        help=f'Путь к исходному XML или URL (по умолчанию: {SOURCE_XML_URL})'
    )
    parser.add_argument(
        '--output', '-o',
        default=DEFAULT_OUTPUT,
        help=f'Путь к выходному файлу (по умолчанию: {DEFAULT_OUTPUT})'
    )
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Тестовый запуск без сохранения файла'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Подробный вывод'
    )
    
    args = parser.parse_args()
    
    # Настройка логирования
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    logger.info("=" * 60)
    logger.info("AL-KO → Эпицентр XML Converter")
    logger.info("=" * 60)
    
    try:
        # Загрузка исходного XML
        if args.input.startswith('http'):
            source_xml = fetch_xml(args.input)
        else:
            logger.info(f"Чтение файла: {args.input}")
            with open(args.input, 'r', encoding='utf-8') as f:
                source_xml = f.read()
        
        # Обработка товаров
        offers_data = process_alko_xml(source_xml)
        logger.info(f"Успешно обработано: {len(offers_data)} товаров")
        
        # Проверка маппингов
        issues = check_mappings(offers_data)
        
        if issues['unmapped_categories']:
            logger.warning("⚠️  Незаполненные категории:")
            for cat in sorted(issues['unmapped_categories']):
                logger.warning(f"   - {cat}")
        
        if issues['unmapped_countries']:
            logger.warning("⚠️  Незаполненные страны:")
            for country in sorted(issues['unmapped_countries']):
                logger.warning(f"   - {country}")
        
        if issues['missing_brand']:
            logger.warning("⚠️  Не заполнен код бренда AL-KO (ALKO_BRAND_CODE)")
        
        # Генерация XML
        logger.info("Генерация XML для Эпицентра...")
        epicentr_xml = create_epicentr_xml(offers_data)
        pretty_xml = prettify_xml(epicentr_xml)
        
        # Сохранение
        if args.dry_run:
            logger.info("🔍 Dry-run режим - файл не сохранён")
            logger.info(f"Размер XML: {len(pretty_xml)} байт")
            # Показываем первый товар для проверки
            if offers_data:
                logger.debug(f"Первый товар: {offers_data[0]}")
        else:
            # Создаём директорию если нужно
            output_dir = os.path.dirname(args.output)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir)
            
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(pretty_xml)
            
            logger.info(f"✅ Файл сохранён: {args.output}")
            logger.info(f"   Размер: {len(pretty_xml)} байт")
            logger.info(f"   Товаров: {len(offers_data)}")
        
        # Итоги
        logger.info("=" * 60)
        if issues['unmapped_categories'] or issues['unmapped_countries'] or issues['missing_brand']:
            logger.info("📋 Следующие шаги:")
            logger.info("1. Получите коды через API Эпицентра")
            logger.info("2. Заполните маппинги в скрипте")
            logger.info("3. Запустите скрипт повторно")
        else:
            logger.info("✅ Конвертация завершена успешно!")
        
        return 0
        
    except Exception as e:
        logger.error(f"❌ Ошибка: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
