import type { DomainMigration } from "./types";
import { boolInt, jsonObject, mappedFingerprint, nullable, resolveMappedTarget, stableJson, tagged, targetId, text, toCents, toMilli, unit, type TaggedRow } from "./common";

function plain(value: unknown): string { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function isServiceProduct(row: TaggedRow): boolean {
  const metadata=jsonObject(row.bot_metadata);const name=plain(row.name),category=plain(row.category),combined=plain([row.name,row.category,metadata.product_type].filter(Boolean).join(' '));
  const candidate=plain(metadata.product_type)==='servico'||category==='servico'||/(banho|tosa|desembolo|escovac|hidrat|higieniz|consulta|vacina|exame|cirurg)/.test(combined);
  const excluded=/(banheira|banho a seco|brinquedo|casinha|roupa|shampoo|varinha)/.test(name)||/(pacote.*banho|banho.*pacote)/.test(name);
  return candidate&&!excluded;
}

export const catalog:DomainMigration={
  domain:'catalog',dependencies:[],
  async extract(context){return[...await tagged(context,'products'),...await tagged(context,'petshop_services')];},
  async normalize(raw,context){const row=raw as TaggedRow,t=context.scope.tenantId,m=context.scope.moduleId;
    if(row.__source_table==='products'){
      if(isServiceProduct(row))return[];
      const id=targetId(row,'product'),metadata=jsonObject(row.bot_metadata);const fp={id,tenant_id:t,module_id:m,name:text(row.name,'Produto'),barcode:nullable(row.barcode),category:nullable(row.category),description:nullable(row.description),price_cents:toCents(row.price),cost_cents:toCents(row.cost_price),min_quantity_milli:toMilli(row.min_stock),species_target:nullable(row.species_target),image_url:nullable(row.image_url),active:boolInt(row.active),metadata_json:stableJson(metadata)};
      return[unit(context,row,'products',id,context.env.DB.prepare(`INSERT INTO products(id,tenant_id,module_id,name,barcode,category,description,price_cents,cost_cents,min_quantity_milli,species_target,image_url,active,metadata_json,source_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name=excluded.name,barcode=excluded.barcode,category=excluded.category,description=excluded.description,price_cents=excluded.price_cents,cost_cents=excluded.cost_cents,min_quantity_milli=excluded.min_quantity_milli,species_target=excluded.species_target,image_url=excluded.image_url,active=excluded.active,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(id,t,m,fp.name,fp.barcode,fp.category,fp.description,fp.price_cents,fp.cost_cents,fp.min_quantity_milli,fp.species_target,fp.image_url,fp.active,fp.metadata_json,text(row.id),nullable(row.created_at)),fp)];
    }
    const id=targetId(row,'service'),code=text(row.code??row.service_code,`legacy_${id.replace(/-/g,'')}`),sourceProductId=nullable(row.source_product_id),commissionRate=Number(row.commission_rate??0);const fp={id,tenant_id:t,module_id:m,code,name:text(row.name??row.label??row.service_type,'Serviço'),service_group:text(row.group_type??row.service_group??row.group,'other'),description:nullable(row.description),price_cents:toCents(row.default_price??row.price??row.base_price),duration_minutes:Math.max(1,Number(row.default_duration_min??row.duration_min??row.duration_minutes??60)),species_rule:text(row.species_rule??row.species??'all'),commission_basis_points:Number.isFinite(commissionRate)?Math.round(commissionRate*100):null,active:boolInt(row.active),metadata_json:stableJson({source_product_id:sourceProductId,commission_type:row.commission_type??null,icon:row.icon??null})};
    const statement=()=>context.env.DB.prepare(`INSERT INTO services(id,tenant_id,module_id,code,name,service_group,description,price_cents,duration_minutes,species_rule,commission_basis_points,active,metadata_json,source_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,service_group=excluded.service_group,description=excluded.description,price_cents=excluded.price_cents,duration_minutes=excluded.duration_minutes,species_rule=excluded.species_rule,commission_basis_points=excluded.commission_basis_points,active=excluded.active,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(id,t,m,code,fp.name,fp.service_group,fp.description,fp.price_cents,fp.duration_minutes,fp.species_rule,fp.commission_basis_points,fp.active,fp.metadata_json,text(row.id),nullable(row.created_at));
    const units=[unit(context,row,'services',id,statement(),fp)];
    if(sourceProductId){units.push(unit(context,{...row,id:sourceProductId,__source_table:'products-service'} as TaggedRow,'services',id,statement(),{...fp,legacy_product_id:sourceProductId}));}
    return units;
  },targetFingerprint:(context)=>mappedFingerprint(context,'catalog')
};

export const inventory:DomainMigration={
  domain:'inventory',dependencies:['catalog'],
  async extract(context){return[...await tagged(context,'products'),...await tagged(context,'stock_movements')];},
  async normalize(raw,context){const row=raw as TaggedRow,t=context.scope.tenantId,m=context.scope.moduleId;
    if(row.__source_table==='products'){
      if(isServiceProduct(row))return[];const productId=(await resolveMappedTarget(context,'catalog','products',row.id,'products'))??text(row.id);if(!productId)return[];const quantity=toMilli(row.stock_quantity);const fp={tenant_id:t,module_id:m,product_id:productId,quantity_milli:quantity};return[unit(context,row,'inventory_balances',productId,context.env.DB.prepare(`INSERT INTO inventory_balances(tenant_id,module_id,product_id,quantity_milli,version,updated_at) VALUES(?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,module_id,product_id) DO UPDATE SET quantity_milli=excluded.quantity_milli,version=inventory_balances.version+1,updated_at=CURRENT_TIMESTAMP`).bind(t,m,productId,quantity),fp)];
    }
    const productId=await resolveMappedTarget(context,'catalog','products',row.product_id,'products');if(!productId)return[];const id=targetId(row,'movement'),qty=toMilli(row.quantity),before=toMilli(row.stock_before),after=row.stock_after==null?before+qty:toMilli(row.stock_after),idem=text(row.idempotency_key,`legacy:${id}`);const movementType=['opening','sale','purchase','adjustment','return','service_use'].includes(text(row.movement_type))?text(row.movement_type):'adjustment';const fp={id,tenant_id:t,module_id:m,product_id:productId,movement_type:movementType,quantity_milli:qty,balance_before_milli:before,balance_after_milli:after,unit_cost_cents:row.unit_cost==null?null:toCents(row.unit_cost),reference_type:row.sale_id?'sale':null,reference_id:nullable(row.sale_id),reason:nullable(row.reason),idempotency_key:idem};return[unit(context,row,'inventory_movements',id,context.env.DB.prepare(`INSERT INTO inventory_movements(id,tenant_id,module_id,product_id,movement_type,quantity_milli,balance_before_milli,balance_after_milli,unit_cost_cents,reference_type,reference_id,reason,idempotency_key,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(tenant_id,module_id,idempotency_key) DO NOTHING`).bind(id,t,m,productId,movementType,qty,before,after,fp.unit_cost_cents,fp.reference_type,fp.reference_id,fp.reason,idem,nullable(row.created_at),nullable(row.created_at)),fp)];
  },targetFingerprint:(context)=>mappedFingerprint(context,'inventory')
};
