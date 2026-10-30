// Interações de Interface (UI) - Guia do Turista Inteligente

/**
 * Alterna a visibilidade dos detalhes do cartão (Accordion)
 * @param {string} id - Identificador do cartão de viagem
 * @param {Event} event - Evento de clique
 */
function alternarCard(id, event) {
  // Ignora se o clique veio de botões de ação ou links
  if (event && event.target && event.target.closest(".btn-actions, .btn, button, a, form, input")) {
    return;
  }

  const container = document.getElementById(`detalhes-${id}`);
  const indicador = document.getElementById(`indicador-${id}`);
  if (!container) return;

  const estaOculto = container.classList.contains("hidden");
  if (estaOculto) {
    container.classList.remove("hidden");
    if (indicador) {
      indicador.innerText = "▲";
      indicador.classList.add("ativo");
    }
  } else {
    container.classList.add("hidden");
    if (indicador) {
      indicador.innerText = "▼";
      indicador.classList.remove("ativo");
    }
  }
}

/**
 * Prevenção de múltiplos cliques, feedback visual e recuperação automática do botão
 */
let submetido = false;
let timerSeguranca = null;

function resetarEstadoBotao() {
  submetido = false;
  if (timerSeguranca) {
    clearTimeout(timerSeguranca);
    timerSeguranca = null;
  }
  const btn = document.getElementById("btnGerarGuia");
  if (btn) {
    btn.disabled = false;
    btn.innerText = "Gerar Guia com APIs & IA (Python)";
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  }
}

// Garante que o botão seja liberado em caso de restauração de cache (BFCache / Navegação)
window.addEventListener("pageshow", resetarEstadoBotao);
window.addEventListener("load", resetarEstadoBotao);

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("formCriarViagem");

  if (form) {
    form.addEventListener("submit", function (e) {
      // Se os campos obrigatórios não foram preenchidos, não trava o botão
      if (!form.checkValidity()) {
        return;
      }

      if (submetido) {
        // Bloqueia cliques duplos rápidos
        e.preventDefault();
        return false;
      }

      submetido = true;
      const btn = document.getElementById("btnGerarGuia");
      if (btn) {
        btn.disabled = true;
        btn.innerText = "⏳ Consultando APIs e Gemini AI...";
        btn.style.opacity = "0.75";
        btn.style.cursor = "not-allowed";
      }

      // Timer de segurança: se a rede ou servidor demorar mais de 12 segundos, libera o botão
      timerSeguranca = setTimeout(function () {
        resetarEstadoBotao();
      }, 12000);
    });
  }
});
