import { listarNaoConformidades } from './api.js';
import { EMPRESAS } from './config.js';
import { montarCartaoNC } from './telaPlanoAcao.js';

export function criarEstadoPainel() {
  return {
    lista: [],
    carregando: true,
    mostrarConcluidas: false
  };
}

export async function montarTelaPainel(container, estado, salvarEstado, abrirVerificacaoOrigem) {
  container.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'conteudo';
  div.innerHTML = `
    <h2 style="margin-bottom:4px;">Painel</h2>
    <p style="color:var(--cor-texto-suave);margin-bottom:16px;font-size:13px;">Não conformidades por empresa e data, até a resolução</p>

    <div class="linha" style="align-items:center;margin-bottom:16px;">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--cor-texto-suave);font-weight:600;">
        <input type="checkbox" id="toggle-concluidas" ${estado.mostrarConcluidas ? 'checked' : ''} style="width:auto;" />
        Mostrar também as já concluídas
      </label>
    </div>

    <div id="grupos-painel"></div>
  `;
  container.appendChild(div);

  const gruposPainel = div.querySelector('#grupos-painel');
  renderGrupos(gruposPainel, estado, salvarEstado, abrirVerificacaoOrigem);

  div.querySelector('#toggle-concluidas').addEventListener('change', e => {
    estado.mostrarConcluidas = e.target.checked;
    salvarEstado(estado);
  });

  if (estado.carregando) {
    try {
      estado.lista = await listarNaoConformidades();
    } catch (e) {
      estado.lista = [];
    }
    estado.carregando = false;
    renderGrupos(gruposPainel, estado, salvarEstado, abrirVerificacaoOrigem);
  }
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

function renderGrupos(container, estado, salvarEstado, abrirVerificacaoOrigem) {
  if (estado.carregando) {
    container.innerHTML = `<div class="estado-vazio">Carregando...</div>`;
    return;
  }

  const lista = estado.mostrarConcluidas
    ? estado.lista
    : estado.lista.filter(nc => !nc.data_realizada);

  if (lista.length === 0) {
    container.innerHTML = `<div class="estado-vazio">Nenhuma não conformidade pendente. 🎉</div>`;
    return;
  }

  container.innerHTML = '';

  EMPRESAS.forEach(empresa => {
    const ncsDaEmpresa = lista.filter(nc => nc.empresa === empresa);
    if (ncsDaEmpresa.length === 0) return;

    const blocoEmpresa = document.createElement('div');
    blocoEmpresa.style.marginBottom = '28px';

    const tituloEmpresa = document.createElement('h3');
    tituloEmpresa.style.marginBottom = '12px';
    tituloEmpresa.style.display = 'flex';
    tituloEmpresa.style.alignItems = 'center';
    tituloEmpresa.style.gap = '10px';
    tituloEmpresa.innerHTML = `
      <span>${empresa}</span>
      <span style="font-family:var(--fonte-corpo);font-size:12px;font-weight:600;color:var(--cor-texto-fraco);">${ncsDaEmpresa.length} NC${ncsDaEmpresa.length > 1 ? 's' : ''}</span>
    `;
    blocoEmpresa.appendChild(tituloEmpresa);

    const datasUnicas = [...new Set(ncsDaEmpresa.map(nc => nc.data))].sort((a, b) => (a < b ? 1 : -1));

    datasUnicas.forEach(data => {
      const ncsDaData = ncsDaEmpresa.filter(nc => nc.data === data);

      const tituloData = document.createElement('div');
      tituloData.style.fontSize = '13px';
      tituloData.style.fontWeight = '700';
      tituloData.style.color = 'var(--cor-dourado)';
      tituloData.style.margin = '14px 0 8px';
      tituloData.textContent = formatarDataBR(data);
      blocoEmpresa.appendChild(tituloData);

      ncsDaData.forEach(nc => {
        blocoEmpresa.appendChild(montarCartaoNC(nc, salvarEstado, estado, abrirVerificacaoOrigem));
      });
    });

    container.appendChild(blocoEmpresa);
  });
}
