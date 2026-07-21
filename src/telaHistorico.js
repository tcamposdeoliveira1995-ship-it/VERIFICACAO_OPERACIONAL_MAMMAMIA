import { EMPRESAS } from './config.js';
import { listarVerificacoes, obterVerificacao } from './api.js';

export function criarEstadoHistorico() {
  return {
    filtroEmpresa: '',
    filtroDataInicio: '',
    filtroDataFim: '',
    lista: [],
    carregando: true,
    verificacaoAberta: null // detalhe carregado ao clicar num item
  };
}

export async function montarTelaHistorico(container, estado, salvarEstado, novaVerificacao, abrirPdf, abrirPlanoAcao) {
  container.innerHTML = '';

  if (estado.verificacaoAberta) {
    renderDetalhe(container, estado, salvarEstado, abrirPdf, abrirPlanoAcao);
    return;
  }

  const div = document.createElement('div');
  div.className = 'conteudo';

  div.innerHTML = `
    <h2 style="margin-bottom:16px;">Histórico</h2>

    <div class="linha" style="margin-bottom:12px;">
      <select id="filtro-empresa" style="flex:1;">
        <option value="">Todas as empresas</option>
        ${EMPRESAS.map(e => `<option value="${e}" ${estado.filtroEmpresa === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
    </div>
    <div class="linha" style="margin-bottom:20px;">
      <input type="date" id="filtro-data-inicio" value="${estado.filtroDataInicio}" style="flex:1;" />
      <input type="date" id="filtro-data-fim" value="${estado.filtroDataFim}" style="flex:1;" />
    </div>

    <div id="lista-resultado"></div>
  `;

  container.appendChild(div);

  const listaResultado = div.querySelector('#lista-resultado');
  renderLista(listaResultado, estado, salvarEstado, abrirPdf);

  const aplicarFiltro = async () => {
    estado.filtroEmpresa = div.querySelector('#filtro-empresa').value;
    estado.filtroDataInicio = div.querySelector('#filtro-data-inicio').value;
    estado.filtroDataFim = div.querySelector('#filtro-data-fim').value;
    estado.carregando = true;
    renderLista(listaResultado, estado, salvarEstado, abrirPdf);
    await carregarLista(estado);
    renderLista(listaResultado, estado, salvarEstado, abrirPdf);
  };

  div.querySelector('#filtro-empresa').addEventListener('change', aplicarFiltro);
  div.querySelector('#filtro-data-inicio').addEventListener('change', aplicarFiltro);
  div.querySelector('#filtro-data-fim').addEventListener('change', aplicarFiltro);

  if (estado.carregando) {
    await carregarLista(estado);
    renderLista(listaResultado, estado, salvarEstado, abrirPdf);
  }

  const botaoNova = document.createElement('div');
  botaoNova.className = 'barra-inferior';
  botaoNova.innerHTML = `<button class="botao botao--primario botao--bloco" id="botao-nova">+ Nova verificação</button>`;
  botaoNova.querySelector('#botao-nova').addEventListener('click', novaVerificacao);
  container.appendChild(botaoNova);
}

async function carregarLista(estado) {
  try {
    estado.lista = await listarVerificacoes({
      empresa: estado.filtroEmpresa || undefined,
      dataInicio: estado.filtroDataInicio || undefined,
      dataFim: estado.filtroDataFim || undefined
    });
  } catch (e) {
    estado.lista = [];
  }
  estado.carregando = false;
}

function renderLista(container, estado, salvarEstado, abrirPdf) {
  if (estado.carregando) {
    container.innerHTML = `<div class="estado-vazio">Carregando...</div>`;
    return;
  }

  if (!estado.lista || estado.lista.length === 0) {
    container.innerHTML = `<div class="estado-vazio">Nenhuma verificação encontrada.</div>`;
    return;
  }

  container.innerHTML = '';
  estado.lista.forEach(v => {
    const item = document.createElement('div');
    item.className = 'item-historico';
    item.style.flexDirection = 'column';
    item.style.alignItems = 'stretch';
    item.style.gap = '10px';

    const linhaAbrir = document.createElement('div');
    linhaAbrir.style.display = 'flex';
    linhaAbrir.style.justifyContent = 'space-between';
    linhaAbrir.style.alignItems = 'center';
    linhaAbrir.style.cursor = 'pointer';
    linhaAbrir.innerHTML = `
      <div>
        <span class="item-historico__empresa">${v.empresa}</span>
        <div class="item-historico__data">${formatarDataBR(v.data)}</div>
        <div class="item-historico__meta">${v.responsavel_verificacao} · Folha ${v.folha} · ${v.status_geral === 'concluida' ? 'Concluída' : 'Em andamento'}</div>
      </div>
      <div style="color:var(--cor-texto-fraco);font-size:20px;">›</div>
    `;
    linhaAbrir.addEventListener('click', async () => {
      estado.verificacaoAberta = { id: v.id, carregando: true };
      salvarEstado(estado);
      const detalhe = await obterVerificacao(v.id);
      estado.verificacaoAberta = { id: v.id, carregando: false, dados: detalhe };
      salvarEstado(estado);
    });
    item.appendChild(linhaAbrir);

    const botaoPdf = document.createElement('button');
    botaoPdf.className = 'botao botao--secundario botao--bloco';
    botaoPdf.textContent = 'Gerar PDF';
    botaoPdf.addEventListener('click', async () => {
      botaoPdf.disabled = true;
      botaoPdf.textContent = 'Gerando...';
      try {
        const detalhe = await obterVerificacao(v.id);
        abrirPdf(detalhe);
      } finally {
        botaoPdf.disabled = false;
        botaoPdf.textContent = 'Gerar PDF';
      }
    });
    item.appendChild(botaoPdf);

    container.appendChild(item);
  });
}


function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function renderDetalhe(container, estado, salvarEstado, abrirPdf, abrirPlanoAcao) {
  const div = document.createElement('div');
  div.className = 'conteudo';

  const aberta = estado.verificacaoAberta;

  if (aberta.carregando) {
    div.innerHTML = `<div class="estado-vazio">Carregando...</div>`;
    container.appendChild(div);
    return;
  }

  if (aberta.dados.erro) {
    div.innerHTML = `<div class="estado-vazio">${aberta.dados.erro}</div>`;
    container.appendChild(div);
    return;
  }

  const { verificacao, itens, temperaturas } = aberta.dados;

  const botaoVoltar = document.createElement('button');
  botaoVoltar.className = 'botao botao--secundario';
  botaoVoltar.style.marginBottom = '16px';
  botaoVoltar.textContent = '← Voltar';
  botaoVoltar.addEventListener('click', () => {
    estado.verificacaoAberta = null;
    salvarEstado(estado);
  });
  div.appendChild(botaoVoltar);

  const cabecalho = document.createElement('div');
  cabecalho.innerHTML = `
    <span class="item-historico__empresa">${verificacao.empresa}</span>
    <h2 style="margin:6px 0;">${formatarDataBR(verificacao.data)}</h2>
    <p style="color:var(--cor-texto-suave);margin-bottom:8px;">
      ${verificacao.horario_inicio} · Folha ${verificacao.folha} · Verificado por ${verificacao.responsavel_verificacao}
    </p>
    ${verificacao.documento_url ? `<a href="${verificacao.documento_url}" target="_blank" style="color:var(--cor-dourado);font-size:13px;">📄 Ver documento original anexado</a>` : ''}
  `;
  div.appendChild(cabecalho);

  itens
    .sort((a, b) => Number(a.numero_item) - Number(b.numero_item))
    .forEach(item => {
      const cartao = document.createElement('div');
      cartao.className = 'cartao-item';
      const fotos = item.fotos ? String(item.fotos).split(',').filter(Boolean) : [];
      const fotosBase64 = item.fotosBase64 || [];
      const statusCor = item.status === 'C' ? 'var(--cor-conforme)' : item.status === 'NC' ? 'var(--cor-nao-conforme)' : 'var(--cor-texto-fraco)';
      cartao.innerHTML = `
        <div class="cartao-item__cabecalho">
          <div>
            <div class="cartao-item__numero">Item ${String(item.numero_item).padStart(2, '0')}</div>
            <div class="cartao-item__nome">${item.nome_item}</div>
          </div>
          <div style="color:${statusCor};font-weight:700;">${item.status || '-'}</div>
        </div>
        ${item.descricao ? `<p style="margin-top:12px;color:var(--cor-texto-suave);">${item.descricao}</p>` : ''}
        ${fotos.length > 0 ? `
          <div class="cartao-item__fotos" style="margin-top:12px;">
            ${fotos.map((url, idx) => `<a href="${url}" target="_blank"><img class="cartao-item__foto" src="${fotosBase64[idx] || url}" /></a>`).join('')}
          </div>` : ''}
      `;
      div.appendChild(cartao);
    });

  if (temperaturas && temperaturas.length > 0) {
    const secaoTemp = document.createElement('div');
    secaoTemp.style.marginTop = '20px';
    secaoTemp.innerHTML = `
      <h3 style="margin-bottom:12px;">Temperatura das câmaras</h3>
      ${temperaturas.map(t => `
        <div class="item-historico" style="cursor:default;">
          <div class="item-historico__data" style="font-size:14px;">${t.identificacao}</div>
          <div style="font-weight:700;">${t.temperatura}°C</div>
        </div>
      `).join('')}
    `;
    div.appendChild(secaoTemp);
  }

  if (verificacao.observacao) {
    const observacao = document.createElement('div');
    observacao.style.marginTop = '20px';
    observacao.className = 'cartao-item';
    observacao.innerHTML = `
      <div style="font-size:14px;font-weight:600;margin-bottom:6px;">Observação</div>
      <p style="color:var(--cor-texto-suave);white-space:pre-wrap;">${verificacao.observacao}</p>
    `;
    div.appendChild(observacao);
  }

  if (verificacao.responsavel_auditoria) {
    const assinaturas = document.createElement('div');
    assinaturas.style.marginTop = '20px';
    assinaturas.style.color = 'var(--cor-texto-suave)';
    assinaturas.style.fontSize = '13px';
    assinaturas.innerHTML = `
      <p>Responsável pela auditoria: <strong style="color:var(--cor-texto);">${verificacao.responsavel_auditoria}</strong></p>
      <p>Responsável pela empresa: <strong style="color:var(--cor-texto);">${verificacao.responsavel_empresa}</strong></p>
    `;
    div.appendChild(assinaturas);
  }

  const temNC = itens.some(item => item.status === 'NC');
  if (temNC) {
    const botaoPlano = document.createElement('button');
    botaoPlano.className = 'botao botao--secundario botao--bloco';
    botaoPlano.style.marginTop = '24px';
    botaoPlano.textContent = 'Ver plano de ação desta verificação';
    botaoPlano.addEventListener('click', () => abrirPlanoAcao(verificacao.id));
    div.appendChild(botaoPlano);
  }

  const botaoPdf = document.createElement('button');
  botaoPdf.className = 'botao botao--primario botao--bloco';
  botaoPdf.style.marginTop = '12px';
  botaoPdf.textContent = 'Gerar PDF';
  botaoPdf.addEventListener('click', () => abrirPdf(aberta.dados));
  div.appendChild(botaoPdf);

  container.appendChild(div);
}
