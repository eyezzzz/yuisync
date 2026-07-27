import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'

const CONTACT_EMAIL = 'gabrielboalento3004@gmail.com'
const LAST_UPDATED = '27 de julho de 2026'

const documents = {
  privacidade: {
    title: 'Política de Privacidade',
    intro: 'Esta Política de Privacidade pertence ao YuiSync, plataforma de gestão, automação comercial e atendimento inteligente administrada pelo portfólio empresarial Yui Sync, em Juiz de Fora, Minas Gerais, Brasil.',
    sections: [
      ['1. Quem somos', [
        'O YuiSync fornece ferramentas de gestão empresarial, CRM, agenda, vendas, atendimento, automações e integração com canais de comunicação, incluindo o WhatsApp Business Platform da Meta.',
        `Dúvidas sobre privacidade e proteção de dados podem ser enviadas para ${CONTACT_EMAIL}.`,
      ]],
      ['2. Dados que podemos tratar', [
        'Dados de cadastro e contato, como nome, telefone, e-mail, empresa e informações fornecidas pelo usuário ou pela empresa cliente.',
        'Dados operacionais inseridos na plataforma, como clientes, produtos, serviços, pedidos, agendamentos, pagamentos, observações e histórico de atendimento.',
        'Mensagens e metadados de comunicação recebidos por integrações autorizadas, incluindo identificadores do WhatsApp, conteúdo de mensagens, mídias, status de entrega e horários.',
        'Dados técnicos e de segurança, como endereço IP, navegador, registros de acesso, eventos de auditoria, dispositivo e informações necessárias para prevenir fraude e abuso.',
      ]],
      ['3. Como usamos os dados', [
        'Prestamos e mantemos as funcionalidades contratadas, processamos solicitações, automatizamos atendimentos e registramos operações realizadas na plataforma.',
        'Protegemos contas, investigamos incidentes, evitamos uso indevido, atendemos obrigações legais e melhoramos a confiabilidade do serviço.',
        'Mensagens não são usadas para enviar comunicações de marketing sem base legal ou autorização aplicável.',
      ]],
      ['4. Integrações e operadores', [
        'O YuiSync pode usar fornecedores de infraestrutura, banco de dados, inteligência artificial, hospedagem e comunicação, exclusivamente na medida necessária para prestar o serviço.',
        'Entre os fornecedores que podem participar do tratamento estão Meta/WhatsApp, OpenAI, Supabase e Vercel, sujeitos aos respectivos termos e políticas.',
        'Cada empresa cliente é responsável por informar seus próprios clientes sobre o tratamento realizado em seu atendimento e por obter consentimentos quando exigidos.',
      ]],
      ['5. WhatsApp Business e Meta', [
        'Quando uma empresa conecta sua conta do WhatsApp Business ao YuiSync, recebemos os eventos autorizados pela Meta e processamos as mensagens para exibição, resposta, automação, suporte e registro do atendimento.',
        'O YuiSync não vende dados pessoais para anunciantes. O compartilhamento com a Meta ocorre somente conforme a integração ativada, as configurações do cliente e os recursos necessários ao funcionamento do WhatsApp Business Platform.',
      ]],
      ['6. Inteligência artificial', [
        'Alguns recursos podem usar inteligência artificial para interpretar solicitações, resumir conversas, transcrever áudios, descrever imagens e preparar respostas ou ações.',
        'Decisões sensíveis devem ser revisadas por uma pessoa. O YuiSync não substitui avaliação médica, veterinária, jurídica, contábil ou financeira profissional.',
      ]],
      ['7. Retenção e segurança', [
        'Os dados são mantidos pelo período necessário para prestar o serviço, cumprir contratos, preservar registros, atender obrigações legais e resolver disputas.',
        'Aplicamos controles técnicos e organizacionais razoáveis, incluindo autenticação, isolamento por empresa, registros de auditoria e restrição de acesso. Nenhum sistema é totalmente imune a incidentes.',
      ]],
      ['8. Direitos do titular', [
        'Nos termos da LGPD, o titular pode solicitar confirmação de tratamento, acesso, correção, portabilidade quando aplicável, anonimização, bloqueio, eliminação e informações sobre compartilhamento.',
        `Para exercer seus direitos, envie uma solicitação para ${CONTACT_EMAIL}, informando o vínculo com a empresa que utiliza o YuiSync. Poderemos solicitar dados adicionais para confirmar a identidade e proteger a conta.`,
      ]],
      ['9. Crianças e adolescentes', [
        'O YuiSync é destinado a empresas e profissionais. Não buscamos coletar diretamente dados de crianças sem participação e responsabilidade de seus representantes legais.',
      ]],
      ['10. Alterações desta política', [
        'Podemos atualizar esta política para refletir mudanças legais, técnicas ou operacionais. A versão vigente permanecerá disponível publicamente nesta página.',
      ]],
    ],
  },
  termos: {
    title: 'Termos de Serviço',
    intro: 'Estes Termos regulam o acesso e o uso do YuiSync. Ao criar uma conta, contratar, acessar ou utilizar a plataforma, o usuário declara que leu e aceitou estas condições.',
    sections: [
      ['1. Serviço', [
        'O YuiSync oferece módulos de gestão, atendimento, automação, agenda, vendas, relatórios e integrações. Recursos podem variar conforme plano, módulo, disponibilidade técnica e fase de desenvolvimento.',
      ]],
      ['2. Conta e responsabilidade', [
        'O usuário deve fornecer informações corretas, proteger suas credenciais e permitir acesso somente a pessoas autorizadas.',
        'A empresa cliente é responsável pelos dados inseridos, pelas mensagens enviadas em seu nome, pela configuração das automações e pelo cumprimento das leis aplicáveis ao seu negócio.',
      ]],
      ['3. Uso permitido', [
        'É proibido usar o YuiSync para fraude, spam, assédio, violação de direitos, conteúdo ilegal, exploração de vulnerabilidades, acesso não autorizado ou descumprimento das políticas dos provedores integrados.',
        'Também é proibido contornar limites técnicos, revender acesso sem autorização ou usar a plataforma para prejudicar terceiros ou a infraestrutura do serviço.',
      ]],
      ['4. WhatsApp e serviços de terceiros', [
        'Integrações com Meta, WhatsApp, OpenAI, Supabase, Vercel e outros fornecedores dependem da disponibilidade e das regras desses serviços.',
        'A empresa cliente deve manter contas, permissões, consentimentos e modelos de mensagem em conformidade com as políticas da Meta e com a legislação aplicável.',
      ]],
      ['5. Inteligência artificial e automações', [
        'Respostas produzidas por inteligência artificial podem conter imprecisões. O cliente deve configurar limites, revisar resultados relevantes e manter opção de atendimento humano quando necessário.',
        'O YuiSync não garante que uma automação compreenderá corretamente todas as mensagens ou que produzirá um resultado comercial específico.',
      ]],
      ['6. Disponibilidade e alterações', [
        'Buscamos manter o serviço disponível e seguro, mas podem ocorrer manutenções, indisponibilidades, limitações de fornecedores e alterações de funcionalidades.',
        'Podemos modificar, suspender ou descontinuar recursos, comunicando mudanças relevantes quando razoavelmente possível.',
      ]],
      ['7. Propriedade intelectual', [
        'O software, a marca, a interface e os materiais do YuiSync são protegidos pela legislação aplicável. O cliente mantém os direitos sobre os dados próprios que insere na plataforma.',
      ]],
      ['8. Suspensão e encerramento', [
        'Contas podem ser suspensas por risco de segurança, falta de pagamento, violação destes Termos, exigência legal ou uso que ameace terceiros ou a plataforma.',
        'O usuário pode solicitar encerramento e exclusão conforme a página de Exclusão de Dados, respeitadas obrigações legais de retenção.',
      ]],
      ['9. Limitação de responsabilidade', [
        'Na extensão permitida por lei, o YuiSync não responde por perdas indiretas, lucros cessantes, falhas de terceiros, decisões tomadas exclusivamente com base em conteúdo automatizado ou uso contrário às orientações da plataforma.',
      ]],
      ['10. Contato', [
        `Solicitações relacionadas a estes Termos podem ser enviadas para ${CONTACT_EMAIL}.`,
      ]],
    ],
  },
  exclusao: {
    title: 'Exclusão de Dados do Usuário',
    intro: 'Esta página explica como solicitar a exclusão de dados associados ao YuiSync e às integrações autorizadas, incluindo dados recebidos pelo login da Meta e pelo WhatsApp Business Platform.',
    sections: [
      ['1. Como solicitar', [
        `Envie um e-mail para ${CONTACT_EMAIL} com o assunto “Exclusão de dados — YuiSync”.`,
        'Informe seu nome, e-mail ou telefone associado, nome da empresa que utiliza o YuiSync e uma descrição do que deseja excluir.',
        'Não envie senhas, tokens, códigos de autenticação ou documentos completos no primeiro contato.',
      ]],
      ['2. Confirmação de identidade', [
        'Para impedir exclusões indevidas, poderemos pedir informações adicionais que comprovem a identidade, a titularidade da conta ou o vínculo com a empresa responsável pelo cadastro.',
      ]],
      ['3. Prazo e acompanhamento', [
        'Confirmaremos o recebimento e informaremos o andamento da solicitação. O prazo depende da complexidade, das obrigações legais e da necessidade de consultar a empresa cliente que controla os dados.',
        'Quando aplicável, forneceremos confirmação da exclusão ou explicaremos os dados que precisam ser mantidos e a respectiva justificativa.',
      ]],
      ['4. O que pode ser excluído', [
        'Dados de perfil, identificadores vinculados à Meta, históricos de conversa, arquivos, sessões, preferências e outros registros associados ao usuário podem ser excluídos ou anonimizados quando não houver obrigação de retenção.',
      ]],
      ['5. Dados que podem ser preservados', [
        'Registros fiscais, financeiros, antifraude, segurança, auditoria, exercício de direitos e cumprimento de obrigação legal podem ser preservados pelo período exigido.',
        'Dados armazenados em cópias de segurança podem permanecer temporariamente até o ciclo normal de substituição, sem voltar ao uso operacional.',
      ]],
      ['6. Desconexão da Meta ou WhatsApp', [
        'A remoção do acesso do YuiSync no painel da Meta interrompe futuras autorizações, mas não substitui uma solicitação de exclusão dos dados já armazenados.',
        'Para excluir os registros mantidos no YuiSync, siga o procedimento desta página.',
      ]],
      ['7. Solicitações feitas por clientes finais', [
        'Quando os dados foram cadastrados por uma empresa que utiliza o YuiSync, essa empresa normalmente atua como controladora. Encaminharemos ou coordenaremos a solicitação com ela quando necessário.',
      ]],
    ],
  },
}

export default function PublicLegalPage({ documentKey }) {
  const legalDocument = documents[documentKey]

  useEffect(() => {
    window.document.title = `${legalDocument.title} | YuiSync`

    const previousHtmlOverflow = window.document.documentElement.style.overflow
    const previousBodyOverflow = window.document.body.style.overflow
    window.document.documentElement.style.overflow = 'auto'
    window.document.body.style.overflow = 'auto'

    return () => {
      window.document.documentElement.style.overflow = previousHtmlOverflow
      window.document.body.style.overflow = previousBodyOverflow
    }
  }, [legalDocument.title])

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07111f] text-slate-100">
      <header className="border-b border-white/10 bg-[#09182a]/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
          <Link to="/" className="text-xl font-black tracking-tight text-white">YuiSync</Link>
          <nav className="flex gap-4 text-sm text-slate-300">
            <Link className="hover:text-white" to="/privacidade">Privacidade</Link>
            <Link className="hover:text-white" to="/termos">Termos</Link>
            <Link className="hover:text-white" to="/exclusao-de-dados">Exclusão</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-emerald-400">Documento público do YuiSync</p>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">{legalDocument.title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">{legalDocument.intro}</p>
        <p className="mt-3 text-sm text-slate-400">Última atualização: {LAST_UPDATED}</p>

        <div className="mt-10 space-y-8">
          {legalDocument.sections.map(([heading, paragraphs]) => (
            <section key={heading} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
              <h2 className="text-xl font-bold text-white">{heading}</h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300 sm:text-base">
                {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-white/10 pt-6 text-sm leading-6 text-slate-400">
          <p>Responsável pelo documento: Yui Sync — Juiz de Fora, Minas Gerais, Brasil.</p>
          <p>Contato: <a className="text-emerald-400 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </footer>
      </article>
    </main>
  )
}
