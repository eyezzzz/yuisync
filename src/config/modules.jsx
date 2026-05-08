import {
  LayoutDashboard, Calendar, ShoppingCart, Package,
  PawPrint, MessageSquare, Users, Settings, TrendingUp,
  FileText, CreditCard, Shield, Trophy, Sparkles, Megaphone,
  Wallet, ClipboardList,
} from 'lucide-react'

// Paginas PetShop
import DashboardPage from '../modules/petshop/pages/DashboardPage'
import AgendaPage from '../modules/petshop/pages/AgendaPage'
import VendasPage from '../modules/petshop/pages/VendasPage'
import EstoquePage from '../modules/petshop/pages/EstoquePage'
import PetsPage from '../modules/petshop/pages/PetsPage'
import ChatPage from '../modules/petshop/pages/ChatPage'
import PlanosPage from '../modules/petshop/pages/PlanosPage'
import FidelidadePage from '../modules/petshop/pages/FidelidadePage'
import StatusLivePage from '../modules/petshop/pages/StatusLivePage'
import EquipePage from '../modules/petshop/pages/EquipePage'
import CampanhasPage from '../modules/petshop/pages/CampanhasPage'
import CaixaPage from '../modules/petshop/pages/CaixaPage'
import OrdensEntregaPage from '../modules/petshop/pages/OrdensEntregaPage'
import GrowthPage from '../modules/petshop/pages/GrowthPage'

// Paginas Compartilhadas
import UsersPage from '../shared/pages/UsersPage'
import SettingsPage from '../shared/pages/SettingsPage'
import ReportsSharedPage from '../shared/pages/ReportsSharedPage'
import BillingPage from '../shared/pages/BillingPage'
import LogsPage from '../shared/pages/LogsPage'
import SupportHubPage from '../shared/pages/SupportHubPage'

export const MODULES = {
  petshop: {
    id: 'petshop',
    name: 'PetShop CRM',
    shortName: 'PetShop',
    icon: PawPrint,
    theme: {
      primaryBg: 'bg-[#059669]',
      text: 'text-[#059669]',
      textPrimary: 'text-[#059669]',
      bgLight: 'bg-[#059669]/12',
      border: 'border-[#059669]/20',
      shadow: 'shadow-[#059669]/20',
    },
    roles: [
      { id: 'admin_pet', label: 'Admin Pet', description: 'Acesso total ao modulo PetShop' },
      { id: 'funcionario_pet', label: 'Funcionario Pet', description: 'Acesso a Agenda, PDV e Clientes' },
    ],
    nav: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin_pet', 'funcionario_pet'] },
      { id: 'agenda', label: 'Agenda', icon: Calendar, roles: ['admin_pet', 'funcionario_pet'] },
      { id: 'vendas', label: 'Vendas / PDV', icon: ShoppingCart, roles: ['admin_pet', 'funcionario_pet'] },
      { id: 'estoque', label: 'Estoque', icon: Package, roles: ['admin_pet'] },
      { id: 'pets', label: 'Clientes & Pets', icon: PawPrint, roles: ['admin_pet', 'funcionario_pet'] },
      { id: 'chat', label: 'Chat IA', icon: MessageSquare, roles: ['admin_pet'] },
    ],
    legacyAdminNav: [
      { id: 'usuarios', label: 'Usuarios', icon: Users, roles: ['admin_pet'] },
      { id: 'relatorios', label: 'Relatorios', icon: TrendingUp, roles: ['admin_pet'] },
      { id: 'financeiro', label: 'Financeiro / Notas', icon: CreditCard, roles: ['admin_pet'] },
      { id: 'config', label: 'Configuracoes', icon: Settings, roles: ['admin_pet'] },
      { id: 'logs', label: 'Logs', icon: FileText, roles: ['admin_pet'] },
    ],
    navSections: [
      {
        title: 'Menu Principal',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin_pet', 'funcionario_pet'] },
          { id: 'agenda', label: 'Agenda', icon: Calendar, roles: ['admin_pet', 'funcionario_pet'] },
          { id: 'vendas', label: 'Vendas / PDV', icon: ShoppingCart, roles: ['admin_pet', 'funcionario_pet'] },
          { id: 'ordens', label: 'Ordens / Entrega', icon: ClipboardList, roles: ['admin_pet', 'funcionario_pet'] },
          { id: 'status-live', label: 'Status ao Vivo', icon: Sparkles, roles: ['admin_pet', 'funcionario_pet'] },
          { id: 'chat', label: 'Atendimento WhatsApp', icon: MessageSquare, roles: ['admin_pet', 'funcionario_pet'] },
          { id: 'growth', label: 'Crescimento CRM', icon: TrendingUp, roles: ['admin_pet'] },
        ],
      },
      {
        title: 'Clientes',
        items: [
          { id: 'pets', label: 'Clientes & Pets', icon: PawPrint, roles: ['admin_pet', 'funcionario_pet'] },
          { id: 'fidelidade', label: 'Fidelidade', icon: Trophy, roles: ['admin_pet', 'funcionario_pet'] },
        ],
      },
      {
        title: 'Financeiro',
        items: [
          { id: 'caixa', label: 'Controle de Caixa', icon: Wallet, roles: ['admin_pet', 'funcionario_pet'] },
          { id: 'relatorios', label: 'Relatorios', icon: TrendingUp, roles: ['admin_pet'] },
          { id: 'planos', label: 'Planos', icon: CreditCard, roles: ['admin_pet'] },
          { id: 'financeiro', label: 'Financeiro / Notas', icon: CreditCard, roles: ['admin_pet'] },
        ],
      },
      {
        title: 'Estoque',
        items: [
          { id: 'estoque', label: 'Estoque', icon: Package, roles: ['admin_pet'] },
        ],
      },
      {
        title: 'Campanhas',
        items: [
          { id: 'campanhas', label: 'Campanhas', icon: Megaphone, roles: ['admin_pet'] },
        ],
      },
      {
        title: 'Administracao',
        items: [
          { id: 'usuarios', label: 'Usuarios', icon: Users, roles: ['admin_pet'] },
          { id: 'equipe', label: 'Equipe & Comissoes', icon: Users, roles: ['admin_pet'] },
          { id: 'config', label: 'Configuracoes', icon: Settings, roles: ['admin_pet'] },
          { id: 'logs', label: 'Logs', icon: FileText, roles: ['admin_pet'] },
        ],
      },
    ],
    adminNav: [],
    pages: {
      dashboard: DashboardPage,
      agenda: AgendaPage,
      vendas: VendasPage,
      ordens: OrdensEntregaPage,
      growth: GrowthPage,
      estoque: EstoquePage,
      pets: PetsPage,
      fidelidade: FidelidadePage,
      chat: ChatPage,
      'status-live': StatusLivePage,
      caixa: CaixaPage,
      planos: PlanosPage,
      campanhas: CampanhasPage,
      usuarios: UsersPage,
      equipe: EquipePage,
      relatorios: ReportsSharedPage,
      financeiro: BillingPage,
      config: SettingsPage,
      logs: LogsPage,
    },
  },

  system: {
    id: 'system',
    name: 'Gestao Central',
    shortName: 'Hub Central',
    icon: Shield,
    theme: {
      primaryBg: 'bg-[#8B5CF6]',
      text: 'text-[#8B5CF6]',
      textPrimary: 'text-[#8B5CF6]',
      bgLight: 'bg-[#8B5CF6]/12',
      border: 'border-[#8B5CF6]/20',
      shadow: 'shadow-[#8B5CF6]/20',
    },
    roles: [
      { id: 'admin', label: 'Admin Global', description: 'Controle total do sistema' },
    ],
    nav: [
      { id: 'usuarios', label: 'Usuarios & Cargos', icon: Users, roles: ['admin'] },
      { id: 'modulos', label: 'Config. Modulos', icon: Settings, roles: ['admin'] },
      { id: 'suporte', label: 'Suporte Central', icon: MessageSquare, roles: ['admin'] },
      { id: 'logs', label: 'Logs', icon: FileText, roles: ['admin'] },
    ],
    pages: {
      usuarios: UsersPage,
      modulos: SettingsPage,
      suporte: SupportHubPage,
      logs: LogsPage,
    },
  },
}
