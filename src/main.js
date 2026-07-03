import { criarEstadoInicial, montarTelaNovaVerificacao } from './telaNovaVerificacao.js';

const appEl = document.getElementById('app');

let estado = criarEstadoInicial();

function render() {
  appEl.innerHTML = '';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'cabecalho-app';
  cabecalho.innerHTML = `
    <div class="cabecalho-app__marca">Mamma Mia · R&L Qualidade</div>
    <div class="cabecalho-app__titulo">Verificação Técnica Operacional</div>
  `;
  appEl.appendChild(cabecalho);

  const containerTela = document.createElement('div');
  appEl.appendChild(containerTela);

  montarTelaNovaVerificacao(containerTela, estado, salvarEstado, irParaHistorico);
}

function salvarEstado(novoEstado) {
  estado = novoEstado;
  render();
}

function irParaHistorico() {
  // Etapa 5 (tela de histórico) ainda será implementada.
  // Por enquanto, inicia uma nova verificação.
  estado = criarEstadoInicial();
  render();
}

render();
