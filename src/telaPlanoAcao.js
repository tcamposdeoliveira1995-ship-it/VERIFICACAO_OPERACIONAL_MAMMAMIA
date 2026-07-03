import { listarNaoConformidades, salvarPlanoAcao } from './api.js';
import { EMPRESAS } from './config.js';

export function criarEstadoPlanoAcao() {
  return {
    lista: [],
    carregando: true,
    filtroEmpresa: '',
    filtroStatus: '' // '' | 'pendente' | 'concluido'
  };
}

export async function montarTelaPlanoAcao(container, estado, salvarEstado) {
  container.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'conteudo';
  div.innerHTML = `
    <h2 style="margin-bottom:16px;">Plano de Ação</h2>

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
  `;
  container.appendChild(div);

  const listaPlano = div.querySelector('#lista-plano');
  renderLista(listaPlano, estado, salvarEstado);

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
    renderLista(listaPlano, estado, salvarEstado);
  }
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

function renderLista(container, estado, salvarEstado) {
  if (estado.carregando) {
    container.innerHTML = `<div class="estado-vazio">Carregando...</div>`;
    return;
  }

  let lista = estado.lista;
  if (estado.filtroEmpresa) {
    lista = lista.filter(i => i.empresa === estado.filtroEmpresa);
  }
  if (estado.filtroStatus === 'pendente') {
    lista = lista.filter(i => !i.data_realizada);
  } else if (estado.filtroStatus === 'concluido') {
    lista = lista.filter(i => !!i.data_realizada);
  }

  if (lista.length === 0) {
    container.innerHTML = `<div class="estado-vazio">Nenhuma não conformidade encontrada.</div>`;
    return;
  }

  container.innerHTML = '';
  lista.forEach(nc => {
    container.appendChild(montarCartaoNC(nc, salvarEstado, estado));
  });
}

function montarCartaoNC(nc, salvarEstado, estado) {
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

  return cartao;
}
