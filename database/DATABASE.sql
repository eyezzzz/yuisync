
-- ################################################################################
-- #                                YUISYNC DATABASE                               #
-- ################################################################################
-- Script para criação da estrutura de banco de dados no Supabase.
-- Execute este script no SQL Editor do seu projeto Supabase.

-- # 1. Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- # 2. Tabelas Principais

-- ## Perfis de Usuário (Sincronizado com Auth.Users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'employee',
    active BOOLEAN DEFAULT TRUE,
    allowed_modules JSONB DEFAULT '[]',
    module_permissions JSONB DEFAULT '{}',
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Configurações por Módulo
CREATE TABLE IF NOT EXISTS public.settings (
    module_id TEXT PRIMARY KEY,
    store_name TEXT,
    store_address TEXT,
    store_neighborhood TEXT,
    store_city TEXT,
    store_phone TEXT,
    printer_width TEXT DEFAULT '80',
    fiscal_id TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Clientes / Contatos
-- Tabela genérica para isolar clientes por módulo, suportando PetShop ou Contabilidade via "type" e "details"
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id TEXT NOT NULL,
    type TEXT DEFAULT 'generic', -- ex: 'pet', 'company', 'person'
    name TEXT NOT NULL,
    document TEXT, -- CPF, CNPJ, etc
    phone TEXT,
    email TEXT,
    address TEXT,
    neighborhood TEXT,
    city TEXT,
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    
    -- JSON para atributos dinâmicos específicos de cada módulo (ex: pet_name, microchip, razao_social)
    details JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Agendamentos / Sessões
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id TEXT NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    service_type TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'agendado', -- agendado, concluido, cancelado
    notes TEXT,
    price DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Produtos / Itens em Estoque
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id TEXT NOT NULL,
    name TEXT NOT NULL,
    barcode TEXT,
    category TEXT,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    cost_price DECIMAL(10,2) DEFAULT 0,
    stock_quantity DECIMAL(10,2) DEFAULT 0,
    min_stock DECIMAL(10,2) DEFAULT 0,
    species_target TEXT,
    upsell_link_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    image_url TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Vendas (Cabeçalho)
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payment_method TEXT,
    subtotal DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'concluido',
    source TEXT DEFAULT 'pdv', -- pdv, whatsapp, etc
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Itens da Venda
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    upsell BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Faturas / Notas / Cobranças
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, paid, cancelled
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE,
    paid_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    customer_phone TEXT,
    invoice_nfe_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Configurações de Faturamento
CREATE TABLE IF NOT EXISTS public.billing_settings (
    module_id TEXT PRIMARY KEY,
    invoice_days_before_due INTEGER DEFAULT 5,
    recurrent_payment BOOLEAN DEFAULT FALSE,
    webhook_url TEXT,
    pix_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Sessões de Chat (IA/Humano)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'bot', -- bot, human, closed
    intent TEXT,
    channel TEXT DEFAULT 'whatsapp',
    csat_score INTEGER,
    context JSONB NOT NULL DEFAULT '{}'::JSONB,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Mensagens do Chat
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- user, assistant, system, human_agent
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    tokens_used INTEGER DEFAULT 0,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Respostas Rápidas
CREATE TABLE IF NOT EXISTS public.quick_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT,
    title TEXT,
    text TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Serviços Contábeis (Módulo Contabilidade Especificamente)
CREATE TABLE IF NOT EXISTS public.accounting_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ## Módulo Específico: Marmitaria
CREATE TABLE IF NOT EXISTS public.marmitaria_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL,
    dias_semana TEXT DEFAULT 'todos',
    disponivel BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marmitaria_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chave TEXT UNIQUE NOT NULL,
    valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.marmitaria_pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id TEXT NOT NULL,
    nome_cliente TEXT NOT NULL,
    itens JSONB NOT NULL DEFAULT '[]',
    total DECIMAL(10,2) NOT NULL,
    tipo_entrega TEXT,
    endereco TEXT,
    pagamento TEXT,
    troco DECIMAL(10,2),
    status TEXT DEFAULT 'aguardando',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marmitaria_bot_sessions (
    id TEXT PRIMARY KEY,
    data JSONB DEFAULT '{}',
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- # 3. Gatilhos (Triggers)

-- Função para criar perfil automaticamente após o registro (SignUp)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, allowed_modules, module_permissions)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'role',
    (NEW.raw_user_meta_data->>'allowed_modules')::jsonb,
    (NEW.raw_user_meta_data->>'module_permissions')::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gatilho de Auth -> Profile
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- # 4. Configurar Realtime
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marmitaria_pedidos;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- # 5. Políticas de Segurança RLS (Row Level Security) e Isolamento de Tenants

-- Ativação GERAL do RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marmitaria_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marmitaria_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marmitaria_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marmitaria_bot_sessions ENABLE ROW LEVEL SECURITY;

-- 5.1 Profiles:
-- Usuários podem ver/editar o próprio perfil; Admins podem ver/editar todos.
CREATE POLICY "Profiles update own" ON public.profiles FOR UPDATE USING (id = auth.uid() OR role = 'admin');
CREATE POLICY "Profiles select restricted" ON public.profiles FOR SELECT USING (id = auth.uid() OR role = 'admin');

-- 5.2 Helper function para checar permissão no módulo em tabelas multitenant
CREATE OR REPLACE FUNCTION public.check_module_access(check_module_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND (role = 'admin' OR allowed_modules ? check_module_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.3 Policies isoladas baseadas em módulo
CREATE POLICY "Isolamento por módulo Settings" ON public.settings FOR ALL USING (public.check_module_access(module_id));
CREATE POLICY "Isolamento por módulo Clients" ON public.clients FOR ALL USING (public.check_module_access(module_id));
CREATE POLICY "Isolamento por módulo Appointments" ON public.appointments FOR ALL USING (public.check_module_access(module_id));
CREATE POLICY "Isolamento por módulo Products" ON public.products FOR ALL USING (public.check_module_access(module_id));
CREATE POLICY "Isolamento por módulo Sales" ON public.sales FOR ALL USING (public.check_module_access(module_id));
CREATE POLICY "Isolamento por módulo Invoices" ON public.invoices FOR ALL USING (public.check_module_access(module_id));
CREATE POLICY "Isolamento por módulo Billing Settings" ON public.billing_settings FOR ALL USING (public.check_module_access(module_id));
CREATE POLICY "Isolamento por módulo Chat Sessions" ON public.chat_sessions FOR ALL USING (public.check_module_access(module_id));
CREATE POLICY "Isolamento por módulo Accounting" ON public.accounting_services FOR ALL USING (public.check_module_access(module_id));

-- Marmitaria Policies (Assumindo que pertencem implicitamente ao module_id 'marmitaria', ou via admin)
CREATE POLICY "Marmitaria Itens" ON public.marmitaria_itens FOR ALL USING (public.check_module_access('marmitaria'));
CREATE POLICY "Marmitaria Config" ON public.marmitaria_config FOR ALL USING (public.check_module_access('marmitaria'));
CREATE POLICY "Marmitaria Pedidos" ON public.marmitaria_pedidos FOR ALL USING (public.check_module_access('marmitaria'));
CREATE POLICY "Marmitaria Bot Sessions" ON public.marmitaria_bot_sessions FOR ALL USING (public.check_module_access('marmitaria'));

-- 5.4 Dependências com FKS (Item, Message)
CREATE POLICY "Isolamento Sale Items via Sales" ON public.sale_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sales WHERE id = sale_id AND public.check_module_access(module_id))
);

CREATE POLICY "Isolamento Chat Messages via Session" ON public.chat_messages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND public.check_module_access(module_id))
);

-- 5.5 Tabelas compartilhadas
CREATE POLICY "Quick Replies público para autenticados" ON public.quick_replies FOR SELECT USING (auth.uid() IS NOT NULL);
