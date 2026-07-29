import { EMPRESAS } from './config.js';
import { importarPdfRL } from './importarPdfRL.js';
import {
  gerarId,
  contarFolhas,
  criarVerificacao,
  salvarItem,
  finalizarVerificacao,
  salvarPlanoAcao,
  anexarDocumento,
  arquivoGenericoParaBase64
} from './api.js';

const ORDEM_PRIORIDADE = { ALTA: 3, 'MÉDIA': 2, BAIXA: 1 };

function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function criarEstadoImportarPdf() {
  return {
    etapa: 'upload', // upload -> revisao -> concluido
    arquivoOriginal: null,
    processando: false,
    salvando: false,
    erro: '',
    avisos: [],
    empresa: '',
    data: hojeISO(),
    horarioInicio: '',
    responsavelVerificacao: '',
    itensRevisao: [], // [{ numero, nome, status, descricao, acaoCorretiva, prioridade, quantidadeNCsOriginais }]
    responsavelAuditoria: '',
    responsavelEmpresa: '',
    observacao: '',
    verificacaoId: null
  };
}

/* Junta o texto de várias NCs do PDF que caem no mesmo item (o sistema hoje
   só guarda uma ação corretiva por item por verificação) */
function mesclarNCsDoItem(ncsDoItem) {
  if (ncsDoItem.length === 1) {
    const [nc] = ncsDoItem;
    return { descricao: nc.descricao, acaoCorretiva: nc.acaoCorretiva, prioridade: nc.prioridade };
  }

  let prioridade = ncsDoItem[0].prioridade;
  ncsDoItem.forEach(nc => {
    if ((ORDEM_PRIORIDADE[nc.prioridade] || 0) > (ORDEM_PRIORIDADE[prioridade] || 0)) prioridade = nc.prioridade;
  });

  const descricao = ncsDoItem.map((nc, i) => `${i + 1}) ${nc.descricao}`).join('\n');
  const acaoCorretiva = ncsDoItem.map((nc, i) => `${i + 1}) ${nc.acaoCorretiva}`).join('\n');

  return { descricao, acaoCorretiva, prioridade };
}

function construirItensRevisao(resultado, avisos) {
  const ncsPorItem = {};
  resultado.naoConformidades.forEach(nc => {
    if (!ncsPorItem[nc.numero_item]) ncsPorItem[nc.numero_item] = [];
    ncsPorItem[nc.numero_item].push(nc);
  });

  return resultado.itens.map(item => {
    const ncsDoItem = ncsPorItem[item.numero] || [];

    if (ncsDoItem.length > 1) {
      avisos.push(`Item ${String(item.numero).padStart(2, '0')} (${item.nome}) tinha ${ncsDoItem.length} não conformidades no PDF — foram unidas em uma só. Revise o texto antes de salvar.`);
    }

    if (item.status === 'NC') {
      const mesclado = mesclarNCsDoItem(ncsDoItem.length > 0 ? ncsDoItem : [{ descricao: '', acaoCorretiva: '', prioridade: 'MÉDIA' }]);
      return {
        numero: item.numero,
        nome: item.nome,
        status: 'NC',
        descricao: mesclado.descricao,
        acaoCorretiva: mesclado.acaoCorretiva,
        prioridade: mesclado.prioridade,
        quantidadeNCsOriginais: ncsDoItem.length
      };
    }

    return {
      numero: item.numero,
      nome: item.nome,
      status: item.status, // 'C' ou null (não identificado no PDF)
      descricao: '',
      acaoCorretiva: '',
      prioridade: 'MÉDIA',
      quantidadeNCsOriginais: 0
    };
  });
}

export function montarTelaImportarPdf(container, estado, salvarEstado, irParaPlanoAcao) {
  container.innerHTML = '';

  if (estado.etapa === 'upload') {
    renderUpload(container, estado, salvarEstado);
  } else if (estado.etapa === 'revisao') {
    renderRevisao(container, estado, salvarEstado, irParaPlanoAcao);
  } else {
    renderConcluido(container, estado, salvarEstado, irParaPlanoAcao);
  }
}

/* ---------- Etapa: upload ---------- */

function renderUpload(container, estado, salvarEstado) {
  const div = document.createElement('div');
  div.className = 'conteudo';
  div.innerHTML = `
    <h2 style="margin-bottom:4px;">Importar PDF da R&L</h2>
    <p style="color:var(--cor-texto-suave);margin-bottom:20px;font-size:14px;">
      Envie o PDF de Verificação Técnica Operacional gerado pela R&L. O sistema lê os itens e as
      não conformidades automaticamente — você só confere e ajusta antes de salvar.
    </p>

    <div class="campo">
      <label>Arquivo PDF</label>
      <input type="file" accept="application/pdf" id="input-pdf" />
    </div>

    ${estado.erro ? `<div class="cartao-item" style="border-color:var(--cor-nao-conforme);color:var(--cor-nao-conforme);margin-bottom:16px;">${estado.erro}</div>` : ''}

    <button class="botao botao--primario botao--bloco" id="botao-processar" ${estado.processando ? 'disabled' : ''}>
      ${estado.processando ? 'Lendo PDF...' : 'Processar PDF'}
    </button>
  `;
  container.appendChild(div);

  let arquivoSelecionado = null;
  const inputPdf = div.querySelector('#input-pdf');
  const botaoProcessar = div.querySelector('#botao-processar');

  inputPdf.addEventListener('change', () => {
    arquivoSelecionado = inputPdf.files[0] || null;
  });

  botaoProcessar.addEventListener('click', async () => {
    if (!arquivoSelecionado) {
      alert('Selecione o arquivo PDF primeiro.');
      return;
    }

    estado.processando = true;
    estado.erro = '';
    salvarEstado(estado);

    try {
      const resultado = await importarPdfRL(arquivoSelecionado);

      const avisos = [...resultado.avisos];
      const itensRevisao = construirItensRevisao(resultado, avisos);

      estado.arquivoOriginal = arquivoSelecionado;
      estado.avisos = avisos;
      estado.itensRevisao = itensRevisao;
      estado.empresa = resultado.empresa || '';
      estado.data = resultado.data || hojeISO();
      estado.horarioInicio = resultado.horarioInicio || '';
      estado.responsavelVerificacao = resultado.responsavelVerificacao || '';
      estado.etapa = 'revisao';
      estado.processando = false;
      salvarEstado(estado);
    } catch (e) {
      estado.processando = false;
      estado.erro = 'Não foi possível ler esse PDF. Confira se é o arquivo certo e tente novamente.';
      salvarEstado(estado);
    }
  });
}

/* ---------- Etapa: revisão ---------- */

function renderRevisao(container, estado, salvarEstado, irParaPlanoAcao) {
  const div = document.createElement('div');
  div.className = 'conteudo';

  const avisosHtml = estado.avisos.length > 0 ? `
    <div class="cartao-item" style="border-color:var(--cor-dourado);background:rgba(201,162,39,0.08);margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--cor-dourado);margin-bottom:6px;">Confira antes de salvar</div>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--cor-texto-suave);">
        ${estado.avisos.map(a => `<li style="margin-bottom:4px;">${a}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  div.innerHTML = `
    <h2 style="margin-bottom:16px;">Conferir importação</h2>
    ${avisosHtml}

    <div class="campo">
      <label>Empresa</label>
      <select id="campo-empresa">
        <option value="">Selecione</option>
        ${EMPRESAS.map(e => `<option value="${e}" ${estado.empresa === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
    </div>
    <div class="linha">
      <div class="campo" style="flex:1;">
        <label>Data</label>
        <input type="date" id="campo-data" value="${estado.data}" />
      </div>
      <div class="campo" style="flex:1;">
        <label>Horário de início</label>
        <input type="text" id="campo-horario" value="${estado.horarioInicio}" />
      </div>
    </div>
    <div class="campo">
      <label>Responsável pela verificação (R&L)</label>
      <input type="text" id="campo-responsavel-verificacao" value="${estado.responsavelVerificacao}" />
    </div>

    <h3 style="margin:20px 0 12px;">Itens (${estado.itensRevisao.length})</h3>
    <div id="lista-itens-revisao"></div>

    <h3 style="margin:24px 0 12px;">Finalização</h3>
    <div class="campo">
      <label>Responsável pela auditoria</label>
      <input type="text" id="campo-resp-auditoria" placeholder="Nome" value="${estado.responsavelAuditoria}" />
    </div>
    <div class="campo">
      <label>Responsável pela empresa</label>
      <input type="text" id="campo-resp-empresa" placeholder="Nome" value="${estado.responsavelEmpresa}" />
    </div>
    <div class="campo">
      <label>Observação (opcional)</label>
      <textarea id="campo-observacao" rows="3">${estado.observacao}</textarea>
    </div>

    <button class="botao botao--primario botao--bloco" id="botao-salvar" ${estado.salvando ? 'disabled' : ''}>
      ${estado.salvando ? 'Salvando...' : 'Confirmar e salvar'}
    </button>
  `;
  container.appendChild(div);

  div.querySelector('#campo-empresa').addEventListener('change', e => { estado.empresa = e.target.value; });
  div.querySelector('#campo-data').addEventListener('change', e => { estado.data = e.target.value; });
  div.querySelector('#campo-horario').addEventListener('input', e => { estado.horarioInicio = e.target.value; });
  div.querySelector('#campo-responsavel-verificacao').addEventListener('input', e => { estado.responsavelVerificacao = e.target.value; });
  div.querySelector('#campo-resp-auditoria').addEventListener('input', e => { estado.responsavelAuditoria = e.target.value; });
  div.querySelector('#campo-resp-empresa').addEventListener('input', e => { estado.responsavelEmpresa = e.target.value; });
  div.querySelector('#campo-observacao').addEventListener('input', e => { estado.observacao = e.target.value; });

  const listaItens = div.querySelector('#lista-itens-revisao');
  estado.itensRevisao.forEach(item => {
    listaItens.appendChild(montarCartaoItemRevisao(item));
  });

  div.querySelector('#botao-salvar').addEventListener('click', () => {
    salvarImportacao(estado, salvarEstado, irParaPlanoAcao);
  });
}

function montarCartaoItemRevisao(item) {
  const cartao = document.createElement('div');
  cartao.className = 'cartao-item';
  cartao.style.marginBottom = '12px';

  cartao.innerHTML = `
    <div class="cartao-item__cabecalho">
      <div>
        <div class="cartao-item__numero">Item ${String(item.numero).padStart(2, '0')}</div>
        <div class="cartao-item__nome">${item.nome}</div>
      </div>
      <div class="cartao-item__status">
        <button class="status-toggle status-toggle--c ${item.status === 'C' ? 'ativo' : ''}" data-status="C">C</button>
        <button class="status-toggle status-toggle--nc ${item.status === 'NC' ? 'ativo' : ''}" data-status="NC">NC</button>
      </div>
    </div>
    <div class="cartao-item__detalhe" data-bloco-nc style="${item.status === 'NC' ? '' : 'display:none;'}">
      <div class="campo" style="margin-bottom:8px;">
        <label>Descrição da não conformidade</label>
        <textarea rows="2" data-campo="descricao">${item.descricao}</textarea>
      </div>
      <div class="campo" style="margin-bottom:8px;">
        <label>Ação corretiva</label>
        <textarea rows="2" data-campo="acaoCorretiva">${item.acaoCorretiva}</textarea>
      </div>
      <div class="campo">
        <label>Prioridade</label>
        <select data-campo="prioridade">
          ${['ALTA', 'MÉDIA', 'BAIXA'].map(p => `<option value="${p}" ${item.prioridade === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>
  `;

  const blocoNC = cartao.querySelector('[data-bloco-nc]');

  cartao.querySelectorAll('[data-status]').forEach(botao => {
    botao.addEventListener('click', () => {
      item.status = botao.dataset.status;
      cartao.querySelectorAll('[data-status]').forEach(b => b.classList.remove('ativo'));
      botao.classList.add('ativo');
      blocoNC.style.display = item.status === 'NC' ? '' : 'none';
    });
  });

  cartao.querySelector('[data-campo="descricao"]').addEventListener('input', e => { item.descricao = e.target.value; });
  cartao.querySelector('[data-campo="acaoCorretiva"]').addEventListener('input', e => { item.acaoCorretiva = e.target.value; });
  cartao.querySelector('[data-campo="prioridade"]').addEventListener('change', e => { item.prioridade = e.target.value; });

  return cartao;
}

/* ---------- Gravação ---------- */

async function salvarImportacao(estado, salvarEstado, irParaPlanoAcao) {
  if (!estado.empresa || !estado.data || !estado.horarioInicio.trim() || !estado.responsavelVerificacao.trim()) {
    alert('Preencha empresa, data, horário e responsável pela verificação.');
    return;
  }
  if (!estado.responsavelAuditoria.trim() || !estado.responsavelEmpresa.trim()) {
    alert('Preencha os dois responsáveis da finalização.');
    return;
  }

  estado.salvando = true;
  salvarEstado(estado);

  const verificacaoId = gerarId();

  let folha = 1;
  try {
    const contagem = await contarFolhas(estado.empresa, estado.data);
    folha = contagem + 1;
  } catch (e) {
    folha = 1;
  }

  await criarVerificacao({
    id: verificacaoId,
    empresa: estado.empresa,
    data: estado.data,
    horario_inicio: estado.horarioInicio.trim(),
    responsavel_verificacao: estado.responsavelVerificacao.trim(),
    folha,
    timestamp_criacao: new Date().toISOString()
  });

  await Promise.all(estado.itensRevisao.map(item => salvarItem({
    verificacao_id: verificacaoId,
    numero_item: item.numero,
    nome_item: item.nome,
    status: item.status,
    descricao: item.status === 'NC' ? item.descricao : '',
    empresa: estado.empresa,
    data: estado.data
  })));

  const itensNC = estado.itensRevisao.filter(item => item.status === 'NC');
  await Promise.all(itensNC.map(item => salvarPlanoAcao({
    verificacao_id: verificacaoId,
    numero_item: item.numero,
    acao_corretiva: `[${item.prioridade}] ${item.acaoCorretiva}`,
    responsavel: '',
    data_prevista: '',
    data_realizada: ''
  })));

  if (estado.arquivoOriginal) {
    try {
      const base64 = await arquivoGenericoParaBase64(estado.arquivoOriginal);
      await anexarDocumento({
        verificacao_id: verificacaoId,
        empresa: estado.empresa,
        data: estado.data,
        nomeArquivo: estado.arquivoOriginal.name,
        arquivoBase64: base64
      });
    } catch (e) {
      // segue mesmo se o anexo do PDF original falhar — não é bloqueante
    }
  }

  await finalizarVerificacao({
    verificacao_id: verificacaoId,
    responsavel_auditoria: estado.responsavelAuditoria.trim(),
    responsavel_empresa: estado.responsavelEmpresa.trim(),
    observacao: estado.observacao.trim(),
    confirmado_em: new Date().toISOString()
  });

  estado.verificacaoId = verificacaoId;
  estado.salvando = false;
  estado.etapa = 'concluido';
  salvarEstado(estado);
}

/* ---------- Etapa: concluído ---------- */

function renderConcluido(container, estado, salvarEstado, irParaPlanoAcao) {
  const div = document.createElement('div');
  div.className = 'conteudo';
  const quantidadeNC = estado.itensRevisao.filter(i => i.status === 'NC').length;
  div.innerHTML = `
    <div class="estado-vazio">
      <h2 style="color:var(--cor-conforme);margin-bottom:8px;">Importação concluída</h2>
      <p style="margin-bottom:24px;">
        ${quantidadeNC} não conformidade${quantidadeNC === 1 ? '' : 's'} lançada${quantidadeNC === 1 ? '' : 's'} no Plano de Ação.
      </p>
      <button class="botao botao--primario" id="botao-ver-plano" style="margin-bottom:12px;">Ver Plano de Ação desta verificação</button>
      <br />
      <button class="botao botao--secundario" id="botao-importar-outro">Importar outro PDF</button>
    </div>
  `;
  container.appendChild(div);

  div.querySelector('#botao-ver-plano').addEventListener('click', () => irParaPlanoAcao(estado.verificacaoId));
  div.querySelector('#botao-importar-outro').addEventListener('click', () => {
    Object.assign(estado, criarEstadoImportarPdf());
    salvarEstado(estado);
  });
}
