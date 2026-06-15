-- YuiSync - Legacy WhatsApp flow hardening for PetBot
-- Applies MotoDog options, Pix proof/manual baixa fields and template settings.

begin;

alter table public.settings
  add column if not exists pix_key text,
  add column if not exists pix_holder_name text,
  add column if not exists message_templates jsonb not null default '{}'::jsonb,
  add column if not exists pet_transport_options jsonb not null default '[
    {"id":"buscar_e_levar","label":"Buscar e levar","fee":20.00,"maxWeightKg":10,"active":true},
    {"id":"somente_buscar","label":"Somente buscar","fee":15.00,"maxWeightKg":10,"active":true},
    {"id":"somente_levar","label":"Somente levar","fee":15.00,"maxWeightKg":10,"active":true}
  ]'::jsonb;

update public.settings
set pet_transport_options = '[
  {"id":"buscar_e_levar","label":"Buscar e levar","fee":20.00,"maxWeightKg":10,"active":true},
  {"id":"somente_buscar","label":"Somente buscar","fee":15.00,"maxWeightKg":10,"active":true},
  {"id":"somente_levar","label":"Somente levar","fee":15.00,"maxWeightKg":10,"active":true}
]'::jsonb
where module_id = 'petshop'
  and (
    pet_transport_options is null
    or jsonb_typeof(pet_transport_options) <> 'array'
    or jsonb_array_length(pet_transport_options) = 0
  );

update public.settings
set message_templates = coalesce(message_templates, '{}'::jsonb) || jsonb_build_object(
  'appointment_summary', 'Ola [NOME], segue o resumo do seu agendamento\n\nPet: [PET]\nValor do agendamento: [VALOR]\nLocal: [LOJA]\nEndereco: [ENDERECO_LOJA]\nData: [DATA]\nHorario: [HORARIO]',
  'registration_checklist', 'Assim que possivel envie: data de nascimento do tutor, CPF, CEP, numero da casa, ponto de referencia, nome e raca do pet para completar o cadastro conosco.',
  'payment_proof_request', 'Por gentileza, envie o comprovante de pagamento para darmos baixa no sistema.',
  'motodog_options', 'MotoDog: buscar e levar R$20, somente buscar R$15, somente levar R$15. Opcoes para pets ate 10kg.',
  'monthly_plan', 'Nosso pacote mensal tem 4 banhos no mes, 1 por semana, pagamento antecipado e melhor horario reservado.',
  'small_bath_service', 'Banho pequeno porte inclui banho, corte de unha, limpeza de ouvido e tosa higienica.'
)
where module_id = 'petshop'
  and (
    message_templates is null
    or message_templates = '{}'::jsonb
  );

alter table public.sales
  add column if not exists payment_status text not null default 'nao_aplicavel',
  add column if not exists payment_proof_url text,
  add column if not exists payment_proof_received_at timestamptz,
  add column if not exists payment_proof_metadata jsonb not null default '{}'::jsonb;

alter table public.appointments
  add column if not exists payment_status text not null default 'nao_aplicavel',
  add column if not exists payment_proof_url text,
  add column if not exists payment_proof_received_at timestamptz,
  add column if not exists payment_proof_metadata jsonb not null default '{}'::jsonb;

alter table public.service_delivery_orders
  add column if not exists payment_status text not null default 'nao_aplicavel',
  add column if not exists payment_proof_url text,
  add column if not exists payment_proof_received_at timestamptz,
  add column if not exists payment_proof_metadata jsonb not null default '{}'::jsonb,
  add column if not exists transport_mode text,
  add column if not exists transport_label text;

commit;
