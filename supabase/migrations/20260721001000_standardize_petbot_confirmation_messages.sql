-- Apply the approved Quatro Patas wording to already-created settings rows.
-- These are deterministic PetBot confirmation templates, not LLM suggestions.
begin;

update public.settings
set message_templates = coalesce(message_templates, '{}'::jsonb) || jsonb_build_object(
  'appointment_summary', E'Olá!\n\nSegue o resumo do seu agendamento:\n\n🐶 **Pet:** [PET]\n💰 **Valor:** [VALOR]\n📍 **Local:** [LOJA]\n📌 **Endereço:** [ENDERECO_LOJA]\n📅 **Data:** [DATA]\n🕐 **Horário:** [HORARIO]\n\nAguardamos vocês! 🐶💚',
  'appointment_confirmation', E'Olá, [NOME]!\n\nSeu atendimento está agendado para:\n\n📅 **[DATA]**\n🕐 **[HORARIO]**\n\nQualquer dúvida, estamos à disposição! 🐶💚',
  'motodog_options', E'🚗 **MotoDog**\n\n**Buscar e levar**\nPets de até 10 kg (dentro de Muriaé)\n💰 **[BUSCAR_E_LEVAR]**\n\n**Somente buscar**\nPets de até 10 kg (dentro de Muriaé)\n💰 **[SOMENTE_BUSCAR]**\n\n**Somente levar**\nPets de até 10 kg (dentro de Muriaé)\n💰 **[SOMENTE_LEVAR]**',
  'registration_checklist', E'Para realizarmos o cadastro, por gentileza envie:\n\n• Nome completo do tutor\n• Data de nascimento do tutor\n• CPF do tutor\n• CEP\n• Número da residência\n• Ponto de referência\n• Nome do pet\n• Raça do pet\n\nAssim conseguimos concluir o cadastro em nosso sistema. 🐶💚',
  'payment_proof_request', E'Assim que realizar o pagamento, por gentileza envie o comprovante para darmos baixa no sistema. 🐶💚'
),
updated_at = now()
where module_id = 'petshop';

commit;
