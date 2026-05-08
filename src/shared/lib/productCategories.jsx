import {
  Bone,
  Cookie,
  Droplets,
  Sparkles,
  Pill,
  ToyBrick,
  Boxes,
  BriefcaseBusiness,
  Package,
} from 'lucide-react'

export const BASE_PRODUCT_CATEGORIES = [
  'Ração',
  'Petisco',
  'Higiene',
  'Acessório',
  'Medicamento',
  'Brinquedo',
  'Genérico',
  'Serviço',
  'Outro',
]

export function normalizeCategory(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const CATEGORY_META = {
  racao: {
    label: 'Ração',
    icon: Bone,
    iconClassName: 'text-emerald-700',
    chipClassName: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    tileClassName: 'bg-emerald-500 text-white',
  },
  petisco: {
    label: 'Petisco',
    icon: Cookie,
    iconClassName: 'text-amber-700',
    chipClassName: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    tileClassName: 'bg-amber-500 text-white',
  },
  higiene: {
    label: 'Higiene',
    icon: Droplets,
    iconClassName: 'text-sky-700',
    chipClassName: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
    tileClassName: 'bg-sky-500 text-white',
  },
  acessorio: {
    label: 'Acessório',
    icon: Sparkles,
    iconClassName: 'text-violet-700',
    chipClassName: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
    tileClassName: 'bg-violet-500 text-white',
  },
  medicamento: {
    label: 'Medicamento',
    icon: Pill,
    iconClassName: 'text-rose-700',
    chipClassName: 'bg-rose-500/10 text-rose-700 border-rose-500/20',
    tileClassName: 'bg-rose-500 text-white',
  },
  brinquedo: {
    label: 'Brinquedo',
    icon: ToyBrick,
    iconClassName: 'text-fuchsia-700',
    chipClassName: 'bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/20',
    tileClassName: 'bg-fuchsia-500 text-white',
  },
  generico: {
    label: 'Genérico',
    icon: Boxes,
    iconClassName: 'text-cyan-700',
    chipClassName: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
    tileClassName: 'bg-cyan-600 text-white',
  },
  servico: {
    label: 'Serviço',
    icon: BriefcaseBusiness,
    iconClassName: 'text-indigo-700',
    chipClassName: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
    tileClassName: 'bg-indigo-600 text-white',
  },
  outro: {
    label: 'Outro',
    icon: Package,
    iconClassName: 'text-slate-700',
    chipClassName: 'bg-slate-500/10 text-slate-700 border-slate-500/20',
    tileClassName: 'bg-slate-600 text-white',
  },
}

export function resolveCategoryMeta(category) {
  const normalized = normalizeCategory(category)

  if (normalized === 'importacao xml') {
    return CATEGORY_META.generico
  }

  return CATEGORY_META[normalized] || {
    label: category || 'Outro',
    icon: Package,
    iconClassName: 'text-slate-700',
    chipClassName: 'bg-slate-500/10 text-slate-700 border-slate-500/20',
    tileClassName: 'bg-slate-600 text-white',
  }
}
