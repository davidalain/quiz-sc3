/* Motor do quiz online (MobLab 2.0 · Subcurso 3).
 *
 * Lê window.QUIZ (perguntas.js da pasta do quiz, sem o gabarito) e window.QUIZ_CONFIG.endpoint
 * (config.js da raiz do site: URL do aplicativo da web do Apps Script).
 * Etapas: nome → perguntas (uma por tela) → revisão → envio → resultado.
 * A nota é calculada no servidor, que grava a linha na planilha e devolve o resultado.
 */
(function () {
  'use strict';

  var Q = window.QUIZ;
  var ENDPOINT = ((window.QUIZ_CONFIG || {}).endpoint || '').trim();
  var N = Q.perguntas.length;
  var CHAVE = 'quiz-mobweb-' + Q.id;
  var app = document.getElementById('app');
  var barra = document.getElementById('barra');
  var contador = document.getElementById('contador');

  function novoId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function estadoInicial() {
    var r = [];
    for (var i = 0; i < N; i++) r.push(null);
    return { etapa: 'nome', nome: '', respostas: r, atual: 0, envio: novoId(), resultado: null, erro: '' };
  }
  function carregar() {
    try {
      var s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (s && s.respostas && s.respostas.length === N) return s;
    } catch (e) { /* armazenamento indisponível */ }
    return null;
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(st)); } catch (e) { /* segue sem salvar */ }
  }

  var st = carregar() || estadoInicial();
  if (st.etapa === 'enviando') st.etapa = 'revisao';   // recarregou no meio do envio

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function respondidas() {
    return st.respostas.filter(function (r) { return r; }).length;
  }
  function progresso(frac, texto) {
    barra.style.width = Math.round(frac * 100) + '%';
    contador.textContent = texto;
  }
  function ir(etapa) {
    st.etapa = etapa;
    salvar();
    render();
    window.scrollTo(0, 0);
  }

  // ---------- etapas ----------

  function telaNome() {
    progresso(0, N + ' perguntas');
    app.innerHTML =
      '<p class="rotulo">' + esc(Q.rotulo) + '</p>' +
      '<h1>' + esc(Q.titulo) + '</h1>' +
      '<p class="sub">' + esc(Q.descricao) + '</p>' +
      '<form id="form-nome" novalidate>' +
      '<label class="campo" for="nome">Nome completo</label>' +
      '<input type="text" id="nome" name="nome" autocomplete="name" maxlength="120" required>' +
      '<p class="aviso" id="aviso-nome" role="alert"></p>' +
      '<div class="acoes"><span></span><button class="botao" type="submit">Começar</button></div>' +
      '</form>';
    var campo = document.getElementById('nome');
    campo.value = st.nome;
    campo.focus();
    document.getElementById('form-nome').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var nome = campo.value.trim().replace(/\s+/g, ' ');
      if (nome.split(' ').length < 2) {
        document.getElementById('aviso-nome').textContent = 'Digite o nome completo, com nome e sobrenome.';
        campo.focus();
        return;
      }
      st.nome = nome;
      st.atual = 0;
      ir('pergunta');
    });
  }

  function telaPergunta() {
    var i = st.atual;
    var p = Q.perguntas[i];
    var escolhida = st.respostas[i];
    progresso(respondidas() / N, 'Pergunta ' + (i + 1) + ' de ' + N);
    var ops = p.alternativas.map(function (a) {
      var marcada = a.letra === escolhida;
      return '<button type="button" class="opcao" role="radio" aria-checked="' + marcada + '" data-letra="' + a.letra + '"' +
             ' tabindex="' + (marcada || (!escolhida && a.letra === 'A') ? '0' : '-1') + '">' +
             '<span class="letra">' + a.letra + '</span><span>' + a.html + '</span></button>';
    }).join('');
    var ultima = i === N - 1;
    app.innerHTML =
      '<p class="rotulo">Pergunta ' + (i + 1) + '</p>' +
      '<h2 id="enunciado">' + p.html + '</h2>' +
      '<div class="opcoes" role="radiogroup" aria-labelledby="enunciado">' + ops + '</div>' +
      '<div class="acoes">' +
      '<button class="botao secundario" type="button" id="voltar">' + (i === 0 ? 'Voltar ao nome' : 'Anterior') + '</button>' +
      '<button class="botao" type="button" id="seguir"' + (escolhida ? '' : ' disabled') + '>' +
      (ultima ? 'Revisar respostas' : 'Próxima') + '</button></div>' +
      '<p class="dica">Dica: use as teclas A, B, C ou D para escolher e Enter para seguir.</p>';

    var botoes = Array.prototype.slice.call(app.querySelectorAll('.opcao'));
    botoes.forEach(function (b) {
      b.addEventListener('click', function () { escolher(b.getAttribute('data-letra')); });
    });
    document.getElementById('voltar').addEventListener('click', function () {
      if (i === 0) { ir('nome'); } else { st.atual = i - 1; ir('pergunta'); }
    });
    document.getElementById('seguir').addEventListener('click', seguir);
    var foco = app.querySelector('.opcao[aria-checked="true"]') || botoes[0];
    if (foco) foco.focus();
  }

  function escolher(letra) {
    st.respostas[st.atual] = letra;
    salvar();
    Array.prototype.forEach.call(app.querySelectorAll('.opcao'), function (b) {
      var sim = b.getAttribute('data-letra') === letra;
      b.setAttribute('aria-checked', String(sim));
      b.tabIndex = sim ? 0 : -1;
      if (sim) b.focus();
    });
    document.getElementById('seguir').disabled = false;
    progresso(respondidas() / N, 'Pergunta ' + (st.atual + 1) + ' de ' + N);
  }

  function seguir() {
    if (!st.respostas[st.atual]) return;
    if (st.atual < N - 1) { st.atual += 1; ir('pergunta'); } else { ir('revisao'); }
  }

  function telaRevisao() {
    var faltam = N - respondidas();
    progresso(respondidas() / N, respondidas() + ' de ' + N + ' respondidas');
    var itens = st.respostas.map(function (r, i) {
      return '<button type="button" data-i="' + i + '"' + (r ? '' : ' class="vazia"') + '>' +
             'Pergunta ' + (i + 1) + ': <b>' + (r || '—') + '</b></button>';
    }).join('');
    app.innerHTML =
      '<p class="rotulo">Revisão</p>' +
      '<h2>Confira antes de enviar, ' + esc(st.nome.split(' ')[0]) + '</h2>' +
      '<p class="sub">Toque numa pergunta para mudar a resposta. Depois de enviar, não dá para alterar.</p>' +
      '<div class="revisao">' + itens + '</div>' +
      (faltam ? '<p class="aviso">Falta responder ' + faltam + (faltam === 1 ? ' pergunta.' : ' perguntas.') + '</p>' : '') +
      (st.erro ? '<p class="aviso" role="alert">' + esc(st.erro) + '</p>' : '') +
      '<div class="acoes">' +
      '<button class="botao secundario" type="button" id="voltar">Voltar às perguntas</button>' +
      '<button class="botao" type="button" id="enviar"' + (faltam ? ' disabled' : '') + '>Enviar respostas</button></div>';
    Array.prototype.forEach.call(app.querySelectorAll('.revisao button'), function (b) {
      b.addEventListener('click', function () { st.atual = Number(b.getAttribute('data-i')); ir('pergunta'); });
    });
    document.getElementById('voltar').addEventListener('click', function () {
      st.atual = Math.max(0, st.respostas.indexOf(null)); if (st.atual < 0) st.atual = 0; ir('pergunta');
    });
    document.getElementById('enviar').addEventListener('click', enviar);
  }

  function enviar() {
    if (!ENDPOINT || ENDPOINT.indexOf('http') !== 0) {
      st.erro = 'O quiz ainda não está ligado à planilha: falta configurar o endereço do servidor (config.js). Avise o professor.';
      ir('revisao');
      return;
    }
    st.erro = '';
    ir('enviando');
    // Corpo em texto puro: o navegador não faz a consulta prévia de CORS e o Apps Script aceita o envio.
    fetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ quiz: Q.id, nome: st.nome, respostas: st.respostas, envio: st.envio })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.erro) || 'O servidor recusou o envio.');
      st.resultado = res;
      ir('resultado');
    }).catch(function (err) {
      st.erro = 'Não foi possível enviar: ' + (err && err.message ? err.message : 'sem conexão') +
                ' As suas respostas continuam aqui; tente de novo.';
      ir('revisao');
    });
  }

  function telaEnviando() {
    progresso(1, 'Enviando…');
    app.innerHTML = '<p class="carregando">Enviando as suas respostas…</p>';
  }

  function telaResultado() {
    var r = st.resultado;
    progresso(1, 'Respostas registradas');
    var nota = (10 * r.acertos / r.total).toFixed(1).replace('.', ',');
    var lista = '';
    if (r.certo) {
      lista = '<h2>Correção</h2><ol class="lista">' + Q.perguntas.map(function (p, i) {
        var ok = r.certo[i];
        var marcada = st.respostas[i];
        var correta = r.corretas ? r.corretas[i] : null;
        return '<li class="' + (ok ? 'certa' : 'errada') + '"><span class="sinal" aria-label="' + (ok ? 'acertou' : 'errou') + '">' +
               (ok ? '✓' : '✗') + '</span><div>' + (i + 1) + '. ' + p.html +
               '<small>Sua resposta: ' + marcada + (ok || !correta ? '' : ' · Correta: ' + correta) + '</small></div></li>';
      }).join('') + '</ol>';
    }
    app.innerHTML =
      '<p class="rotulo">Respostas registradas</p>' +
      '<h1>Obrigado, ' + esc(st.nome.split(' ')[0]) + '!</h1>' +
      '<div class="placar"><strong>' + r.acertos + '/' + r.total + '</strong><span>acertos · nota ' + nota + '</span></div>' +
      '<p class="sub">As suas respostas foram salvas. Pode fechar esta página.</p>' + lista +
      '<div class="acoes"><span></span><button class="botao secundario" type="button" id="novo">' +
      'Outra pessoa vai responder neste aparelho</button></div>';
    document.getElementById('novo').addEventListener('click', function () {
      st = estadoInicial();
      ir('nome');
    });
  }

  function render() {
    ({ nome: telaNome, pergunta: telaPergunta, revisao: telaRevisao, enviando: telaEnviando, resultado: telaResultado }[st.etapa] || telaNome)();
  }

  document.addEventListener('keydown', function (ev) {
    if (st.etapa !== 'pergunta' || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var k = ev.key.toUpperCase();
    if (['A', 'B', 'C', 'D'].indexOf(k) >= 0) { ev.preventDefault(); escolher(k); }
    else if (['1', '2', '3', '4'].indexOf(k) >= 0) { ev.preventDefault(); escolher('ABCD'[Number(k) - 1]); }
    else if (k === 'ENTER' && !(ev.target && ev.target.classList && ev.target.classList.contains('botao'))) { ev.preventDefault(); seguir(); }
  });

  render();
})();
