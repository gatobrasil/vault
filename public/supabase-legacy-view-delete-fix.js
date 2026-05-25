// ============================================================
// VOZIA — Correção: visualizar mensagem familiar + exclusão admin
// NÃO mexe no login/cadastro/painel.
// ============================================================

(function () {
  function $(id) { return document.getElementById(id); }

  const LEGACY_BUCKETS = [
    "legacy-audios",
    "áudios legados",
    "audios legados",
    "áudios-legados",
    "audios-legados"
  ];

  function sb() {
    return window.voziaSupabase || (typeof iniciarSupabase === "function" ? iniciarSupabase() : null);
  }

  function esc(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escAttr(text) {
    return String(text ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'")
      .replaceAll('"', "&quot;");
  }

  async function signedLegacyUrl(path) {
    if (!path) return "";

    const supa = sb();
    if (!supa) throw new Error("Supabase não configurado.");

    const errors = [];

    for (const bucket of LEGACY_BUCKETS) {
      const { data, error } = await supa.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60);

      if (!error && data?.signedUrl) return data.signedUrl;

      errors.push(`${bucket}: ${error?.message || "sem URL"}`);
    }

    throw new Error("Não encontrei o áudio da mensagem. " + errors.join(" | "));
  }

  async function listLegacyMessages() {
    const supa = sb();
    if (!supa) throw new Error("Supabase não configurado.");

    if (typeof voziaListLegacyMessages === "function") {
      return await voziaListLegacyMessages();
    }

    const { data, error } = await supa
      .from("legacy_messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function renderLegacyMessagesFixed() {
    const box = $("legacyList");
    if (!box) return;

    try {
      const rows = await listLegacyMessages();

      if (!rows.length) {
        box.innerHTML = "<p class='small'>Nenhuma mensagem de legado gravada ainda.</p>";
        return;
      }

      const parts = [];

      for (const m of rows) {
        const title = m.title || "Mensagem para família";
        const note = m.note || m.text_note || "";
        const recipient = m.recipient || "";
        const duration = Math.round((m.duration_ms || 0) / 1000);
        const created = m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : "";
        let audioHtml = "";

        if (m.audio_path || m.file_path) {
          try {
            const url = m.audio_path
              ? await signedLegacyUrl(m.audio_path)
              : m.file_path;

            audioHtml = `
              <audio controls preload="metadata" src="${escAttr(url)}" style="width:100%;margin-top:10px;"></audio>
              <div class="actions" style="margin-top:8px;">
                <a class="ghost" href="${escAttr(url)}" target="_blank" rel="noopener">Abrir áudio</a>
              </div>
            `;
          } catch (e) {
            audioHtml = `
              <div class="msg" style="display:block;margin-top:10px;">
                Áudio salvo, mas não consegui gerar link para ouvir. Detalhe: ${esc(e.message || "erro")}
              </div>
            `;
          }
        } else {
          audioHtml = `<p class="small">Mensagem sem áudio vinculado.</p>`;
        }

        parts.push(`
          <div class="legacyItem">
            <b>${m.is_priority ? "⭐ PRIORITÁRIA — " : ""}${esc(title)}</b>
            <p class="small">
              ${recipient ? "Para: " + esc(recipient) + " • " : ""}
              ${esc(note)} ${duration ? " • " + duration + "s" : ""} ${created ? " • " + created : ""}
            </p>
            ${audioHtml}
            <div class="actions">
              <button class="ghost" type="button" onclick="window.voziaSetPriorityLegacyFixed('${escAttr(m.id)}')">Definir como prioritária</button>
              <button class="ghost" type="button" onclick="window.voziaDeleteLegacyFixed('${escAttr(m.id)}')">Apagar</button>
            </div>
          </div>
        `);
      }

      box.innerHTML = parts.join("");
    } catch (e) {
      box.innerHTML = `<div class="msg" style="display:block;">Erro ao carregar mensagens: ${esc(e.message || "erro")}</div>`;
    }
  }

  window.voziaRenderLegacyMessagesFixed = renderLegacyMessagesFixed;

  window.voziaSetPriorityLegacyFixed = async function (id) {
    try {
      const supa = sb();
      if (!supa) throw new Error("Supabase não configurado.");

      const user = typeof voziaGetUser === "function" ? await voziaGetUser() : null;

      if (user) {
        await supa.from("legacy_messages").update({ is_priority: false }).eq("user_id", user.id);
      }

      const { error } = await supa
        .from("legacy_messages")
        .update({ is_priority: true })
        .eq("id", id);

      if (error) throw error;

      await renderLegacyMessagesFixed();
    } catch (e) {
      alert(e.message || "Erro ao definir prioridade.");
    }
  };

  window.voziaDeleteLegacyFixed = async function (id) {
    if (!confirm("Apagar mensagem de legado?")) return;

    try {
      const supa = sb();
      if (!supa) throw new Error("Supabase não configurado.");

      const { error } = await supa
        .from("legacy_messages")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await renderLegacyMessagesFixed();
    } catch (e) {
      alert(e.message || "Erro ao apagar mensagem.");
    }
  };

  function showDeleteMsg(text, ok = false) {
    const el = $("deleteMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "msg" + (ok ? " ok" : "");
    el.style.display = "block";
  }

  async function submitDeletionRequest(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    try {
      const supa = sb();
      if (!supa) throw new Error("Supabase não configurado.");

      const user = typeof voziaGetUser === "function" ? await voziaGetUser() : null;
      if (!user) throw new Error("Usuário não autenticado.");

      const reason = $("deleteReason")?.value?.trim() || "";

      const { error } = await supa.from("deletion_requests").insert({
        user_id: user.id,
        reason,
        status: "pendente"
      });

      if (error) throw error;

      if ($("deleteReason")) $("deleteReason").value = "";
      showDeleteMsg("Solicitação de exclusão enviada para análise.", true);

      await renderDeletionRequestsFixed();
    } catch (e) {
      showDeleteMsg(e.message || "Erro ao solicitar exclusão.");
    }
  }

  async function renderDeletionRequestsFixed() {
    const box = $("deleteRequestList");
    if (!box) return;

    try {
      const supa = sb();
      if (!supa) throw new Error("Supabase não configurado.");

      const { data, error } = await supa
        .from("deletion_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      box.innerHTML = (data || []).map(r => `
        <div class="requestItem">
          <b>Exclusão solicitada</b>
          <span class="status">${esc(r.status || "pendente")}</span>
          <p class="small">${esc(r.reason || "")} • ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}</p>
          ${r.decision_note ? `<p class="small">Decisão: ${esc(r.decision_note)}</p>` : ""}
        </div>
      `).join("") || "<p class='small'>Nenhuma solicitação de exclusão enviada.</p>";
    } catch (e) {
      box.innerHTML = `<div class="msg" style="display:block;">Erro ao carregar solicitações: ${esc(e.message || "erro")}</div>`;
    }
  }

  async function renderAdminDeletionRequests() {
    const adminArea = $("adminArea");
    if (!adminArea) return;

    let box = $("adminDeletionRequestsBox");
    if (!box) {
      box = document.createElement("section");
      box.id = "adminDeletionRequestsBox";
      box.className = "card";
      box.innerHTML = `
        <h2>Solicitações de exclusão</h2>
        <p class="small">Pedidos enviados pelos pacientes para análise administrativa.</p>
        <div id="adminDeletionRequestsList"></div>
      `;
      adminArea.appendChild(box);
    }

    const list = $("adminDeletionRequestsList");

    try {
      const supa = sb();
      if (!supa) throw new Error("Supabase não configurado.");

      const { data, error } = await supa
        .from("deletion_requests")
        .select("*, profiles(name,email)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      list.innerHTML = (data || []).map(r => {
        const p = r.profiles || {};
        return `
          <div class="dataItem">
            <b>${esc(p.name || "Paciente")} — ${esc(p.email || r.user_id || "")}</b>
            <p class="small">
              Status: ${esc(r.status || "pendente")}<br>
              Motivo: ${esc(r.reason || "")}<br>
              Criado em: ${r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""}
            </p>
          </div>
        `;
      }).join("") || "<p class='small'>Nenhuma solicitação de exclusão.</p>";
    } catch (e) {
      list.innerHTML = `<div class="msg" style="display:block;">Erro ao carregar exclusões: ${esc(e.message || "erro")}</div>`;
    }
  }

  function connect() {
    const deleteBtn = $("deleteRequestBtn");
    if (deleteBtn && !deleteBtn.dataset.supabaseDeleteFix) {
      deleteBtn.dataset.supabaseDeleteFix = "1";
      deleteBtn.addEventListener("click", submitDeletionRequest, true);
    }

    const legacyBox = $("legacyList");
    if (legacyBox && !legacyBox.dataset.supabaseLegacyFix) {
      legacyBox.dataset.supabaseLegacyFix = "1";
      setTimeout(renderLegacyMessagesFixed, 250);
    }

    if ($("adminArea")) {
      setTimeout(renderAdminDeletionRequests, 800);
      setTimeout(renderAdminDeletionRequests, 1800);
    }
  }

  // Quando salvar uma mensagem, renderiza a lista novamente.
  function wrapLegacySave() {
    if (typeof voziaSaveLegacyMessage !== "function") return;
    if (voziaSaveLegacyMessage.__legacyViewWrapped) return;

    const original = voziaSaveLegacyMessage;
    window.voziaSaveLegacyMessage = async function (...args) {
      const result = await original.apply(this, args);
      setTimeout(renderLegacyMessagesFixed, 500);
      setTimeout(renderLegacyMessagesFixed, 1300);
      return result;
    };
    window.voziaSaveLegacyMessage.__legacyViewWrapped = true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    wrapLegacySave();
    connect();
    setTimeout(connect, 800);
    setTimeout(renderLegacyMessagesFixed, 1200);
    setTimeout(renderDeletionRequestsFixed, 1300);
  });

  document.addEventListener("click", () => {
    setTimeout(() => {
      wrapLegacySave();
      connect();
      renderLegacyMessagesFixed();
      renderDeletionRequestsFixed();
      renderAdminDeletionRequests();
    }, 300);
  }, true);

  window.voziaLegacyDeleteFixConnect = connect;
})();
