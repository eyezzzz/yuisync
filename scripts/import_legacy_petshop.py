#!/usr/bin/env python3
"""Importa Produtos.xls e Pessoas.xls para um tenant Petshop.

Uso (primeiro sem --execute para validar):
  python scripts/import_legacy_petshop.py --tenant-slug cliente-1
  python scripts/import_legacy_petshop.py --tenant-slug cliente-1 --execute

Requer xlrd 2.x para arquivos .xls e SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no .env.
Os registros existentes nao sao apagados fisicamente: ficam inativos para preservar
vendas, agenda e movimentos de estoque ja gravados. Um backup JSON local e gerado
antes de qualquer alteracao.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import xlrd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PRODUCTS = Path.home() / 'Downloads' / 'Produtos.xls'
DEFAULT_PEOPLE = Path.home() / 'Downloads' / 'Pessoas.xls'
MODULE_ID = 'petshop'
BATCH_SIZE = 250
LEGACY_PRODUCT_CATEGORY_MAP = {
    'acessorios': 'Acessório',
    'racao': 'Ração',
    'higiene limpeza': 'Higiene',
    'medicamentos': 'Medicamento',
    'brinquedos': 'Brinquedo',
    'petiscos': 'Petisco',
    'servico': 'Serviço',
    'banho': 'Banho',
    'jardinagem': 'Jardinagem',
    'aquarismo': 'Aquarismo',
    'bebidas': 'Bebidas',
}
PRODUCT_UNITS = {'UN', 'KG', 'MIL'}


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def clean(value) -> str:
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return re.sub(r'\s+', ' ', str(value)).strip()


def numeric(value) -> float:
    # Células numéricas do .xls chegam como float (ex.: 9.99). A conversão
    # anterior removia o ponto e transformava 9.99 em 999. Só aplicamos a
    # normalização brasileira quando o valor vier como texto.
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = re.sub(r'[^0-9,.-]', '', clean(value))
    if ',' in text:
        text = text.replace('.', '').replace(',', '.')
    try:
        return float(text or 0)
    except ValueError:
        return 0.0


def digits(value) -> str:
    return re.sub(r'\D', '', clean(value))


def safe_text(value, limit=500) -> str | None:
    value = clean(value)
    return value[:limit] if value else None


def normalized_product_name(value) -> str:
    return unicodedata.normalize('NFD', clean(value)).encode('ascii', 'ignore').decode().casefold()


def canonical_product_category(value) -> str:
    return LEGACY_PRODUCT_CATEGORY_MAP.get(normalized_product_name(value), 'Outro')


def canonical_product_unit(value) -> str:
    unit = clean(value).upper()
    return unit if unit in PRODUCT_UNITS else 'UN'


def chunks(items, size=BATCH_SIZE):
    for start in range(0, len(items), size):
        yield items[start:start + size]


class SupabaseRest:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip('/') + '/rest/v1'
        self.headers = {
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        }

    def request(self, method: str, table: str, query=None, body=None, headers=None):
        query_string = '?' + urlencode(query or {}, safe=',.*()') if query else ''
        request_headers = {**self.headers, **(headers or {})}
        data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
        request = Request(f'{self.url}/{table}{query_string}', data=data, headers=request_headers, method=method)
        try:
            with urlopen(request, timeout=60) as response:
                raw = response.read().decode('utf-8')
                return json.loads(raw) if raw else None
        except HTTPError as error:
            details = error.read().decode('utf-8', errors='replace')
            raise RuntimeError(f'{method} {table} falhou ({error.code}): {details}') from error

    def all_rows(self, table: str, query: dict[str, str]):
        rows = []
        offset = 0
        while True:
            page = self.request('GET', table, {**query, 'offset': str(offset), 'limit': '1000'}) or []
            rows.extend(page)
            if len(page) < 1000:
                return rows
            offset += 1000


def sheet_rows(path: Path):
    book = xlrd.open_workbook(str(path))
    sheet = book.sheet_by_index(0)
    headers = [clean(sheet.cell_value(0, column)) for column in range(sheet.ncols)]
    for row_index in range(1, sheet.nrows):
        yield {headers[column]: sheet.cell_value(row_index, column) for column in range(sheet.ncols)}


def looks_like_only_breed(value: str) -> bool:
    normalized = unicodedata.normalize('NFD', value).encode('ascii', 'ignore').decode().lower()
    breeds = ('shih tzu', 'yorkshire', 'srd', 'vira lata', 'poodle', 'pit bull', 'bulldog', 'lhasa apso', 'golden', 'gato')
    return normalized in breeds


def parse_pets(observation: str) -> list[dict[str, str]]:
    text = clean(observation)
    if not text:
        return []
    normalized = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode().lower()
    if any(flag in normalized for flag in ('nao tem pet', 'sem pet', 'nao possui pet', 'falecido')):
        return []

    pets: list[dict[str, str]] = []
    for name, breed in re.findall(r'([^()/|;]{1,50}?)\s*\(([^)]{0,50})\)', text):
        name = clean(name).strip(' -,:.')
        breed = clean(breed).strip(' -,:.')
        if name:
            pets.append({'name': name[:80], 'breed': breed[:80]})

    # Ex.: "SIMBA (Border collie) / MARLEY / MELISSA".
    if pets and re.search(r'[/|;]', text):
        residual = re.sub(r'([^()/|;]{1,50}?)\s*\([^)]{0,50}\)', '', text)
        for token in re.split(r'[/|;]+', residual):
            name = clean(token).strip(' -,:.')
            if name and len(name) <= 45 and len(name.split()) <= 5:
                pets.append({'name': name, 'breed': ''})

    # Ex.: "(Junior) Yorkshire".
    if not pets:
        start_with_name = re.match(r'^\(([^)]+)\)\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .-]{1,50})$', text)
        if start_with_name:
            pets.append({'name': clean(start_with_name.group(1))[:80], 'breed': clean(start_with_name.group(2))[:80]})
        elif looks_like_only_breed(text):
            pets.append({'name': '', 'breed': text[:80]})

    unique: list[dict[str, str]] = []
    seen = set()
    for pet in pets:
        key = pet['name'].casefold()
        if key and key not in seen:
            seen.add(key)
            unique.append(pet)
    return unique


def parse_products(path: Path, tenant_id: str) -> tuple[list[dict], int]:
    products = []
    skipped = 0
    seen = set()
    for row in sheet_rows(path):
        name = clean(row.get('Descrição'))
        if not name:
            skipped += 1
            continue
        barcode = digits(row.get('Código Barras')) or None
        key = barcode or name.casefold()
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        products.append({
            'tenant_id': tenant_id,
            'module_id': MODULE_ID,
            'name': name[:250],
            'barcode': barcode,
            'category': canonical_product_category(row.get('Descrição Grupo')),
            'description': safe_text(row.get('Descrição Curta (Loja Virtual)'), 1000),
            'price': numeric(row.get('Preço Venda')),
            'cost_price': numeric(row.get('Custo Atual')),
            'stock_quantity': max(0, int(round(numeric(row.get('Estoque Inventariado'))))),
            'min_stock': 1,
            'active': True,
            'bot_metadata': {
                'legacy_code': clean(row.get('Código')) or None,
                'unit': canonical_product_unit(row.get('Unidade')),
                'is_bulk': canonical_product_unit(row.get('Unidade')) == 'KG',
                'source': 'Produtos.xls',
            },
        })
    return products, skipped


def product_price_updates(db: SupabaseRest, tenant_id: str, products: list[dict]) -> tuple[list[dict], list[dict]]:
    current = db.all_rows('products', {
        'select': '*',
        'tenant_id': f'eq.{tenant_id}',
        'module_id': f'eq.{MODULE_ID}',
        'active': 'eq.true',
    })
    by_barcode = {product['barcode']: product for product in products if product['barcode']}
    by_name = {normalized_product_name(product['name']): product for product in products}
    updates = []
    unmatched = []
    for current_product in current:
        source = by_barcode.get(current_product.get('barcode')) or by_name.get(normalized_product_name(current_product.get('name')))
        if not source:
            unmatched.append(current_product)
            continue
        if (
            abs(float(current_product.get('price') or 0) - float(source['price'])) > 0.009
            or abs(float(current_product.get('cost_price') or 0) - float(source['cost_price'])) > 0.009
        ):
            updates.append({
                **current_product,
                'price': source['price'],
                'cost_price': source['cost_price'],
            })
    return updates, unmatched


def product_category_updates(db: SupabaseRest, tenant_id: str, products: list[dict]) -> tuple[list[dict], list[dict]]:
    current = db.all_rows('products', {
        'select': '*',
        'tenant_id': f'eq.{tenant_id}',
        'module_id': f'eq.{MODULE_ID}',
        'active': 'eq.true',
    })
    by_barcode = {product['barcode']: product for product in products if product['barcode']}
    by_name = {normalized_product_name(product['name']): product for product in products}
    updates = []
    unmatched = []
    for current_product in current:
        source = by_barcode.get(current_product.get('barcode')) or by_name.get(normalized_product_name(current_product.get('name')))
        if not source:
            unmatched.append(current_product)
            continue
        if current_product.get('category') != source['category']:
            updates.append({**current_product, 'category': source['category']})
    return updates, unmatched


def product_unit_updates(db: SupabaseRest, tenant_id: str, products: list[dict]) -> tuple[list[dict], list[dict]]:
    current = db.all_rows('products', {
        'select': '*',
        'tenant_id': f'eq.{tenant_id}',
        'module_id': f'eq.{MODULE_ID}',
        'active': 'eq.true',
    })
    by_barcode = {product['barcode']: product for product in products if product['barcode']}
    by_name = {normalized_product_name(product['name']): product for product in products}
    updates = []
    unmatched = []
    for current_product in current:
        source = by_barcode.get(current_product.get('barcode')) or by_name.get(normalized_product_name(current_product.get('name')))
        if not source:
            unmatched.append(current_product)
            continue
        current_metadata = current_product.get('bot_metadata') if isinstance(current_product.get('bot_metadata'), dict) else {}
        source_unit = source['bot_metadata']['unit']
        if canonical_product_unit(current_metadata.get('unit')) != source_unit:
            updates.append({
                **current_product,
                'bot_metadata': {
                    **current_metadata,
                    'unit': source_unit,
                    'is_bulk': source_unit == 'KG',
                },
            })
    return updates, unmatched


def product_bulk_stock_updates(db: SupabaseRest, tenant_id: str, products: list[dict]) -> tuple[list[dict], list[dict]]:
    current = db.all_rows('products', {
        'select': '*',
        'tenant_id': f'eq.{tenant_id}',
        'module_id': f'eq.{MODULE_ID}',
        'active': 'eq.true',
    })
    by_barcode = {product['barcode']: product for product in products if product['barcode']}
    by_name = {normalized_product_name(product['name']): product for product in products}
    updates = []
    unmatched = []
    for current_product in current:
        source = by_barcode.get(current_product.get('barcode')) or by_name.get(normalized_product_name(current_product.get('name')))
        if not source:
            unmatched.append(current_product)
            continue
        if source['bot_metadata']['unit'] != 'KG':
            continue
        if abs(float(current_product.get('stock_quantity') or 0) - float(source['stock_quantity'])) > 0.0005:
            updates.append({**current_product, 'stock_quantity': source['stock_quantity']})
    return updates, unmatched


def parse_clients(path: Path, tenant_id: str) -> tuple[list[dict], int, int]:
    clients = []
    skipped = 0
    pets_found = 0
    for row in sheet_rows(path):
        is_client = clean(row.get('Cliente')).lower() in {'true', 'sim', '1', 'x'}
        name = clean(row.get('Razão Social / Nome'))
        if not is_client or not name:
            skipped += 1
            continue
        parsed_pets = parse_pets(clean(row.get('Observação')))
        pets_found += len(parsed_pets)
        primary_pet = parsed_pets[0] if parsed_pets else {'name': '', 'breed': ''}
        address_reference = safe_text(row.get('Referência'), 500)
        observation = safe_text(row.get('Observação'), 1000)
        notes = observation
        if address_reference:
            notes = '\n'.join(part for part in (notes, f'Referência: {address_reference}') if part)
        zip_code = digits(row.get('CEP'))[:8]
        details = {
            'pet_name': primary_pet['name'] or None,
            'species': 'cat' if 'gato' in primary_pet['breed'].casefold() else 'dog',
            'breed': primary_pet['breed'] or None,
            'legacy_pets': parsed_pets,
            'tutor_birth_date': None,
            'zip_code': zip_code or None,
            'address_number': safe_text(row.get('Número'), 40),
            'address_reference': address_reference,
            'address_complement': safe_text(row.get('Complemento'), 250),
            'legacy_code': clean(row.get('Código')) or None,
            'legacy_registered_at': clean(row.get('Dt. Cadastro')) or None,
            'registration_status': 'completo' if (zip_code and row.get('Logradouro') and row.get('Bairro') and row.get('Número')) else 'pendente',
            'source': 'Pessoas.xls',
        }
        clients.append({
            'tenant_id': tenant_id,
            'module_id': MODULE_ID,
            'type': 'pet',
            'name': name[:250],
            'document': digits(row.get('CNPJ / CPF')) or None,
            'phone': digits(row.get('Celular')) or digits(row.get('Telefone')) or None,
            'email': None,
            'address': safe_text(row.get('Logradouro'), 300),
            'neighborhood': safe_text(row.get('Bairro'), 150),
            'city': safe_text(row.get('Nome Cidade'), 150) or safe_text(row.get('Cidade'), 150),
            'notes': notes,
            'active': True,
            'details': details,
        })
    return clients, skipped, pets_found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tenant-slug', required=True)
    parser.add_argument('--products', type=Path, default=DEFAULT_PRODUCTS)
    parser.add_argument('--people', type=Path, default=DEFAULT_PEOPLE)
    parser.add_argument('--repair-product-prices', action='store_true', help='Corrige preço e custo dos produtos ativos a partir da planilha, sem alterar estoque ou clientes.')
    parser.add_argument('--repair-product-categories', action='store_true', help='Corrige as categorias dos produtos ativos a partir da planilha, sem alterar preço, estoque ou clientes.')
    parser.add_argument('--repair-product-units', action='store_true', help='Registra as unidades dos produtos ativos a partir da planilha, sem alterar preço, estoque ou clientes.')
    parser.add_argument('--repair-bulk-stock', action='store_true', help='Corrige apenas os saldos dos itens em KG com a casa decimal da planilha, sem alterar preços ou outros produtos.')
    parser.add_argument('--execute', action='store_true', help='Aplica a substituição; sem esta flag apenas valida.')
    args = parser.parse_args()
    if not args.products.exists() or (not (args.repair_product_prices or args.repair_product_categories or args.repair_product_units or args.repair_bulk_stock) and not args.people.exists()):
        raise SystemExit('Planilhas não encontradas. Informe --products e --people com os caminhos corretos.')

    env = {**load_env(ROOT / '.env'), **os.environ}
    if not env.get('SUPABASE_URL') or not env.get('SUPABASE_SERVICE_ROLE_KEY'):
        raise SystemExit('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no .env.')
    db = SupabaseRest(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
    tenants = db.request('GET', 'tenants', {'select': 'id,name,slug', 'slug': f'eq.{args.tenant_slug}', 'limit': '1'}) or []
    if len(tenants) != 1:
        raise SystemExit(f'Tenant não encontrado: {args.tenant_slug}')
    tenant = tenants[0]
    products, skipped_products = parse_products(args.products, tenant['id'])
    if args.repair_product_prices:
        updates, unmatched = product_price_updates(db, tenant['id'], products)
        print(json.dumps({
            'tenant': tenant,
            'product_rows_in_spreadsheet': len(products),
            'prices_or_costs_to_correct': len(updates),
            'active_products_without_sheet_match': len(unmatched),
            'mode': 'execute' if args.execute else 'dry-run',
        }, ensure_ascii=False, indent=2))
        if not args.execute:
            return

        backup_dir = ROOT / 'backups'
        backup_dir.mkdir(exist_ok=True)
        backup_path = backup_dir / f'product-price-repair-{datetime.now():%Y%m%d-%H%M%S}.json'
        backup_path.write_text(json.dumps({
            'created_at': datetime.now(timezone.utc).isoformat(),
            'tenant': tenant,
            'active_products_before_repair': db.all_rows('products', {
                'select': '*',
                'tenant_id': f'eq.{tenant["id"]}',
                'module_id': f'eq.{MODULE_ID}',
                'active': 'eq.true',
            }),
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        for batch in chunks(updates):
            db.request(
                'POST', 'products', {'on_conflict': 'id'}, batch,
                headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
            )
        print(json.dumps({
            'status': 'completed',
            'backup': str(backup_path),
            'products_corrected': len(updates),
            'active_products_without_sheet_match': len(unmatched),
            'preserved': ['stock_quantity', 'clients', 'sales', 'stock_movements'],
        }, ensure_ascii=False, indent=2))
        return

    if args.repair_product_categories:
        updates, unmatched = product_category_updates(db, tenant['id'], products)
        print(json.dumps({
            'tenant': tenant,
            'product_rows_in_spreadsheet': len(products),
            'categories_to_correct': len(updates),
            'active_products_without_sheet_match': len(unmatched),
            'mode': 'execute' if args.execute else 'dry-run',
        }, ensure_ascii=False, indent=2))
        if not args.execute:
            return

        backup_dir = ROOT / 'backups'
        backup_dir.mkdir(exist_ok=True)
        backup_path = backup_dir / f'product-category-repair-{datetime.now():%Y%m%d-%H%M%S}.json'
        backup_path.write_text(json.dumps({
            'created_at': datetime.now(timezone.utc).isoformat(),
            'tenant': tenant,
            'active_products_before_repair': db.all_rows('products', {
                'select': '*',
                'tenant_id': f'eq.{tenant["id"]}',
                'module_id': f'eq.{MODULE_ID}',
                'active': 'eq.true',
            }),
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        for batch in chunks(updates):
            db.request(
                'POST', 'products', {'on_conflict': 'id'}, batch,
                headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
            )
        print(json.dumps({
            'status': 'completed',
            'backup': str(backup_path),
            'products_recategorized': len(updates),
            'active_products_without_sheet_match': len(unmatched),
            'preserved': ['price', 'cost_price', 'stock_quantity', 'clients', 'sales', 'stock_movements'],
        }, ensure_ascii=False, indent=2))
        return

    if args.repair_product_units:
        updates, unmatched = product_unit_updates(db, tenant['id'], products)
        print(json.dumps({
            'tenant': tenant,
            'product_rows_in_spreadsheet': len(products),
            'units_to_register': len(updates),
            'active_products_without_sheet_match': len(unmatched),
            'mode': 'execute' if args.execute else 'dry-run',
        }, ensure_ascii=False, indent=2))
        if not args.execute:
            return

        backup_dir = ROOT / 'backups'
        backup_dir.mkdir(exist_ok=True)
        backup_path = backup_dir / f'product-unit-repair-{datetime.now():%Y%m%d-%H%M%S}.json'
        backup_path.write_text(json.dumps({
            'created_at': datetime.now(timezone.utc).isoformat(),
            'tenant': tenant,
            'active_products_before_repair': db.all_rows('products', {
                'select': '*',
                'tenant_id': f'eq.{tenant["id"]}',
                'module_id': f'eq.{MODULE_ID}',
                'active': 'eq.true',
            }),
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        for batch in chunks(updates):
            db.request(
                'POST', 'products', {'on_conflict': 'id'}, batch,
                headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
            )
        print(json.dumps({
            'status': 'completed',
            'backup': str(backup_path),
            'products_with_unit_registered': len(updates),
            'active_products_without_sheet_match': len(unmatched),
            'preserved': ['price', 'cost_price', 'stock_quantity', 'clients', 'sales', 'stock_movements'],
        }, ensure_ascii=False, indent=2))
        return

    if args.repair_bulk_stock:
        updates, unmatched = product_bulk_stock_updates(db, tenant['id'], products)
        print(json.dumps({
            'tenant': tenant,
            'kg_products_with_corrected_decimal': len(updates),
            'active_products_without_sheet_match': len(unmatched),
            'mode': 'execute' if args.execute else 'dry-run',
        }, ensure_ascii=False, indent=2))
        if not args.execute:
            return

        backup_dir = ROOT / 'backups'
        backup_dir.mkdir(exist_ok=True)
        backup_path = backup_dir / f'bulk-stock-decimal-repair-{datetime.now():%Y%m%d-%H%M%S}.json'
        backup_path.write_text(json.dumps({
            'created_at': datetime.now(timezone.utc).isoformat(),
            'tenant': tenant,
            'products_before_repair': db.all_rows('products', {
                'select': '*',
                'tenant_id': f'eq.{tenant["id"]}',
                'module_id': f'eq.{MODULE_ID}',
                'active': 'eq.true',
            }),
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        for batch in chunks(updates):
            db.request(
                'POST', 'products', {'on_conflict': 'id'}, batch,
                headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
            )
        print(json.dumps({
            'status': 'completed',
            'backup': str(backup_path),
            'kg_products_with_corrected_decimal': len(updates),
            'preserved': ['price', 'cost_price', 'all_non_kg_stock', 'clients', 'sales', 'stock_movements'],
        }, ensure_ascii=False, indent=2))
        return

    clients, skipped_people, pets_found = parse_clients(args.people, tenant['id'])
    print(json.dumps({
        'tenant': tenant,
        'products_to_import': len(products),
        'product_rows_skipped_or_duplicated': skipped_products,
        'clients_to_import': len(clients),
        'people_rows_skipped': skipped_people,
        'pets_parsed_from_observation': pets_found,
        'mode': 'execute' if args.execute else 'dry-run',
    }, ensure_ascii=False, indent=2))
    if not args.execute:
        return

    scope = {'tenant_id': f'eq.{tenant["id"]}', 'module_id': f'eq.{MODULE_ID}'}
    backup = {
        'created_at': datetime.now(timezone.utc).isoformat(),
        'tenant': tenant,
        'clients': db.all_rows('clients', {'select': '*', **scope}),
        'products': db.all_rows('products', {'select': '*', **scope}),
    }
    backup_dir = ROOT / 'backups'
    backup_dir.mkdir(exist_ok=True)
    backup_path = backup_dir / f'legacy-import-{datetime.now():%Y%m%d-%H%M%S}.json'
    backup_path.write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding='utf-8')

    # Soft-delete evita quebrar vendas, estoque e agendamentos legados vinculados.
    db.request('PATCH', 'clients', scope, {'active': False})
    db.request('PATCH', 'products', scope, {'active': False})
    for batch in chunks(products):
        # Barcode é único no banco. Produtos já existentes são reativados e
        # atualizados, enquanto os sem código entram como novos registros.
        db.request(
            'POST', 'products', {'on_conflict': 'barcode'}, batch,
            headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
        )
    for batch in chunks(clients):
        db.request('POST', 'clients', body=batch, headers={'Prefer': 'return=minimal'})

    print(json.dumps({
        'status': 'completed',
        'backup': str(backup_path),
        'products_imported': len(products),
        'clients_imported': len(clients),
        'pets_saved_in_client_details': pets_found,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
