import { listarNaoConformidades, salvarPlanoAcao } from './api.js';
import { EMPRESAS } from './config.js';
import { gerarPdfPlanoAcao, gerarPdfNaoConformidade } from './gerarPdf.js';

export function criarEstadoPlanoAcao() {
  return {
    lista: [],
    carregando: true,
    filtroEmpresa: '',
    filtroStatus: '', // '' | 'pendente' | 'concluido'
    filtroVerificacaoId: null // quando definido, mostra só as NCs dessa verificação
  };
}

export async function montarTelaPlanoAcao(container, estado, salvarEstado, abrirVerificacaoOrigem) {
  container.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'conteudo';

  const avisoFiltro = estado.filtroVerificacaoId ? `
    <div class="linha" style="align-items:center;background:rgba(201,162,39,0.1);border:1px solid var(--cor-dourado);border-radius:var(--raio-pequeno);padding:10px 14px;margin-bottom:16px;">
      <span style="flex:1;color:var(--cor-dourado-claro);font-size:13px;">Mostrando só as NCs desta verificação</span>
      <button class="botao botao--secundario" id="botao-limpar-filtro-verificacao" style="padding:6px 12px;font-size:12px;">Ver todas</button>
    </div>
  ` : '';

  div.innerHTML = `
    <h2 style="margin-bottom:16px;">Plano de Ação</h2>

    ${avisoFiltro}

    <div class="linha" style="margin-bottom:12px;">
      <select id="filtro-empresa-plano" style="flex:1;">
        <option value="">Todas as empresas</option>
        ${EMPRESAS.map(e => `<option value="${e}" ${estado.filtroEmpresa === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
      <select id="filtro-status-plano" style="flex:1;">
        <option value="">Todos os status</option>
        <option value="pendente" ${estado.filtroStatus === 'pendente' ? 'selected' : ''}>Pendentes</option>
        <option value="concluido" ${estado.filtroStatus === 'concluido' ? 'selected' : ''}>Concluídos</option>
      </select>
    </div>

    <div id="lista-plano"></div>

    <button class="botao botao--secundario botao--bloco" id="botao-pdf-plano" style="margin-top:16px;">Gerar PDF (lista filtrada)</button>
  `;
  container.appendChild(div);

  const botaoLimparFiltro = div.querySelector('#botao-limpar-filtro-verificacao');
  if (botaoLimparFiltro) {
    botaoLimparFiltro.addEventListener('click', () => {
      estado.filtroVerificacaoId = null;
      salvarEstado(estado);
    });
  }

  div.querySelector('#botao-pdf-plano').addEventListener('click', () => {
    const listaFiltrada = filtrarLista(estado);
    if (listaFiltrada.length === 0) {
      alert('Nenhuma não conformidade para gerar PDF com os filtros atuais.');
      return;
    }
    gerarPdfPlanoAcao(listaFiltrada);
  });

  const listaPlano = div.querySelector('#lista-plano');
  renderLista(listaPlano, estado, salvarEstado, abrirVerificacaoOrigem);

  const aplicarFiltro = () => {
    estado.filtroEmpresa = div.querySelector('#filtro-empresa-plano').value;
    estado.filtroStatus = div.querySelector('#filtro-status-plano').value;
    salvarEstado(estado);
  };
  div.querySelector('#filtro-empresa-plano').addEventListener('change', aplicarFiltro);
  div.querySelector('#filtro-status-plano').addEventListener('change', aplicarFiltro);

  if (estado.carregando) {
    try {
      estado.lista = await listarNaoConformidades();
    } catch (e) {
      estado.lista = [];
    }
    estado.carregando = false;
    renderLista(listaPlano, estado, salvarEstado, abrirVerificacaoOrigem);
  }
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

function filtrarLista(estado) {
  let lista = estado.lista;
  if (estado.filtroVerificacaoId) {
    lista = lista.filter(i => i.verificacao_id === estado.filtroVerificacaoId);
  }
  if (estado.filtroEmpresa) {
    lista = lista.filter(i => i.empresa === estado.filtroEmpresa);
  }
  if (estado.filtroStatus === 'pendente') {
    lista = lista.filter(i => !i.data_realizada);
  } else if (estado.filtroStatus === 'concluido') {
    lista = lista.filter(i => !!i.data_realizada);
  }
  return lista;
}

function renderLista(container, estado, salvarEstado, abrirVerificacaoOrigem) {
  if (estado.carregando) {
    container.innerHTML = `<div class="estado-vazio">Carregando...</div>`;
    return;
  }

  const lista = filtrarLista(estado);

  if (lista.length === 0) {
    container.innerHTML = `<div class="estado-vazio">Nenhuma não conformidade encontrada.</div>`;
    return;
  }

  container.innerHTML = '';
  lista.forEach(nc => {
    container.appendChild(montarCartaoNC(nc, salvarEstado, estado, abrirVerificacaoOrigem));
  });
}

export function montarCartaoNC(nc, salvarEstado, estado, abrirVerificacaoOrigem) {
  const cartao = document.createElement('div');
  cartao.className = 'cartao-item';

  const concluido = !!nc.data_realizada;

  cartao.innerHTML = `
    <div class="cartao-item__cabecalho">
      <div>
        <span class="item-historico__empresa">${nc.empresa}</span>
        <div class="cartao-item__numero" style="margin-top:6px;">${formatarDataBR(nc.data)} · Folha ${nc.folha} · Item ${String(nc.numero_item).padStart(2, '0')}</div>
        <div class="cartao-item__nome">${nc.nome_item}</div>
      </div>
      <div style="color:${concluido ? 'var(--cor-conforme)' : 'var(--cor-nao-conforme)'};font-weight:700;font-size:12px;white-space:nowrap;">
        ${concluido ? 'CONCLUÍDO' : 'PENDENTE'}
      </div>
    </div>

    ${nc.descricao ? `<p style="margin-top:10px;color:var(--cor-texto-suave);font-size:14px;">${nc.descricao}</p>` : ''}

    <div class="cartao-item__detalhe">
      <div class="campo" style="margin-bottom:8px;">
        <label>Ação corretiva</label>
        <textarea rows="2" placeholder="Descreva a ação corretiva...">${nc.acao_corretiva || ''}</textarea>
      </div>
      <div class="linha">
        <div class="campo" style="flex:1;">
          <label>Responsável</label>
          <input type="text" placeholder="Nome" value="${nc.responsavel || ''}" data-campo="responsavel" />
        </div>
      </div>
      <div class="linha">
        <div class="campo" style="flex:1;">
          <label>Data prevista</label>
          <input type="date" value="${nc.data_prevista || ''}" data-campo="data_prevista" />
        </div>
        <div class="campo" style="flex:1;">
          <label>Data realizada</label>
          <input type="date" value="${nc.data_realizada || ''}" data-campo="data_realizada" />
        </div>
      </div>
      <div class="linha" style="margin-top:4px;">
        <button class="botao botao--secundario" id="botao-ver-origem" style="flex:1;">Ver verificação de origem</button>
        <button class="botao botao--secundario" id="botao-pdf-nc" style="flex:1;">Gerar PDF desta NC</button>
      </div>
    </div>
  `;

  const textarea = cartao.querySelector('textarea');
  const campoResponsavel = cartao.querySelector('[data-campo="responsavel"]');
  const campoDataPrevista = cartao.querySelector('[data-campo="data_prevista"]');
  const campoDataRealizada = cartao.querySelector('[data-campo="data_realizada"]');

  const salvar = async () => {
    nc.acao_corretiva = textarea.value;
    nc.responsavel = campoResponsavel.value;
    nc.data_prevista = campoDataPrevista.value;
    nc.data_realizada = campoDataRealizada.value;

    await salvarPlanoAcao({
      verificacao_id: nc.verificacao_id,
      numero_item: nc.numero_item,
      acao_corretiva: nc.acao_corretiva,
      responsavel: nc.responsavel,
      data_prevista: nc.data_prevista,
      data_realizada: nc.data_realizada
    });

    salvarEstado(estado);
  };

  [textarea, campoResponsavel].forEach(campo => campo.addEventListener('blur', salvar));
  [campoDataPrevista, campoDataRealizada].forEach(campo => campo.addEventListener('change', salvar));

  cartao.querySelector('#botao-pdf-nc').addEventListener('click', () => {
    gerarPdfNaoConformidade(nc);
  });

  cartao.querySelector('#botao-ver-origem').addEventListener('click', () => {
    abrirVerificacaoOrigem(nc.verificacao_id);
  });

  return cartao;
}
