import { ITENS_PADRAO, EMPRESAS } from './config.js';
import {
  gerarId,
  contarFolhas,
  criarVerificacao,
  salvarItem,
  salvarTemperatura,
  removerTemperatura,
  finalizarVerificacao,
  arquivoParaBase64,
  arquivoGenericoParaBase64,
  anexarDocumento
} from './api.js';

function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function criarEstadoInicial() {
  return {
    etapa: 'empresa', // empresa -> cabecalho -> formulario -> concluido
    verificacaoId: null,
    empresa: null,
    data: hojeISO(),
    horarioInicio: '',
    responsavelVerificacao: '',
    folha: 1,
    itens: ITENS_PADRAO.map(i => ({ ...i, status: null, descricao: '', fotosPreview: [] })),
    temperaturas: [],
    responsavelAuditoria: '',
    responsavelEmpresa: '',
    documentoAnexado: false
  };
}

export function montarTelaNovaVerificacao(container, estado, salvarEstado, irParaHistorico) {
  container.innerHTML = '';

  if (estado.etapa === 'empresa') {
    renderEscolhaEmpresa(container, estado, salvarEstado);
  } else if (estado.etapa === 'cabecalho') {
    renderCabecalho(container, estado, salvarEstado);
  } else if (estado.etapa === 'formulario') {
    renderFormulario(container, estado, salvarEstado);
  } else if (estado.etapa === 'concluido') {
    renderConcluido(container, irParaHistorico);
  }
}

/* ---------- Etapa: escolha da empresa ---------- */

function renderEscolhaEmpresa(container, estado, salvarEstado) {
  const div = document.createElement('div');
  div.className = 'conteudo';
  div.innerHTML = `
    <h2 style="margin-bottom:16px;">Qual empresa?</h2>
    <div class="seletor-empresa">
      ${EMPRESAS.map(emp => `
        <button class="seletor-empresa__opcao" data-empresa="${emp}">${emp}</button>
      `).join('')}
    </div>
  `;

  div.querySelectorAll('[data-empresa]').forEach(botao => {
    botao.addEventListener('click', () => {
      estado.empresa = botao.dataset.empresa;
      estado.etapa = 'cabecalho';
      salvarEstado(estado);
    });
  });

  container.appendChild(div);
}

/* ---------- Etapa: cabeçalho ---------- */

function renderCabecalho(container, estado, salvarEstado) {
  const div = document.createElement('div');
  div.className = 'conteudo';
  div.innerHTML = `
    <h2 style="margin-bottom:4px;">${estado.empresa}</h2>
    <p style="color:var(--cor-texto-suave);margin-bottom:20px;">Dados da verificação</p>

    <div class="campo">
      <label>Data</label>
      <input type="date" id="campo-data" value="${estado.data}" />
    </div>
    <div class="campo">
      <label>Horário de início</label>
      <input type="text" id="campo-horario" placeholder="Ex: 9h as 12h" value="${estado.horarioInicio}" />
    </div>
    <div class="campo">
      <label>Responsável pela verificação</label>
      <input type="text" id="campo-responsavel" placeholder="Nome" value="${estado.responsavelVerificacao}" />
    </div>

    <button class="botao botao--primario botao--bloco" id="botao-continuar" disabled>
      Iniciar verificação
    </button>
  `;

  const campoData = div.querySelector('#campo-data');
  const campoHorario = div.querySelector('#campo-horario');
  const campoResponsavel = div.querySelector('#campo-responsavel');
  const botaoContinuar = div.querySelector('#botao-continuar');

  function validar() {
    botaoContinuar.disabled = !(campoData.value && campoHorario.value.trim() && campoResponsavel.value.trim());
  }
  [campoData, campoHorario, campoResponsavel].forEach(c => c.addEventListener('input', validar));
  validar();

  botaoContinuar.addEventListener('click', async () => {
    botaoContinuar.disabled = true;
    botaoContinuar.textContent = 'Criando...';

    estado.data = campoData.value;
    estado.horarioInicio = campoHorario.value.trim();
    estado.responsavelVerificacao = campoResponsavel.value.trim();
    estado.verificacaoId = gerarId();

    try {
      const contagem = await contarFolhas(estado.empresa, estado.data);
      estado.folha = contagem + 1;
    } catch (e) {
      estado.folha = 1;
    }

    await criarVerificacao({
      id: estado.verificacaoId,
      empresa: estado.empresa,
      data: estado.data,
      horario_inicio: estado.horarioInicio,
      responsavel_verificacao: estado.responsavelVerificacao,
      folha: estado.folha,
      timestamp_criacao: new Date().toISOString()
    });

    estado.etapa = 'formulario';
    salvarEstado(estado);
  });

  container.appendChild(div);
}

/* ---------- Etapa: formulário (itens + temperatura + finalização) ---------- */

function renderFormulario(container, estado, salvarEstado) {
  // Trilha de progresso
  const trilha = document.createElement('div');
  trilha.className = 'trilha-progresso';
  trilha.innerHTML = estado.itens.map(item => {
    const classe = item.status === 'C' ? 'trilha-progresso__ponto--conforme'
      : item.status === 'NC' ? 'trilha-progresso__ponto--nao-conforme' : '';
    return `<div class="trilha-progresso__ponto ${classe}"></div>`;
  }).join('');
  container.appendChild(trilha);

  const div = document.createElement('div');
  div.className = 'conteudo';

  const cabecalhoInfo = document.createElement('div');
  cabecalhoInfo.style.marginBottom = '16px';
  cabecalhoInfo.style.color = 'var(--cor-texto-suave)';
  cabecalhoInfo.style.fontSize = '13px';
  cabecalhoInfo.textContent = `${estado.empresa} · ${formatarDataBR(estado.data)} · ${estado.horarioInicio} · Folha ${estado.folha} · ${estado.responsavelVerificacao}`;
  div.appendChild(cabecalhoInfo);

  div.appendChild(montarSecaoDocumento(estado, salvarEstado));

  // Cartões de item
  estado.itens.forEach(item => {
    div.appendChild(montarCartaoItem(item, estado, salvarEstado));
  });

  // Seção de temperatura
  div.appendChild(montarSecaoTemperatura(estado, salvarEstado));

  // Seção de finalização
  div.appendChild(montarSecaoFinalizacao(estado, salvarEstado));

  container.appendChild(div);
}

function formatarDataBR(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function montarSecaoDocumento(estado, salvarEstado) {
  const secao = document.createElement('div');
  secao.className = 'cartao-item';
  secao.style.marginBottom = '16px';

  if (estado.documentoAnexado) {
    secao.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;color:var(--cor-conforme);font-weight:600;font-size:14px;">
        ✓ Documento original anexado
      </div>
    `;
    return secao;
  }

  secao.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Documento original (opcional)</div>
    <p style="font-size:13px;color:var(--cor-texto-suave);margin-bottom:12px;">Anexe o PDF da vistoria em papel/exportada, se houver.</p>
    <button class="botao botao--secundario botao--bloco" id="botao-anexar-documento">Anexar PDF</button>
    <input type="file" accept="application/pdf" style="display:none" id="input-documento" />
  `;

  const botao = secao.querySelector('#botao-anexar-documento');
  const input = secao.querySelector('#input-documento');

  botao.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const arquivo = input.files[0];
    if (!arquivo) return;

    botao.disabled = true;
    botao.textContent = 'Enviando...';

    try {
      const base64 = await arquivoGenericoParaBase64(arquivo);
      await anexarDocumento({
        verificacao_id: estado.verificacaoId,
        empresa: estado.empresa,
        data: estado.data,
        nomeArquivo: arquivo.name,
        arquivoBase64: base64
      });
      estado.documentoAnexado = true;
      salvarEstado(estado);
    } catch (e) {
      botao.disabled = false;
      botao.textContent = 'Anexar PDF';
      alert('Não foi possível anexar o documento. Tente novamente.');
    }
  });

  return secao;
}

function montarCartaoItem(item, estado, salvarEstado) {
  const cartao = document.createElement('div');
  cartao.className = 'cartao-item';

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
  `;

  if (item.status === 'NC') {
    const detalhe = document.createElement('div');
    detalhe.className = 'cartao-item__detalhe';
    detalhe.innerHTML = `
      <textarea rows="3" placeholder="Descreva a não conformidade...">${item.descricao}</textarea>
      <div class="cartao-item__fotos">
        ${item.fotosPreview.map(src => `<img class="cartao-item__foto" src="${src}" />`).join('')}
        <button class="botao-anexar-foto">+</button>
      </div>
      <input type="file" accept="image/*" capture="environment" style="display:none" />
    `;

    const textarea = detalhe.querySelector('textarea');
    textarea.addEventListener('blur', async () => {
      item.descricao = textarea.value;
      await salvarItem({
        verificacao_id: estado.verificacaoId,
        numero_item: item.numero,
        nome_item: item.nome,
        descricao: item.descricao,
        empresa: estado.empresa,
        data: estado.data
      });
    });

    const botaoAnexar = detalhe.querySelector('.botao-anexar-foto');
    const inputFile = detalhe.querySelector('input[type="file"]');
    botaoAnexar.addEventListener('click', () => inputFile.click());
    inputFile.addEventListener('change', async () => {
      const arquivo = inputFile.files[0];
      if (!arquivo) return;
      const base64 = await arquivoParaBase64(arquivo);
      item.fotosPreview.push(base64);
      salvarEstado(estado);
      await salvarItem({
        verificacao_id: estado.verificacaoId,
        numero_item: item.numero,
        nome_item: item.nome,
        empresa: estado.empresa,
        data: estado.data,
        fotosBase64: [base64]
      });
    });

    cartao.appendChild(detalhe);
  }

  cartao.querySelectorAll('[data-status]').forEach(botao => {
    botao.addEventListener('click', async () => {
      item.status = botao.dataset.status;
      salvarEstado(estado);
      await salvarItem({
        verificacao_id: estado.verificacaoId,
        numero_item: item.numero,
        nome_item: item.nome,
        status: item.status,
        empresa: estado.empresa,
        data: estado.data
      });
    });
  });

  return cartao;
}

function montarSecaoTemperatura(estado, salvarEstado) {
  const secao = document.createElement('div');
  secao.style.marginTop = '24px';
  secao.innerHTML = `<h3 style="margin-bottom:12px;">Temperatura das câmaras</h3>`;

  const listaLinhas = document.createElement('div');
  estado.temperaturas.forEach(linha => {
    listaLinhas.appendChild(montarLinhaTemperatura(linha, estado, salvarEstado));
  });
  secao.appendChild(listaLinhas);

  const botaoAdicionar = document.createElement('button');
  botaoAdicionar.className = 'botao botao--secundario botao--bloco';
  botaoAdicionar.textContent = '+ Adicionar câmara';
  botaoAdicionar.addEventListener('click', () => {
    estado.temperaturas.push({ linha_id: gerarId(), identificacao: '', temperatura: '' });
    salvarEstado(estado);
  });
  secao.appendChild(botaoAdicionar);

  return secao;
}

function montarLinhaTemperatura(linha, estado, salvarEstado) {
  const div = document.createElement('div');
  div.className = 'linha-temperatura';
  div.innerHTML = `
    <input type="text" placeholder="Câmara (ex: Câmara 1)" value="${linha.identificacao}" data-campo="identificacao" />
    <input type="text" placeholder="°C" value="${linha.temperatura}" data-campo="temperatura" style="max-width:100px;" />
    <button class="linha-temperatura__remover">×</button>
  `;

  const salvar = async () => {
    await salvarTemperatura({
      verificacao_id: estado.verificacaoId,
      linha_id: linha.linha_id,
      identificacao: linha.identificacao,
      temperatura: linha.temperatura
    });
  };

  div.querySelector('[data-campo="identificacao"]').addEventListener('blur', e => {
    linha.identificacao = e.target.value;
    salvar();
  });
  div.querySelector('[data-campo="temperatura"]').addEventListener('blur', e => {
    linha.temperatura = e.target.value;
    salvar();
  });
  div.querySelector('.linha-temperatura__remover').addEventListener('click', async () => {
    estado.temperaturas = estado.temperaturas.filter(l => l.linha_id !== linha.linha_id);
    salvarEstado(estado);
    await removerTemperatura(estado.verificacaoId, linha.linha_id);
  });

  return div;
}

function montarSecaoFinalizacao(estado, salvarEstado) {
  const secao = document.createElement('div');
  secao.style.marginTop = '24px';
  secao.innerHTML = `
    <h3 style="margin-bottom:12px;">Finalização</h3>
    <div class="campo">
      <label>Responsável pela auditoria</label>
      <input type="text" id="campo-resp-auditoria" placeholder="Nome" value="${estado.responsavelAuditoria}" />
    </div>
    <div class="campo">
      <label>Responsável pela empresa</label>
      <input type="text" id="campo-resp-empresa" placeholder="Nome" value="${estado.responsavelEmpresa}" />
    </div>
    <button class="botao botao--primario botao--bloco" id="botao-finalizar">Confirmar e finalizar</button>
  `;

  const campoAuditoria = secao.querySelector('#campo-resp-auditoria');
  const campoEmpresa = secao.querySelector('#campo-resp-empresa');
  const botaoFinalizar = secao.querySelector('#botao-finalizar');

  botaoFinalizar.addEventListener('click', async () => {
    estado.responsavelAuditoria = campoAuditoria.value.trim();
    estado.responsavelEmpresa = campoEmpresa.value.trim();

    if (!estado.responsavelAuditoria || !estado.responsavelEmpresa) {
      alert('Preencha os dois responsáveis para finalizar.');
      return;
    }

    const itensNaoPreenchidos = estado.itens.filter(i => !i.status);
    if (itensNaoPreenchidos.length > 0) {
      const confirmar = confirm(`${itensNaoPreenchidos.length} item(ns) ainda não foram marcados como C ou NC. Deseja finalizar mesmo assim?`);
      if (!confirmar) return;
    }

    botaoFinalizar.disabled = true;
    botaoFinalizar.textContent = 'Finalizando...';

    await finalizarVerificacao({
      verificacao_id: estado.verificacaoId,
      responsavel_auditoria: estado.responsavelAuditoria,
      responsavel_empresa: estado.responsavelEmpresa,
      confirmado_em: new Date().toISOString()
    });

    estado.etapa = 'concluido';
    salvarEstado(estado);
  });

  return secao;
}

/* ---------- Etapa: concluído ---------- */

function renderConcluido(container, irParaHistorico) {
  const div = document.createElement('div');
  div.className = 'conteudo';
  div.innerHTML = `
    <div class="estado-vazio">
      <h2 style="color:var(--cor-conforme);margin-bottom:8px;">Verificação concluída</h2>
      <p style="margin-bottom:24px;">Os dados foram salvos com sucesso.</p>
      <button class="botao botao--primario" id="botao-ver-historico">Ver histórico</button>
    </div>
  `;
  div.querySelector('#botao-ver-historico').addEventListener('click', irParaHistorico);
  container.appendChild(div);
}
